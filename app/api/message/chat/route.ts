import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import openai from '@/lib/openai';
import qdrantClient from '@/lib/qdrant';
import redisClient from '@/lib/redis';
import { getEmbedding } from '@/lib/embeddings';
import { v4 as uuidv4 } from 'uuid';

// Helper to get session context (Redis -> DB)
async function getSessionContext(sessionId: string, messageId: string) {
    const cacheKey = `session:${sessionId}:context`;
    try {
        // Try Redis first
        if (redisClient.isOpen) {
            const cachedContext = await redisClient.get(cacheKey);
            if (cachedContext) {
                return JSON.parse(cachedContext);
            }
        }
    } catch (e) {
        console.warn('Redis get failed:', e);
    }

    // Fallback to DB
    const historyResult = await pool.query(
        `SELECT user_content, assistant_content FROM messages 
         WHERE session_id = $1 AND id != $2 
         ORDER BY created_at DESC LIMIT 10`,
        [sessionId, messageId]
    );

    const history = historyResult.rows.reverse().map(row => ({
        user: row.user_content,
        assistant: row.assistant_content
    }));

    // Populate Redis
    try {
        if (redisClient.isOpen) {
            await redisClient.set(cacheKey, JSON.stringify(history), { EX: 3600 }); // 1 hour TTL
        }
    } catch (e) {
        console.warn('Redis set failed:', e);
    }

    return history;
}

// Helper to update session context in Redis
async function updateSessionContext(sessionId: string, userMsg: string, assistantMsg: string) {
    const cacheKey = `session:${sessionId}:context`;
    try {
        if (redisClient.isOpen) {
            const cachedContext = await redisClient.get(cacheKey);
            let history = cachedContext ? JSON.parse(cachedContext) : [];
            history.push({ user: userMsg, assistant: assistantMsg });
            // Keep last 10
            if (history.length > 10) history = history.slice(-10);
            await redisClient.set(cacheKey, JSON.stringify(history), { EX: 3600 });
        }
    } catch (e) {
        console.warn('Redis update failed:', e);
    }
}

