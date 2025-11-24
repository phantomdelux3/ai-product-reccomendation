const OpenAI = require('openai');

const openai = new OpenAI({
    baseURL: 'http://127.0.0.1:11434/v1',
    apiKey: 'ollama',
});

async function testEmbedding() {
    try {
        console.log('Testing Ollama Embedding...');
        const response = await openai.embeddings.create({
            model: "nomic-embed-text",
            input: "Test sentence",
        });
        console.log('✅ Embedding Success!');
        console.log('Dimensions:', response.data[0].embedding.length);
    } catch (error) {
        console.error('❌ Embedding Failed:', error);
    }
}

testEmbedding();
