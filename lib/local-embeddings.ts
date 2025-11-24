import { pipeline, PipelineType } from '@xenova/transformers';

// Define a singleton class to manage the model
class LocalEmbeddingService {
    private static instance: LocalEmbeddingService;
    private extractor: any = null;
    private modelName: string = 'Xenova/all-MiniLM-L6-v2';

    private constructor() { }

    public static getInstance(): LocalEmbeddingService {
        if (!LocalEmbeddingService.instance) {
            LocalEmbeddingService.instance = new LocalEmbeddingService();
        }
        return LocalEmbeddingService.instance;
    }

    private async getExtractor() {
        if (!this.extractor) {
            console.log(`Loading local embedding model: ${this.modelName}...`);
            // Use the feature-extraction pipeline
            this.extractor = await pipeline('feature-extraction', this.modelName);
            console.log('Local embedding model loaded successfully.');
        }
        return this.extractor;
    }

    public async getEmbedding(text: string): Promise<number[]> {
        try {
            const extractor = await this.getExtractor();

            // Generate embedding
            // pooling: 'mean' and normalize: true are standard for sentence-transformers
            const output = await extractor(text, { pooling: 'mean', normalize: true });

            // The output is a Tensor, we need to convert it to a regular array
            return Array.from(output.data);
        } catch (error) {
            console.error('Error generating local embedding:', error);
            throw error;
        }
    }
}

export default LocalEmbeddingService;
