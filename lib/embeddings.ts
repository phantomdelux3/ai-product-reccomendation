import openai from './openai';

export async function getEmbedding(text: string): Promise<number[]> {
    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: text,
            dimensions: 384
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error('OpenAI embedding failed:', error);
        throw error;
    }
}
