const { v4: uuidv4 } = require('uuid');

async function fetchNdjson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    // For GET requests or non-streaming endpoints, handle normally
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return await response.json();
    }

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

async function testSessionFlow() {
    const guestId = uuidv4();
    console.log(`Testing with Guest ID: ${guestId}`);

    const baseUrl = 'http://localhost:3000';

    try {
        // 1. Start New Chat
        console.log('\n1. Starting New Chat (User: "Suggest a hair product")');
        const data1 = await fetchNdjson(`${baseUrl}/api/message/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: "Suggest a hair product",
                guestId
            })
        });

        if (!data1 || !data1.sessionId) {
            console.error('Response Data:', data1);
            throw new Error('No sessionId returned');
        }
        console.log(`Session Created: ${data1.sessionId}`);
        console.log(`AI Response: ${data1.assistantResponse.substring(0, 50)}...`);

        const sessionId = data1.sessionId;

        // 2. Follow-up (Context Test)
        console.log('\n2. Sending Follow-up (User: "My budget is 5000")');
        const data2 = await fetchNdjson(`${baseUrl}/api/message/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: "My budget is 5000",
                sessionId,
                guestId
            })
        });
        console.log(`AI Response: ${data2.assistantResponse.substring(0, 50)}...`);

        // 3. List Sessions
        console.log('\n3. Listing Sessions');
        const data3 = await fetchNdjson(`${baseUrl}/api/sessions?guestId=${guestId}`);
        console.log(`Sessions found: ${data3.sessions.length}`);
        if (data3.sessions.length === 0) throw new Error('Session not listed');
        if (data3.sessions[0].id !== sessionId) throw new Error('Session ID mismatch');

        // 4. Get Message History
        console.log('\n4. Fetching Message History');
        const data4 = await fetchNdjson(`${baseUrl}/api/message/chat?sessionId=${sessionId}`);
        console.log(`Messages found: ${data4.messages.length}`);
        // Should be 4 messages (User1, AI1, User2, AI2)
        if (data4.messages.length < 4) console.warn('Expected at least 4 messages');

        console.log('\n✅ Verification Successful!');

    } catch (error) {
        console.error('\n❌ Verification Failed:', error);
    }
}

testSessionFlow();
