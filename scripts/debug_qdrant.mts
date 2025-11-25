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
    try {
        const response = await qdrantClient.getCollections();
        console.log('Collections:', response.collections.map(c => c.name));

        for (const collection of response.collections) {
            const info = await qdrantClient.getCollection(collection.name);
            console.log(`\nCollection: ${collection.name}`);
            console.log(`- Points: ${info.points_count}`);

            console.log(`- Status: ${info.status}`);

            // Peek at one item
            if ((info.points_count ?? 0) > 0) {
                const search = await qdrantClient.scroll(collection.name, { limit: 1, with_payload: true });
                if (search.points.length > 0) {
                    console.log(`- Sample Payload:`, JSON.stringify(search.points[0].payload, null, 2));
                }
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
