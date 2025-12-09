import { NextResponse } from 'next/server';
import qdrantClient from '@/lib/qdrant';
import { getEmbedding } from '@/lib/embeddings';
import { COLLECTION_MAP } from '@/lib/config/guided-mode';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { recipient, productType, aesthetics, budget } = body;

        if (!recipient) {
            return NextResponse.json({ error: 'Recipient is required' }, { status: 400 });
        }

        // 1. Construct Search Query
        // Combine aesthetics and product type
        const aestheticsStr = Array.isArray(aesthetics) ? aesthetics.join(' ') : (aesthetics || '');
        const queryText = `${aestheticsStr} ${productType || ''}`.trim();

        // If query is empty, maybe just search for "gift"? Or handle gracefully.
        const effectiveQuery = queryText || "gift";

        const embedding = await getEmbedding(effectiveQuery);

        // 2. Construct Filter
        const filter: any = { must: [] };

        // Price Filter
        if (budget) {
            let min = 0;
            let max = 1000000;

            if (budget === 'under 1k') {
                max = 1000;
            } else if (budget === '2k') {
                min = 1000; max = 2000;
            } else if (budget === '2.5k') {
                min = 2000; max = 2500;
            } else if (budget === '3k') {
                min = 2500; max = 3000;
            } else if (budget === '5k') {
                min = 3000; max = 5000;
            } else if (budget === '6k') {
                min = 5000; max = 6000;
            } else if (budget === '6k+') {
                min = 6000;
            }

            filter.must.push({
                key: "price_numeric",
                range: { gte: min, lte: max }
            });
        }

        // 3. Search Qdrant
        const collectionName = COLLECTION_MAP[recipient.toLowerCase()] || recipient.toLowerCase();

        // Check if collection exists (optional, but good practice if we can, 
        // but Qdrant might just error if it doesn't exist. We'll catch the error.)

        const searchResult = await qdrantClient.search(collectionName, {
            vector: embedding,
            filter: filter.must.length > 0 ? filter : undefined,
            limit: 20,
            with_payload: true,
        });

        // 4. Format Response
        const products = searchResult.map(item => ({
            id: item.id,
            ...item.payload,
            score: item.score
        }));

        return NextResponse.json({ products });

    } catch (error: any) {
        console.error('Error in guided search:', error);
        // If collection doesn't exist, return empty list instead of 500?
        if (error.message && error.message.includes('Not found: Collection')) {
            return NextResponse.json({ products: [] });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
