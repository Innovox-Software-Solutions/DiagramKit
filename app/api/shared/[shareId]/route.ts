import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getClientId, rateLimit } from "@/lib/rate-limit"
import { safeDecodeShapes } from "@/lib/board-serialization"

type Params = {
  params: Promise<{ shareId: string }>
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { shareId } = await params
    const normalizedShareId = typeof shareId === "string" ? shareId.trim() : ""

    if (!normalizedShareId) {
      return NextResponse.json(
        { error: "Missing share id" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const clientId = getClientId(req)
    const rl = rateLimit({
      key: `shared-board:${normalizedShareId}:${clientId}`,
      limit: 240,
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

    const board = await prisma.board.findFirst({
      where: {
        shareId: normalizedShareId,
        isPublic: true,
      },
      select: {
        id: true,
        name: true,
        shapes: true,
        shapesCompressed: true,
        updatedAt: true,
      },
    })

    if (!board) {
      return NextResponse.json(
        { error: "Shared board not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      )
    }

    const boardRecord = board as unknown as { shapes: unknown; shapesCompressed?: string | null }
    const shapes = boardRecord.shapesCompressed
      ? (safeDecodeShapes(boardRecord.shapesCompressed) as unknown[])
      : (Array.isArray(boardRecord.shapes) ? boardRecord.shapes : [])

    return NextResponse.json(
      {
        id: board.id,
        name: board.name,
        shapes,
        updatedAt: board.updatedAt,
      },
      {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=120",
      },
      },
    )
  } catch (error) {
    console.error("Failed to load shared board", error)
    return NextResponse.json(
      { error: "Failed to load shared board" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
