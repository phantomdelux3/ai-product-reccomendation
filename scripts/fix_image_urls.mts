import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});

const COLLECTIONS = ['products', 'girlfriends', 'boyfriends'];

async function fixImageUrls() {
    console.log('Starting image URL fix...');

    for (const collectionName of COLLECTIONS) {
        console.log(`Processing collection: ${collectionName}`);

        try {
            let offset: string | number | Record<string, unknown> | undefined = undefined;
            let totalFixed = 0;

            while (true) {
                const result = await qdrantClient.scroll(collectionName, {
                    limit: 100,
                    with_payload: true,
                    offset,
                });

                const pointsToUpdate: any[] = [];

                for (const point of result.points) {
                    const payload = point.payload;
                    if (!payload || !payload.image_url) continue;

                    const originalUrl = payload.image_url as string;
                    // Remove query parameters (everything after ?)
                    const cleanUrl = originalUrl.split('?')[0];

                    if (originalUrl !== cleanUrl) {
                        pointsToUpdate.push({
                            id: point.id,
                            payload: {
                                ...payload,
                                image_url: cleanUrl
                            }
                        });
                    }
                }

                if (pointsToUpdate.length > 0) {
                    await qdrantClient.upsert(collectionName, {
                        points: pointsToUpdate
                    });
                    totalFixed += pointsToUpdate.length;
                    console.log(`  Fixed ${pointsToUpdate.length} images in this batch.`);
                }

                offset = result.next_page_offset ?? undefined;
                if (!offset) break;
            }

            console.log(`Finished ${collectionName}. Total fixed: ${totalFixed}`);

        } catch (error) {
            console.error(`Error processing ${collectionName}:`, error);
        }
    }

    console.log('All collections processed.');
}

fixImageUrls();
