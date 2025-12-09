import { Ollama } from 'ollama';
import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Configuration
import { COLLECTIONS } from '../lib/config/guided-mode';

const OLLAMA_HOST = 'http://localhost:11434';
const ollama = new Ollama({ host: OLLAMA_HOST });
const QDRANT_URL = process.env.QDRANT_URL;
// const COLLECTIONS = ['girlfriends', 'boyfriends', 'mom', 'dad', 'friend', 'colouge']; // Removed hardcoded
const TEMP_DIR = path.resolve(__dirname, '../temp');
const FINAL_OUTPUT_FILE = path.join(TEMP_DIR, 'product_type.json');

const qdrantClient = new QdrantClient({
    url: QDRANT_URL,
});

/**
 * Step 1: Fetch Products from Qdrant for a specific collection
 */
async function fetchProducts(collectionName: string) {
    console.log(`Step 1: Fetching products from collection '${collectionName}'...`);
    const productsFile = path.join(TEMP_DIR, `products_${collectionName}.json`);

    // Check if products are already cached
    try {
        await fs.access(productsFile);
        console.log(`Products found in cache for ${collectionName}. Loading from file...`);
        const data = await fs.readFile(productsFile, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.log(`No cache found for ${collectionName}. Fetching from Qdrant...`);
    }

    const allPoints: any[] = [];
    let offset: string | number | Record<string, unknown> | null | undefined = undefined;

    try {
        // Scroll through all points
        while (true) {
            const response = await qdrantClient.scroll(collectionName, {
                limit: 100,
                offset: offset,
                with_payload: true,
            });

            allPoints.push(...response.points);
            offset = response.next_page_offset;

            if (!offset) break;
            console.log(`Fetched ${allPoints.length} products for ${collectionName}...`);
        }
    } catch (error) {
        console.warn(`Error fetching from collection '${collectionName}':`, error);
        return []; // Return empty if collection doesn't exist or fails
    }

    console.log(`Total products fetched for ${collectionName}: ${allPoints.length}`);

    // Ensure temp directory exists
    await fs.mkdir(TEMP_DIR, { recursive: true });

    // Save to file
    await fs.writeFile(productsFile, JSON.stringify(allPoints, null, 2));
    console.log(`Products saved to ${productsFile}`);

    return allPoints;
}

/**
 * Step 2: Analyze Categories
 */
async function analyzeCategories(products: any[], collectionName: string) {
    console.log(`Step 2: Analyzing categories for ${collectionName}...`);
    const analysisFile = path.join(TEMP_DIR, `analysis_${collectionName}.json`);

    // Check for existing analysis to resume
    let existingAnalysis: any = {};
    try {
        const data = await fs.readFile(analysisFile, 'utf-8');
        existingAnalysis = JSON.parse(data);
        console.log(`Resuming analysis for ${collectionName} from existing file...`);
    } catch (e) {
        // No existing analysis
    }

    const BATCH_SIZE = 20;
    const productsToAnalyze = products.filter(p => !existingAnalysis[p.id]);

    console.log(`${productsToAnalyze.length} products remaining to analyze for ${collectionName}.`);

    for (let i = 0; i < productsToAnalyze.length; i += BATCH_SIZE) {
        const batch = productsToAnalyze.slice(i, i + BATCH_SIZE);
        const batchDescriptions = batch.map((p: any) => `ID: ${p.id}\nName: ${p.payload.name}\nDescription: ${p.payload.description}`).join('\n---\n');

        const prompt = `
        You are an expert product categorizer for a gift recommendation service.
        Analyze the following products and assign a specific, relevant gifting "Category" and a more specific "Subcategory" to each.
        
        Categories should be broad (e.g., "Home Decor", "Skincare", "Hair Care", "Jewellery", "Apparel", "Tech Accessories").
        Subcategories should be specific item types (e.g., "Lamp", "Poster", "Moisturizer", "Shampoo", "Necklace", "T-Shirt").

        IMPORTANT GUIDELINES:
        - **Hair Care vs Skincare**: 
            - "Hair Care" includes shampoos, conditioners, hair oils, hair masks, and styling products.
            - "Skincare" includes face washes, moisturizers, serums, body lotions, and sunscreens. DO NOT put hair products here.
        - **Plushies**: If an item is a soft toy, stuffed animal, or plushie, set Category to "Plushies" and Subcategory to the specific animal or type (e.g., "Teddy Bear", "Bunny").
        - **Toys**: Use "Toys" only for non-plush items.

        Return ONLY a JSON object where keys are the Product IDs and values are objects with "category" and "subcategory".
        Example:
        {
            "id_1": { "category": "Home Decor", "subcategory": "Lamp" },
            "id_2": { "category": "Plushies", "subcategory": "Teddy Bear" }
        }

        Products:
        ${batchDescriptions}
        `;

        try {
            const response = await ollama.chat({
                model: 'llama3',
                messages: [{ role: 'user', content: prompt }],
                format: 'json'
            });

            const batchResults = JSON.parse(response.message.content);

            // Merge results
            existingAnalysis = { ...existingAnalysis, ...batchResults };

            // Save progress
            await fs.writeFile(analysisFile, JSON.stringify(existingAnalysis, null, 2));
            console.log(`[${collectionName}] Processed batch ${i / BATCH_SIZE + 1}. Total analyzed: ${Object.keys(existingAnalysis).length}`);

        } catch (error) {
            console.error(`[${collectionName}] Error processing batch starting at index ${i}:`, error);
        }
    }

    return existingAnalysis;
}

/**
 * Step 3: Aggregate and Synthesize
 */
async function synthesizeOptions(analysis: any, collectionName: string) {
    console.log(`Step 3: Synthesizing options for ${collectionName}...`);

    const categoryMap: Record<string, Set<string>> = {};

    for (const item of Object.values(analysis)) {
        const { category, subcategory } = item as { category: string, subcategory: string };
        if (!category || !subcategory) continue;

        const cat = String(category).trim();
        const sub = String(subcategory).trim();

        if (!categoryMap[cat]) {
            categoryMap[cat] = new Set();
        }
        categoryMap[cat].add(sub);
    }

    console.log(`[${collectionName}] Categories found:`, Object.keys(categoryMap));

    // Construct a summary for the prompt
    const categorySummary = Object.entries(categoryMap)
        .map(([cat, subs]) => `${cat}: [${Array.from(subs).join(', ')}]`)
        .join('\n');

    const prompt = `
    Based on the following list of product categories and their subcategories found in our database for the recipient "${collectionName}", generate a structured JSON list of options for a gift guide.
    
    For each category, select the most common and relevant subcategories to list in "subOptions".
    Group similar subcategories if necessary to keep the list clean.
    
    Found Categories and Subcategories:
    ${categorySummary}
    
    Output format:
    {
        "options": [
            { "id": "category_id", "label": "Category Name", "subOptions": ["SubOption1", "SubOption2"] }
        ]
    }
    `;

    try {
        const response = await ollama.chat({
            model: 'llama3',
            messages: [{ role: 'user', content: prompt }],
            format: 'json'
        });

        console.log(`[${collectionName}] Final Options Structure generated.`);
        return JSON.parse(response.message.content);
    } catch (error) {
        console.error(`[${collectionName}] Error synthesizing options:`, error);
        return { options: [] };
    }
}

// Main Execution Flow
async function main() {
    const finalOutput: Record<string, any> = {};

    for (const collection of COLLECTIONS) {
        console.log(`\n--- Processing Collection: ${collection} ---`);
        try {
            const products = await fetchProducts(collection);
            if (products.length === 0) {
                console.log(`Skipping analysis for ${collection} due to no products.`);
                finalOutput[collection] = [];
                continue;
            }

            const analysis = await analyzeCategories(products, collection);
            const finalOptions = await synthesizeOptions(analysis, collection);

            finalOutput[collection] = finalOptions.options || [];
        } catch (error) {
            console.error(`Error processing collection ${collection}:`, error);
            finalOutput[collection] = [];
        }
    }

    await fs.writeFile(FINAL_OUTPUT_FILE, JSON.stringify(finalOutput, null, 2));
    console.log(`\nAll collections processed. Final output saved to ${FINAL_OUTPUT_FILE}`);
}

main();