export async function POST(req: Request) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const sendStatus = (message: string) => {
                controller.enqueue(encoder.encode(JSON.stringify({ type: 'status', message }) + '\n'));
            };

            try {
                const body = await req.json();
                const { message, sessionId: providedSessionId, isReload, guestId } = body;

                let sessionId = providedSessionId;
                let isNewSession = false;

                // 1. Session Management
                if (!sessionId) {
                    sessionId = uuidv4();
                    isNewSession = true;
                    await pool.query(
                        'INSERT INTO sessions (id, session_name, guest_id) VALUES ($1, $2, $3)',
                        [sessionId, message.substring(0, 50), guestId]
                    );
                } else {
                    const sessionCheck = await pool.query('SELECT id FROM sessions WHERE id = $1', [sessionId]);
                    if (sessionCheck.rows.length === 0) {
                        await pool.query(
                            'INSERT INTO sessions (id, session_name, guest_id) VALUES ($1, $2, $3)',
                            [sessionId, message.substring(0, 50), guestId]
                        );
                        isNewSession = true;
                    }
                }

                // 2. Store User Message
                const messageId = uuidv4();
                await pool.query(
                    'INSERT INTO messages (id, session_id, user_content) VALUES ($1, $2, $3)',
                    [messageId, sessionId, message]
                );

                sendStatus("Thinking...");

                // 3. Retrieve Context
                const history = await getSessionContext(sessionId, messageId);

                // 4. Intent Analysis
                sendStatus("Analyzing your request...");
                const intentCompletion = await openai.chat.completions.create({
                    model: 'llama3', // Switched to Llama 3
                    messages: [
                        {
                            role: 'system',
                            content: `You are an AI assistant helping with gift recommendations. 
                            Analyze the user's message AND the conversation history to extract preferences.
                            
                            CONTEXT AWARENESS:
                            - If the user is refining a previous request, MERGE with previous preferences.
                            - If the user changes the topic, DISCARD previous product preferences.
                            
                            Return a JSON object with:
                            - search_query: A refined query for vector search.
                            - target_collection: "girlfriends", "boyfriends", "products". Default "products".
                            - preferences: { price_min, price_max, ... }.
                            
                            IMPORTANT: Return ONLY valid JSON. Do not include any other text.
                            `
                        },
                        {
                            role: 'user',
                            content: `History: ${JSON.stringify(history)}\n\nCurrent Message: ${message}`
                        }
                    ],
                    response_format: { type: 'json_object' }
                });

                const intentData = JSON.parse(intentCompletion.choices[0].message.content || '{}');
                const searchQuery = intentData.search_query || message;
                const targetCollection = intentData.target_collection || 'products';
                const { price_min, price_max } = intentData.preferences || {};

                // 5. Vector Search with Fallback
                let products: any[] = [];
                const embedding = await getEmbedding(searchQuery);
                const filter: any = {};
                if (price_min !== undefined || price_max !== undefined) {
                    filter.must = [{ key: "price_numeric", range: { gte: price_min || 0, lte: price_max || 1000000 } }];
                }

                // Step 5a: Targeted Search
                sendStatus(`Searching in ${targetCollection}...`);
                let searchResult = await qdrantClient.search(targetCollection, {
                    vector: embedding,
                    filter: Object.keys(filter).length > 0 ? filter : undefined,
                    limit: 6, // Increased to 6
                    with_payload: true,
                });

                // Step 5b: Fallback if empty and not already searching 'products'
                if (searchResult.length === 0 && targetCollection !== 'products') {
                    sendStatus(`No results in ${targetCollection}, checking general products...`);
                    searchResult = await qdrantClient.search('products', {
                        vector: embedding,
                        filter: Object.keys(filter).length > 0 ? filter : undefined,
                        limit: 6,
                        with_payload: true,
                    });
                }

                // Process Results
                const uniqueBrands = new Set();
                const diverseProducts: any[] = [];
                const otherProducts: any[] = [];

                for (const item of searchResult) {
                    const product = { id: item.id, ...item.payload };
                    const brand = (product as any).brand || 'Unknown';
                    if (!uniqueBrands.has(brand)) {
                        uniqueBrands.add(brand);
                        diverseProducts.push(product);
                    } else {
                        otherProducts.push(product);
                    }
                }
                products = [...diverseProducts, ...otherProducts].slice(0, 6);

                if (products.length === 0) {
                    sendStatus("No matching products found.");
                } else {
                    sendStatus(`Found ${products.length} relevant products.`);
                }

                // 6. Response Generation
                sendStatus("Curating recommendations...");
                const systemPrompt = products.length > 0
                    ? `You are a witty and helpful gift recommendation assistant. 
                     Based on the user's request and the following products, suggest the best options.
                     
                     GUIDELINES:
                     - Be CONCISE and WITTY.
                     - STRICTLY use ONLY the provided products.
                     - If the user's request was vague (e.g., just "gift"), ask ONE clarifying question to narrow it down (e.g., "Who is this for?" or "What's the occasion?").
                     - Highlight WHY these specific products are good matches.
                     
                     Products found: ${JSON.stringify(products)}`
                    : `You are a helpful gift recommendation assistant. The user asked for gifts, but no relevant products were found.
                     Politely apologize and suggest a different category or ask for more details.`;

                const responseCompletion = await openai.chat.completions.create({
                    model: 'llama3', // Switched to Llama 3
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: message }
                    ]
                });

                const assistantResponse = responseCompletion.choices[0].message.content || "I'm sorry, I couldn't find any recommendations right now.";

                // 7. Store Assistant Message & Update Redis
                await pool.query(
                    'UPDATE messages SET assistant_content = $1, product = $2 WHERE id = $3',
                    [assistantResponse, products.map(p => JSON.stringify(p)), messageId]
                );
                await updateSessionContext(sessionId, message, assistantResponse);

                // 8. Send Final Data
                controller.enqueue(encoder.encode(JSON.stringify({
                    type: 'result',
                    data: {
                        sessionId,
                        messageId,
                        assistantResponse,
                        products,
                        preferences: intentData.preferences || {}
                    }
                }) + '\n'));

            } catch (error: any) {
                console.error('Error in chat API:', error);
                controller.enqueue(encoder.encode(JSON.stringify({
                    type: 'error',
                    message: error.message || 'Internal Server Error'
                }) + '\n'));
            } finally {
                controller.close();
            }
        }
    });

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'application/x-ndjson',
            'Transfer-Encoding': 'chunked'
        }
    });
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get('sessionId');

        if (!sessionId) {
            return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
        }

        const result = await pool.query(
            'SELECT id, user_content, assistant_content, product FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
            [sessionId]
        );

        const messages: any[] = [];
        result.rows.forEach(row => {
            messages.push({
                id: row.id + '_user',
                role: 'user',
                content: row.user_content
            });
            if (row.assistant_content) {
                messages.push({
                    id: row.id + '_assistant',
                    role: 'assistant',
                    content: row.assistant_content,
                    products: row.product ? row.product.map((p: string) => JSON.parse(p)) : undefined
                });
            }
        });

        return NextResponse.json({ messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
