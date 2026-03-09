import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getClientIp, rateLimit } from "@/lib/rate-limit"

export async function POST(req: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to save boards." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }

    const ip = getClientIp(req)
    const rl = rateLimit({
      key: `save-board:${session.user.id}:${ip}`,
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

    const body = data as { name?: unknown; shapes?: unknown }
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const shapes = body.shapes

    if (!shapes) {
      return NextResponse.json(
        { error: "Missing required field: shapes" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const safeName = name.length > 0 ? name.slice(0, 80) : "Untitled Board"

    // Save board to MongoDB
    const board = await prisma.board.create({
      data: {
        name: safeName,
        shapes,
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
