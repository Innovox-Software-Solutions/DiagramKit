import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const session = await auth();
        
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized. Please sign in to load boards.' }, { status: 401 });
        }

        // Load all boards for the user from MongoDB
        const boards = await prisma.board.findMany({
            where: {
                userId: session.user.id as string,
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });

        return NextResponse.json(boards);
    } catch (error) {
        console.error('Failed to load board', error);
        return NextResponse.json({ error: 'Failed to load board' }, { status: 500 });
    }
}
