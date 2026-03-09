import { handlers } from "@/lib/auth"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

function getExpectedHost(): string | null {
  const url = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)?.trim()
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

function isSafeOriginForRequest(req: Request): boolean {
  const originHeader = req.headers.get("origin")
  if (!originHeader) return true

  const expectedHost = getExpectedHost()
  if (!expectedHost) return true

  try {
    const originHost = new URL(originHeader).host
    return originHost === expectedHost
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
    const expectedHost = getExpectedHost()
    const host = req.headers.get("host")
    if (expectedHost && host && host !== expectedHost) {
      return NextResponse.json({ error: "Invalid host" }, { status: 400 })
    }
  }

  if (req.method === "POST" && !isSafeOriginForRequest(req)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 })
  }

  const ip = getClientIp(req)
  const { limit, windowMs } = getRateLimitConfig(pathname)
  const bucketKey = `auth:${ip}:${req.method}:${pathname}`
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
