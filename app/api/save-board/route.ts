import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getClientId, rateLimit } from "@/lib/rate-limit"
import { encodeShapes } from "@/lib/board-serialization"

const isMongoObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value)

export async function POST(req: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to save boards." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }

    const clientId = getClientId(req)
    const rl = rateLimit({
      key: `save-board:${session.user.id}:${clientId}`,
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

    const contentLengthHeader = req.headers.get("content-length")
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : NaN
    if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
      return NextResponse.json(
        { error: "Payload too large" },
        { status: 413, headers: { "Cache-Control": "no-store" } },
      )
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

    if (Array.isArray(shapes) && shapes.length === 0) {
      return NextResponse.json(
        { success: true, skipped: "empty" },
        { headers: { "Cache-Control": "no-store" } },
      )
    }

    const safeName = name.length > 0 ? name.slice(0, 80) : "Untitled Board"
    const shapesCompressed = encodeShapes(shapes)

    if (boardId && isMongoObjectId(boardId)) {
      const updated = await prisma.board.updateMany({
        where: {
          id: boardId,
          userId: session.user.id as string,
        },
        data: {
          name: safeName,
          shapes: [],
          shapesCompressed,
        },
      })

      if (updated.count > 0) {
        return NextResponse.json(
          { success: true, boardId },
          { headers: { "Cache-Control": "no-store" } },
        )
      }
    }

    // Create board in MongoDB
    const board = await prisma.board.create({
      data: {
        name: safeName,
        shapes: [],
        shapesCompressed,
        userId: session.user.id as string,
      },
    })

    return NextResponse.json(
      { success: true, boardId: board.id },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to save board", error)
    return NextResponse.json(
      { error: "Failed to save board" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
