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
    const name = 'toastd';
    try {
        const info = await qdrantClient.getCollection(name);
        console.log(`Collection: ${name}`);
        console.log(`- Status: ${info.status}`);
        console.log(`- Vectors Count: ${info.points_count}`);

        // Get a sample point to see the payload structure
        const points = await qdrantClient.scroll(name, {
            limit: 1,
            with_payload: true,
            with_vector: false
        });

        if (points.points.length > 0) {
            console.log('Sample Point Payload:', JSON.stringify(points.points[0].payload, null, 2));
        } else {
            console.log('No points found in collection.');
        }

    } catch (e) {
        console.log(`Collection ${name} does not exist or error accessing it:`, e);
    }
}

main();
