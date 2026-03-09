import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getClientId, rateLimit } from "@/lib/rate-limit"

export async function GET(req: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to load boards." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }

    const clientId = getClientId(req)
    const rl = rateLimit({
      key: `load-board:${session.user.id}:${clientId}`,
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

    const url = new URL(req.url)
    const takeRaw = url.searchParams.get("take")
    const take =
      takeRaw && Number.isFinite(Number(takeRaw))
        ? Math.max(1, Math.min(100, Number(takeRaw)))
        : 50

    const boards = await prisma.board.findMany({
      where: { userId: session.user.id as string },
      orderBy: { updatedAt: "desc" },
      take,
    })

    return NextResponse.json(boards, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Failed to load board", error)
    return NextResponse.json(
      { error: "Failed to load board" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
