import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
    try {
        const session = await auth();
        
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized. Please sign in to save boards.' }, { status: 401 });
        }

        const data = await req.json();
        const { name, shapes } = data;

        // Save board to MongoDB
        const board = await prisma.board.create({
            data: {
                name: name || 'Untitled Board',
                shapes: shapes,
                userId: session.user.id as string,
            },
        });

        return NextResponse.json({ success: true, boardId: board.id });
    } catch (error) {
        console.error('Failed to save board', error);
        return NextResponse.json({ error: 'Failed to save board' }, { status: 500 });
    }
}
