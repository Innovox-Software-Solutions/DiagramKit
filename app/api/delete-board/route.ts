import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getClientId, rateLimit } from "@/lib/rate-limit"

const isMongoObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value)

export async function POST(req: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to delete boards." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }

    const clientId = getClientId(req)
    const rl = rateLimit({
      key: `delete-board:${session.user.id}:${clientId}`,
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

    const body = data as { boardId?: unknown }
    const boardId = typeof body.boardId === "string" ? body.boardId.trim() : ""

    if (!boardId || !isMongoObjectId(boardId)) {
      return NextResponse.json(
        { error: "Invalid board id" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const deleted = await prisma.board.deleteMany({
      where: {
        id: boardId,
        userId: session.user.id as string,
      },
    })

    return NextResponse.json(
      { success: true, deleted: deleted.count },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to delete board", error)
    return NextResponse.json(
      { error: "Failed to delete board" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
