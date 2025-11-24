import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL,
});

// Helper to get embedding (copying logic from lib/embeddings.ts to keep script standalone-ish)
async function getEmbedding(text: string): Promise<number[]> {
    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: text,
            dimensions: 384
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error('Embedding failed:', error);
        throw error;
    }
}

async function analyzeImage(imageUrl: string, title: string, price: string): Promise<{ category: string; description: string; keywords: string[] }> {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text", text: `Analyze this product image. Title: "${title}", Price: "${price}". 
              Provide a JSON response with the following fields:
              - "category": A high-level category dynamically determined based on the product (e.g., "Clothing", "Beauty", "Home", "Electronics", etc. - be specific but broad enough for grouping).
              - "description": A detailed description for a gift recommendation system. Include: what it is, style, material (if visible), suitable occasion, and who it might be for (persona). Keep it concise but descriptive (2-3 sentences).
              - "keywords": A list of 5-10 descriptive keywords that capture the essence, style, and use-case of the product.` },
                        {
                            type: "image_url",
                            image_url: {
                                "url": imageUrl,
                            },
                        },
                    ],
                },
            ],
        });
        const content = response.choices[0].message.content || "{}";
        const parsed = JSON.parse(content);

        // Validation and defaults
        return {
            category: parsed.category || "Uncategorized",
            description: parsed.description || `${title} - ${price}`,
            keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [title]
        };
    } catch (error) {
        console.error(`Image analysis failed for ${imageUrl}. Falling back to text analysis.`);

        // Fallback to text-only analysis
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "user",
                        content: `Analyze this product based on its title and price. Title: "${title}", Price: "${price}".
                        The image URL was invalid or inaccessible, so infer details from the title.
                        Provide a JSON response with the following fields:
                        - "category": A high-level category dynamically determined based on the product (e.g., "Clothing", "Beauty", "Home", "Electronics", etc.).
                        - "description": A detailed description for a gift recommendation system. Infer what it is, style, and use-case. Keep it concise but descriptive (2-3 sentences).
                        - "keywords": A list of 5-10 descriptive keywords.`
                    },
                ],
            });
            const content = response.choices[0].message.content || "{}";
            const parsed = JSON.parse(content);
            return {
                category: parsed.category || "Uncategorized",
                description: parsed.description || `${title} - ${price}`,
                keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [title]
            };
        } catch (fallbackError) {
            console.error(`Text analysis also failed for ${title}:`, fallbackError);
            return {
                category: "Uncategorized",
                description: `${title} - ${price}`,
                keywords: [title]
            };
        }
    }
}

interface ProductRecord {
    title: string;
    description: string;
    price_original: string;
    price_discounted: string;
    image_url: string;
    product_url: string;
}

// Generate a deterministic UUID based on a namespace and a name (URL)
// Using a fixed namespace for products
const PRODUCT_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // URL namespace

async function main() {
    const args = process.argv.slice(2);
    const collectionIndex = args.indexOf('--collection');
    if (collectionIndex === -1 || !args[collectionIndex + 1]) {
        console.error('Please provide a collection name using --collection <name>');
        process.exit(1);
    }
    const collectionName = args[collectionIndex + 1];

    const dataDir = path.resolve(__dirname, '../upsert_data/data');

    // Find all products.csv files
    const productFiles: string[] = [];
    function findFiles(dir: string) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                findFiles(fullPath);
            } else if (file === 'products.csv') {
                productFiles.push(fullPath);
            }
        }
    }
    findFiles(dataDir);

    console.log(`Found ${productFiles.length} product files.`);

    // Ensure collection exists
    try {
        await qdrantClient.getCollection(collectionName);
        console.log(`Collection ${collectionName} exists.`);
    } catch (e) {
        console.log(`Creating collection ${collectionName}...`);
        await qdrantClient.createCollection(collectionName, {
            vectors: {
                size: 384,
                distance: 'Cosine',
            },
        });
    }

    for (const file of productFiles) {
        const brand = path.basename(path.dirname(file));
        console.log(`Processing brand: ${brand}`);

        const fileContent = fs.readFileSync(file, 'utf-8');
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
        }) as ProductRecord[];

        for (const record of records) {
            const { title, description, price_original, price_discounted, image_url, product_url } = record;

            // Skip if critical data missing
            if (!title || !image_url) continue;

            // Generate deterministic ID first
            const pointId = uuidv5(product_url, PRODUCT_NAMESPACE);

            // Check if already exists
            try {
                const existing = await qdrantClient.retrieve(collectionName, {
                    ids: [pointId],
                });
                if (existing.length > 0) {
                    console.log(`Skipping: ${title} (already exists)`);
                    continue;
                }
            } catch (e) {
                // Ignore error, proceed to upsert
            }

            console.log(`Analyzing: ${title}`);

            // 1. Analyze Image to get rich structured data
            const analysis = await analyzeImage(image_url, title, price_original);
            console.log(`Category: ${analysis.category}`);
            console.log(`Description: ${analysis.description.substring(0, 50)}...`);

            // 2. Generate Embedding with structured context
            // We prefix the category to strongly separate vector clusters
            const embeddingText = `Category: ${analysis.category}\nProduct: ${title}\nDescription: ${analysis.description}\nKeywords: ${analysis.keywords.join(", ")}\nBrand: ${brand}`;
            const embedding = await getEmbedding(embeddingText);

            // 3. Upsert to Qdrant
            await qdrantClient.upsert(collectionName, {
                wait: true,
                points: [
                    {
                        id: pointId,
                        vector: embedding,
                        payload: {
                            title,
                            description: analysis.description, // Use the enriched description
                            original_description: description,
                            category: analysis.category,
                            keywords: analysis.keywords,
                            price_numeric: parseFloat(price_original) || 0,
                            price_discounted: parseFloat(price_discounted) || 0,
                            image_url,
                            product_url,
                            brand,
                        },
                    },
                ],
            });
        }
    }

    console.log('Upsert complete!');
}

main().catch(console.error);
