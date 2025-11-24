import openai from './openai';

export async function getEmbedding(text: string): Promise<number[]> {
    try {
        const response = await openai.embeddings.create({
            model: "nomic-embed-text", // Ollama embedding model
            input: text,
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error('Ollama embedding failed:', error);
        throw error;
    }
}
