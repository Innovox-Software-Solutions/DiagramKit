import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { id: 'desc' }, // Recently created first (using ObjectID order)
      take: 50,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        // Using session count or similar or verification
      }
    });
    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
