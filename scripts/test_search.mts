import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars BEFORE importing anything that uses them
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL,
});

async function main() {
    // Dynamic import to ensure env vars are loaded first
    const { getEmbedding } = await import('../lib/embeddings');

    const queries = ["beauty products", "jewelry"];
    const collections = ['products', 'girlfriends', 'boyfriends'];

    for (const query of queries) {
        console.log(`\n--- Testing Query: "${query}" ---`);
        try {
            const embedding = await getEmbedding(query);

            for (const collection of collections) {
                console.log(`\nSearching collection: '${collection}'`);
                try {
                    const searchResult = await qdrantClient.search(collection, {
                        vector: embedding,
                        limit: 5,
                        with_payload: true,
                    });

                    if (searchResult.length === 0) {
                        console.log(`No results found in '${collection}'.`);
                    } else {
                        console.log(`Found ${searchResult.length} items:`);
                        searchResult.forEach((item, index) => {
                            const payload = item.payload as any;
                            console.log(`${index + 1}. ${payload.title} (Score: ${item.score})`);
                            console.log(`   Category: ${payload.category}`);
                        });
                    }
                } catch (e) {
                    console.log(`Error searching collection '${collection}':`, e);
                }
            }
        } catch (error) {
            console.error(`Search failed for "${query}":`, error);
        }
    }
}

main();
