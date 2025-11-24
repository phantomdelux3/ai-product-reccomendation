import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { sessionId, messageId, productId, rating, reason, feedback_type, user_query } = body;

        if (!sessionId || !productId || !rating) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        await pool.query(
            `INSERT INTO feedback 
      (session_id, message_id, product_id, rating, reason, feedback_type, user_query) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [sessionId, messageId, productId, rating, reason, feedback_type, user_query]
        );

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error in feedback API:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
