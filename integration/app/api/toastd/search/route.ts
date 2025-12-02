/**
 * Toastd Search API Route (Next.js)
 * 
 * This route proxies requests to the Python FastAPI search server.
 * Copy to: app/api/toastd/search/route.ts in your Next.js project.
 */

import { NextResponse } from 'next/server';

const TOASTD_API_URL = process.env.TOASTD_API_URL || 'http://localhost:8001';

interface SearchRequest {
    query: string;
    limit?: number;
    priceMin?: number;
    priceMax?: number;
}

export async function POST(req: Request) {
    try {
        const body: SearchRequest = await req.json();
        const { query, limit = 10, priceMin, priceMax } = body;

        if (!query || query.trim().length === 0) {
            return NextResponse.json(
                { error: 'Query is required' },
                { status: 400 }
            );
        }

        // Forward request to Python FastAPI server
        const response = await fetch(`${TOASTD_API_URL}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, limit, priceMin, priceMax }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Search failed' }));
            return NextResponse.json(
                { error: error.detail || 'Search failed' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error: unknown) {
        console.error('Toastd search error:', error);
        const message = error instanceof Error ? error.message : 'Search failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function GET() {
    // Health check endpoint
    try {
        const response = await fetch(`${TOASTD_API_URL}/health`);
        
        if (!response.ok) {
            return NextResponse.json(
                { status: 'unhealthy', error: 'API not responding' },
                { status: 503 }
            );
        }

        const health = await response.json();
        return NextResponse.json(health);

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Health check failed';
        return NextResponse.json(
            { status: 'unhealthy', error: message },
            { status: 503 }
        );
    }
}
