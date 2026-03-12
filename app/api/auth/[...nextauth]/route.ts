import { handlers } from "@/lib/auth"
import { getClientId, rateLimit } from "@/lib/rate-limit"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

function parseUrls(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function toHost(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

function getAllowedHosts(): Set<string> {
  const hosts = new Set<string>()

  for (const value of [process.env.AUTH_URL, process.env.NEXTAUTH_URL]) {
    if (!value) continue
    const host = toHost(value)
    if (host) hosts.add(host)
  }

  for (const value of parseUrls(process.env.APP_URLS)) {
    const host = toHost(value)
    if (host) hosts.add(host)
  }

  return hosts
}

function isSafeOriginForRequest(req: Request): boolean {
  const originHeader = req.headers.get("origin")
  if (!originHeader) return true

  const allowedHosts = getAllowedHosts()
  if (allowedHosts.size === 0) return true

  try {
    const originHost = new URL(originHeader).host
    return allowedHosts.has(originHost)
  } catch {
    return false
  }
}

function getRateLimitConfig(pathname: string): { limit: number; windowMs: number } {
  // Tighter limits around OAuth entrypoints.
  if (pathname.startsWith("/api/auth/signin") || pathname.startsWith("/api/auth/callback")) {
    return { limit: 10, windowMs: 60_000 }
  }
  return { limit: 60, windowMs: 60_000 }
}

async function guard(req: Request) {
  const url = new URL(req.url)
  const pathname = url.pathname

  if (process.env.NODE_ENV === "production") {
    const allowedHosts = getAllowedHosts()
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host")
    if (allowedHosts.size > 0 && host && !allowedHosts.has(host)) {
      return NextResponse.json({ error: "Invalid host" }, { status: 400 })
    }
  }

  if (req.method === "POST" && !isSafeOriginForRequest(req)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 })
  }

  const clientId = getClientId(req)
  const { limit, windowMs } = getRateLimitConfig(pathname)
  const bucketKey = `auth:${clientId}:${req.method}:${pathname}`
  const rl = rateLimit({ key: bucketKey, limit, windowMs })

  if (!rl.ok) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(rl.retryAfterSeconds ?? 60),
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(Math.ceil(rl.resetAtMs / 1000)),
        "Cache-Control": "no-store",
      },
    })
  }

  return null
}

export async function GET(req: NextRequest) {
  const blocked = await guard(req)
  if (blocked) return blocked
  return handlers.GET(req)
}

export async function POST(req: NextRequest) {
  const blocked = await guard(req)
  if (blocked) return blocked
  return handlers.POST(req)
}
