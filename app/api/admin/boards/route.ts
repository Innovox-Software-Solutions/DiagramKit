import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const boards = await prisma.board.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        shapes: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const userIds = Array.from(
      new Set(
        boards
          .map((board) => board.userId)
          .filter((userId): userId is string => typeof userId === "string" && userId.length > 0),
      ),
    );
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];

    const userById = new Map(users.map((user) => [user.id, user]));
    const boardsWithUsers = boards.map((board) => ({
      ...board,
      user: board.userId && userById.get(board.userId)
        ? {
            name: userById.get(board.userId)?.name ?? null,
            email: userById.get(board.userId)?.email ?? null,
          }
        : null,
    }));

    return NextResponse.json(boardsWithUsers);
  } catch (error) {
    console.error("Admin boards error:", error);
    return NextResponse.json({ error: "Failed to fetch boards" }, { status: 500 });
  }
}
