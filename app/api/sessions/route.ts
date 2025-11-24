import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const guestId = searchParams.get('guestId');

        if (!guestId) {
            return NextResponse.json({ error: 'Guest ID is required' }, { status: 400 });
        }

        const result = await pool.query(
            'SELECT id, session_name, created_at FROM sessions WHERE guest_id = $1 ORDER BY created_at DESC',
            [guestId]
        );

        return NextResponse.json({ sessions: result.rows });
    } catch (error) {
        console.error('Error fetching sessions:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
