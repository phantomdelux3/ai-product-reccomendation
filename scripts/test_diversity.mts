import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_URL = 'http://localhost:3000/api/message/chat'; // Adjust port if needed

async function testDiversity() {
    const sessionId = uuidv4();
    const guestId = uuidv4();
    const message = "suggest some gifts for my girlfriend";

    console.log(`Starting test with Session ID: ${sessionId}`);

    // 1. First Request
    console.log("\n--- Request 1 ---");
    try {
        const res1 = await axios.post(API_URL, {
            message,
            sessionId,
            guestId,
            isReload: false,
            excludeIds: [],
            seenBrands: []
        }, { responseType: 'stream' });

        // Parse NDJSON response
        const stream1 = res1.data;
        let products1: any[] = [];
        let brands1: Set<string> = new Set();
        let productIds1: Set<string> = new Set();

        // Simple parsing for NDJSON (assuming axios returns a stream in Node)
        // Actually, axios in Node might return a stream. Let's use a simpler fetch approach or handle the stream.
        // For simplicity in this script, let's assume we can just read the stream or use a helper.
        // Since axios responseType 'stream' returns a readable stream.

        await new Promise<void>((resolve, reject) => {
            stream1.on('data', (chunk: Buffer) => {
                const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                for (const line of lines) {
                    try {
                        const json = JSON.parse(line);
                        if (json.type === 'result') {
                            const data = json.data;
                            const allProducts = [...data.products, ...data.toastdProducts];
                            allProducts.forEach((p: any) => {
                                products1.push(p);
                                productIds1.add(p.id);
                                if (p.brand) brands1.add(p.brand);
                            });
                        }
                    } catch (e) {
                        // ignore partial lines
                    }
                }
            });
            stream1.on('end', resolve);
            stream1.on('error', reject);
        });

        console.log(`Received ${products1.length} products.`);
        console.log(`Brands: ${Array.from(brands1).join(', ')}`);
        console.log(`IDs: ${Array.from(productIds1).join(', ')}`);

        if (products1.length === 0) {
            console.error("No products received in first request. Aborting.");
            return;
        }

        // 2. Second Request (Reload)
        console.log("\n--- Request 2 (Reload with Exclusions) ---");
        const excludeIds = Array.from(productIds1);
        const seenBrands = Array.from(brands1);

        const res2 = await axios.post(API_URL, {
            message,
            sessionId,
            guestId,
            isReload: true,
            excludeIds,
            seenBrands
        }, { responseType: 'stream' });

        const stream2 = res2.data;
        let products2: any[] = [];
        let brands2: Set<string> = new Set();
        let productIds2: Set<string> = new Set();

        await new Promise<void>((resolve, reject) => {
            stream2.on('data', (chunk: Buffer) => {
                const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                for (const line of lines) {
                    try {
                        const json = JSON.parse(line);
                        if (json.type === 'result') {
                            const data = json.data;
                            const allProducts = [...data.products, ...data.toastdProducts];
                            allProducts.forEach((p: any) => {
                                products2.push(p);
                                productIds2.add(p.id);
                                if (p.brand) brands2.add(p.brand);
                            });
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            });
            stream2.on('end', resolve);
            stream2.on('error', reject);
        });

        console.log(`Received ${products2.length} products.`);
        console.log(`Brands: ${Array.from(brands2).join(', ')}`);
        console.log(`IDs: ${Array.from(productIds2).join(', ')}`);

        // Verification
        console.log("\n--- Verification ---");

        // Check for ID overlap
        const overlaps = products2.filter(p => productIds1.has(p.id));
        if (overlaps.length > 0) {
            console.error(`FAILED: Found ${overlaps.length} duplicate products!`);
            overlaps.forEach(p => console.log(` - Duplicate: ${p.id} (${p.title})`));
        } else {
            console.log("PASSED: No duplicate products found.");
        }

        // Check for Brand Diversity (New brands should be prioritized)
        const newBrands = Array.from(brands2).filter(b => !brands1.has(b));
        console.log(`New Brands found: ${newBrands.join(', ')}`);
        if (newBrands.length > 0) {
            console.log("PASSED: New brands were introduced.");
        } else {
            console.warn("WARNING: No new brands found. This might be okay if all brands were exhausted or pool is small.");
        }

    } catch (error) {
        console.error("Test failed:", error);
    }
}

testDiversity();
