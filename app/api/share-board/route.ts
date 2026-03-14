import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getClientId, rateLimit } from "@/lib/rate-limit"

const isMongoObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value)

const makeShareId = () => crypto.randomBytes(9).toString("base64url")

const getBaseUrl = (req: Request) => {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim()
  if (envBase) return envBase.replace(/\/$/, "")

  const incoming = new URL(req.url)
  return `${incoming.protocol}//${incoming.host}`
}

export async function POST(req: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to share boards." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }

    const clientId = getClientId(req)
    const rl = rateLimit({
      key: `share-board:${session.user.id}:${clientId}`,
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

    let data: unknown
    try {
      data = await req.json()
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const body = data as { boardId?: unknown; name?: unknown; shapes?: unknown }
    const boardId = typeof body.boardId === "string" ? body.boardId.trim() : ""
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const shapes = body.shapes

    if (!shapes) {
      return NextResponse.json(
        { error: "Missing required field: shapes" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const safeName = name.length > 0 ? name.slice(0, 80) : "Untitled Board"

    let board: { id: string; shareId: string | null } | null = null

    if (boardId && isMongoObjectId(boardId)) {
      const existing = await prisma.board.findFirst({
        where: {
          id: boardId,
          userId: session.user.id as string,
        },
        select: { id: true },
      })

      if (existing) {
        const nextShareId = makeShareId()

        board = await prisma.board.update({
          where: { id: existing.id },
          data: {
            name: safeName,
            shapes,
            isPublic: true,
            shareId: nextShareId,
          },
          select: { id: true, shareId: true },
        })
      }
    }

    if (!board) {
      const generatedShareId = makeShareId()

      board = await prisma.board.create({
        data: {
          name: safeName,
          shapes,
          userId: session.user.id as string,
          shareId: generatedShareId,
          isPublic: true,
        },
        select: { id: true, shareId: true },
      })
    }

    const baseUrl = getBaseUrl(req)
    const shareUrl = `${baseUrl}/c/${board.shareId}`

    return NextResponse.json(
      {
        success: true,
        boardId: board.id,
        shareId: board.shareId,
        shareUrl,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to create share link", error)
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
