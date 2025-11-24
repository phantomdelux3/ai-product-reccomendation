import LocalEmbeddingService from '../lib/local-embeddings';

async function testLocalEmbedding() {
    try {
        console.log('Testing LocalEmbeddingService...');
        const service = LocalEmbeddingService.getInstance();

        const text = "This is a test sentence for embedding generation.";
        console.log(`Input text: "${text}"`);

        const start = Date.now();
        const embedding = await service.getEmbedding(text);
        const duration = Date.now() - start;

        console.log(`Embedding generated in ${duration}ms`);
        console.log(`Dimensions: ${embedding.length}`);

        if (embedding.length === 384) {
            console.log('✅ Success: Embedding has correct dimensions (384).');
        } else {
            console.error(`❌ Failure: Expected 384 dimensions, got ${embedding.length}.`);
        }

        // Test singleton
        console.log('Testing Singleton instance...');
        const service2 = LocalEmbeddingService.getInstance();
        if (service === service2) {
            console.log('✅ Success: Singleton works.');
        } else {
            console.error('❌ Failure: Singleton failed.');
        }

    } catch (error) {
        console.error('❌ Error testing local embedding:', error);
    }
}

testLocalEmbedding();
