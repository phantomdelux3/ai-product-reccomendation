import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL,
});

async function main() {
    console.log('Testing Qdrant search...');

    // Mock embedding (random vector of size 384)
    const embedding = Array(384).fill(0).map(() => Math.random());

    // Test case 1: Basic search with offset
    try {
        console.log('Test 1: Basic search with offset');
        await qdrantClient.search('products', {
            vector: embedding,
            limit: 6,
            offset: 6,
            with_payload: true,
        });
        console.log('Test 1: Success');
    } catch (e: any) {
        console.error('Test 1 Failed:', e.message);
        if (e.data) console.error('Error data:', JSON.stringify(e.data, null, 2));
    }

    // Test case 2: Search with Filter
    try {
        console.log('Test 2: Search with Filter');
        const filter = {
            must: [
                { key: "price_numeric", range: { gte: 0, lte: 1000 } }
            ]
        };
        await qdrantClient.search('products', {
            vector: embedding,
            filter: filter,
            limit: 6,
            offset: 0,
            with_payload: true,
        });
        console.log('Test 2: Success');
    } catch (e: any) {
        console.error('Test 2 Failed:', e.message);
        if (e.data) console.error('Error data:', JSON.stringify(e.data, null, 2));
    }

    // Test case 3: Search with Filter AND Offset
    try {
        console.log('Test 3: Search with Filter AND Offset');
        const filter = {
            must: [
                { key: "price_numeric", range: { gte: 0, lte: 1000 } }
            ]
        };
        await qdrantClient.search('products', {
            vector: embedding,
            filter: filter,
            limit: 6,
            offset: 6,
            with_payload: true,
        });
        console.log('Test 3: Success');
    } catch (e: any) {
        console.error('Test 3 Failed:', e.message);
        if (e.data) console.error('Error data:', JSON.stringify(e.data, null, 2));
    }
}

main();
