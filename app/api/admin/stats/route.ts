import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel
    const [
      totalUsers,
      totalBoards,
      totalSessions,
      usersToday,
      usersThisWeek,
      usersThisMonth,
      boardsToday,
      boardsThisWeek,
      recentUsers,
      recentBoards,
      // Per-day user signups (last 7 days)
      dailySignupsRaw,
      // Per-day board creation (last 7 days)
      dailyBoardsRaw,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.board.count(),
      prisma.session.count(),
      prisma.user.count({
        where: { emailVerified: { gte: today } },
      }),
      prisma.user.count({
        where: { emailVerified: { gte: sevenDaysAgo } },
      }),
      prisma.user.count({
        where: { emailVerified: { gte: thirtyDaysAgo } },
      }),
      prisma.board.count({
        where: { createdAt: { gte: today } },
      }),
      prisma.board.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.user.findMany({
        take: 8,
        orderBy: { id: "desc" },
        select: { id: true, name: true, email: true, image: true },
      }),
      prisma.board.findMany({
        take: 8,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          updatedAt: true,
          user: { select: { name: true, email: true } },
        },
      }),
      // Daily signups — group by day (last 7 days)
      prisma.user.findMany({
        where: { emailVerified: { gte: sevenDaysAgo } },
        select: { emailVerified: true },
      }),
      prisma.board.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true },
      }),
    ]);

    // Build daily chart data
    const buildDailyMap = (records: { date: Date | null }[]) => {
      const map: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        map[key] = 0;
      }
      for (const r of records) {
        if (!r.date) continue;
        const key = new Date(r.date).toISOString().slice(0, 10);
        if (key in map) map[key]++;
      }
      return Object.entries(map).map(([date, count]) => ({ date, count }));
    };

    const dailySignups = buildDailyMap(
      dailySignupsRaw.map((u) => ({ date: u.emailVerified }))
    );
    const dailyBoards = buildDailyMap(
      dailyBoardsRaw.map((b) => ({ date: b.createdAt }))
    );

    // Average boards per user
    const avgBoardsPerUser = totalUsers > 0 ? +(totalBoards / totalUsers).toFixed(1) : 0;

    return NextResponse.json({
      totalUsers,
      totalBoards,
      totalSessions,
      usersToday,
      usersThisWeek,
      usersThisMonth,
      boardsToday,
      boardsThisWeek,
      avgBoardsPerUser,
      dailySignups,
      dailyBoards,
      recentUsers,
      recentBoards,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch admin stats" },
      { status: 500 }
    );
  }
}
