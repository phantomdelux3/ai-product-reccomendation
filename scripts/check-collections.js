const { QdrantClient } = require('@qdrant/js-client-rest');

const client = new QdrantClient({ url: 'http://127.0.0.1:6333' });

async function checkCollections() {
    try {
        console.log('Checking Qdrant Collections...');
        const result = await client.getCollections();
        console.log('Collections:', result.collections.map(c => c.name));
    } catch (error) {
        console.error('❌ Qdrant Check Failed:', error);
    }
}

checkCollections();
