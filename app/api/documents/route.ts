import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getClientId, rateLimit } from "@/lib/rate-limit"

const sanitizeHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "")

export async function GET(req: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to load documents." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }

    const clientId = getClientId(req)
    const rl = rateLimit({
      key: `load-documents:${session.user.id}:${clientId}`,
      limit: 120,
      windowMs: 60_000,
    })
    if (!rl.ok) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds ?? 60),
          "Cache-Control": "no-store",
        },
      })
    }

    const docs = await prisma.document.findMany({
      where: { userId: session.user.id as string },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    })

    return NextResponse.json(
      docs.map((doc) => ({
        id: doc.id,
        title: doc.title,
        updatedAt: doc.updatedAt.getTime(),
      })),
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to load documents", error)
    return NextResponse.json(
      { error: "Failed to load documents" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to create documents." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }

    const clientId = getClientId(req)
    const rl = rateLimit({
      key: `create-document:${session.user.id}:${clientId}`,
      limit: 30,
      windowMs: 60_000,
    })
    if (!rl.ok) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds ?? 60),
          "Cache-Control": "no-store",
        },
      })
    }

    let data: unknown = {}
    try {
      data = await req.json()
    } catch {
      // Allow empty body.
    }

    const body = data as { title?: unknown; contentHtml?: unknown }
    const title =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim().slice(0, 160)
        : "Untitled Document"
    const contentHtml =
      typeof body.contentHtml === "string"
        ? sanitizeHtml(body.contentHtml.slice(0, 300_000))
        : `<h2>Highlights</h2><ul><li>Write bullet points</li><li>Use <strong>bold</strong> for important words</li><li>Add headings with H1 / H2</li></ul>`

    const document = await prisma.document.create({
      data: {
        title,
        contentHtml,
        userId: session.user.id as string,
      },
      select: { id: true, title: true, contentHtml: true, updatedAt: true },
    })

    return NextResponse.json(
      {
        id: document.id,
        title: document.title,
        contentHtml: document.contentHtml ?? "",
        updatedAt: document.updatedAt.getTime(),
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to create document", error)
    return NextResponse.json(
      { error: "Failed to create document" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
