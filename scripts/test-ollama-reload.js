const { v4: uuidv4 } = require('uuid');

async function fetchNdjson(url, options) {
    const response = await fetch(url, options);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const json = JSON.parse(line);
                if (json.type === 'status') {
                    console.log(`[Status] ${json.message}`);
                } else if (json.type === 'result') {
                    finalResult = json.data;
                } else if (json.type === 'error') {
                    console.error(`[Error] ${json.message}`);
                }
            } catch (e) {
                console.error('Error parsing JSON:', e);
            }
        }
    }
    return finalResult;
}

async function testReload() {
    const guestId = uuidv4();
    const baseUrl = 'http://localhost:3000';
    console.log(`Testing Reload with Guest ID: ${guestId}`);

    try {
        // 1. Initial Request
        console.log('\n1. Sending Initial Request...');
        const data1 = await fetchNdjson(`${baseUrl}/api/message/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: "Suggest a hair product",
                guestId
            })
        });

        if (!data1) throw new Error('No result from initial request');
        console.log(`Session ID: ${data1.sessionId}`);
        console.log(`Products 1: ${data1.products.map(p => p.id).join(', ')}`);
        const productIds1 = new Set(data1.products.map(p => p.id));

        // 2. Reload Request
        console.log('\n2. Sending Reload Request...');
        const data2 = await fetchNdjson(`${baseUrl}/api/message/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: "Suggest a hair product", // Same message
                sessionId: data1.sessionId,
                guestId,
                isReload: true // Key flag
            })
        });

        if (!data2) throw new Error('No result from reload request');
        console.log(`Products 2: ${data2.products.map(p => p.id).join(', ')}`);

        // 3. Verification
        const productIds2 = data2.products.map(p => p.id);
        const overlap = productIds2.filter(id => productIds1.has(id));

        console.log(`\nOverlap Count: ${overlap.length}`);
        if (overlap.length === 0) {
            console.log('✅ SUCCESS: No overlap between initial and reload recommendations.');
        } else if (overlap.length < productIds1.size) {
            console.log('⚠️ PARTIAL SUCCESS: Some overlap, but new products introduced.');
        } else {
            console.error('❌ FAILURE: Reload returned identical products.');
        }

    } catch (error) {
        console.error('Test Failed:', error);
    }
}

testReload();
