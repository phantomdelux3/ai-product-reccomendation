import { createClient } from 'redis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
    console.log('Testing Redis connection (Local Client)...');

    const client = createClient({
        url: process.env.REDIS_URL,
    });

    client.on('error', (err) => console.log('Redis Client Error', err));

    try {
        await client.connect();
        console.log('Redis connected.');

        await client.set('test_key_local', 'Hello Redis Local');
        const value = await client.get('test_key_local');
        console.log('Redis get result:', value);

        if (value === 'Hello Redis Local') {
            console.log('Redis verification SUCCESS.');
        } else {
            console.error('Redis verification FAILED: Value mismatch.');
        }

        await client.disconnect();
    } catch (error) {
        console.error('Redis verification FAILED:', error);
    }
}

main();
