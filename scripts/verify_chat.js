// const fetch = require('node:fetch'); // Not needed in Node 18+

const BASE_URL = 'http://localhost:3000/api/message/chat';
const SESSION_ID = crypto.randomUUID();

async function sendMessage(message, label) {
    console.log(`\n--- ${label} ---`);
    console.log(`User: ${message}`);

    try {
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                sessionId: SESSION_ID,
                guestId: 'test-guest'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let resultData = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    if (json.type === 'result') {
                        resultData = json.data;
                        console.log('[Result Received]');
                    } else if (json.type === 'status') {
                        console.log(`[Status]: ${json.message}`);
                    } else if (json.type === 'error') {
                        console.error(`[Error from API]: ${json.message}`);
                    } else {
                        console.log('[Unknown Type]:', json);
                    }
                } catch (e) {
                    console.error('Error parsing line:', line, e);
                }
            }
        }

        if (resultData) {
            console.log(`AI: ${resultData.assistantResponse}`);
            if (resultData.products && resultData.products.length > 0) {
                console.log(`Products Found: ${resultData.products.length}`);
            }
        } else {
            console.log('No final result received.');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

async function runTests() {
    // 1. Vague Query
    await sendMessage('gift ideas', 'Test 1: Vague Query');

    // 2. Context Update
    await sendMessage('for my girlfriend', 'Test 2: Context Update');

    // 3. Specific Query
    await sendMessage('red running shoes under $100', 'Test 3: Specific Query');
}

// Check if fetch is available (Node 18+)
if (!globalThis.fetch) {
    console.error('This script requires Node.js 18+ with global fetch.');
    process.exit(1);
}

runTests();
