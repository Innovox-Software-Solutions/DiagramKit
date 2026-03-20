import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getClientId, rateLimit } from "@/lib/rate-limit"

const isMongoObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value)
const sanitizeHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "")

type Params = {
  params: Promise<{ docId: string }>
}

export async function GET(req: Request, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to load documents." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }

    const { docId } = await params
    const normalizedDocId = typeof docId === "string" ? docId.trim() : ""
    if (!isMongoObjectId(normalizedDocId)) {
      return NextResponse.json(
        { error: "Invalid document id" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const clientId = getClientId(req)
    const rl = rateLimit({
      key: `load-document:${session.user.id}:${normalizedDocId}:${clientId}`,
      limit: 180,
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

    const document = await prisma.document.findFirst({
      where: { id: normalizedDocId, userId: session.user.id as string },
      select: { id: true, title: true, contentHtml: true, updatedAt: true },
    })

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      )
    }

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
    console.error("Failed to load document", error)
    return NextResponse.json(
      { error: "Failed to load document" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to save documents." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }

    const { docId } = await params
    const normalizedDocId = typeof docId === "string" ? docId.trim() : ""
    if (!isMongoObjectId(normalizedDocId)) {
      return NextResponse.json(
        { error: "Invalid document id" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const clientId = getClientId(req)
    const rl = rateLimit({
      key: `save-document:${session.user.id}:${normalizedDocId}:${clientId}`,
      limit: 60,
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

    let data: unknown
    try {
      data = await req.json()
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const body = data as { title?: unknown; contentHtml?: unknown }
    const nextTitle =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim().slice(0, 160)
        : "Untitled Document"
    const nextContentHtml =
      typeof body.contentHtml === "string"
        ? sanitizeHtml(body.contentHtml.slice(0, 300_000))
        : ""

    const updated = await prisma.document.updateMany({
      where: { id: normalizedDocId, userId: session.user.id as string },
      data: { title: nextTitle, contentHtml: nextContentHtml },
    })

    if (updated.count === 0) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      )
    }

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to save document", error)
    return NextResponse.json(
      { error: "Failed to save document" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to delete documents." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }

    const { docId } = await params
    const normalizedDocId = typeof docId === "string" ? docId.trim() : ""
    if (!isMongoObjectId(normalizedDocId)) {
      return NextResponse.json(
        { error: "Invalid document id" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const clientId = getClientId(req)
    const rl = rateLimit({
      key: `delete-document:${session.user.id}:${normalizedDocId}:${clientId}`,
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

    const deleted = await prisma.document.deleteMany({
      where: { id: normalizedDocId, userId: session.user.id as string },
    })

    if (deleted.count === 0) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      )
    }

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to delete document", error)
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
