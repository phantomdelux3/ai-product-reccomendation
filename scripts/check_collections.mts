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
    const collections = ['products', 'girlfriends', 'boyfriends'];

    for (const name of collections) {
        try {
            const info = await qdrantClient.getCollection(name);
            console.log(`Collection: ${name}`);
            console.log(`- Status: ${info.status}`);
            console.log(`- Vectors Count: ${info.points_count}`);
            console.log(`- Config:`, JSON.stringify(info.config.params.vectors, null, 2));
        } catch (e) {
            console.log(`Collection ${name} does not exist.`);
        }
    }
}

main();
