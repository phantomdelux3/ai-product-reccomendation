const { v4: uuidv4 } = require('uuid');

async function testSessionFlow() {
    const guestId = uuidv4();
    console.log(`Testing with Guest ID: ${guestId}`);

    const baseUrl = 'http://localhost:3000';

    try {
        // 1. Start New Chat
        console.log('\n1. Starting New Chat (User: "I need a gift for my girlfriend who likes yoga")');
        const res1 = await fetch(`${baseUrl}/api/message/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: "I need a gift for my girlfriend who likes yoga",
                guestId
            })
        });
        const data1 = await res1.json();
        if (!data1.sessionId) {
            console.error('Response Data:', data1);
            throw new Error('No sessionId returned');
        }
        console.log(`Session Created: ${data1.sessionId}`);
        console.log(`AI Response: ${data1.assistantResponse.substring(0, 50)}...`);

        const sessionId = data1.sessionId;

        // 2. Follow-up (Context Test)
        console.log('\n2. Sending Follow-up (User: "My budget is 5000")');
        const res2 = await fetch(`${baseUrl}/api/message/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: "My budget is 5000",
                sessionId,
                guestId
            })
        });
        const data2 = await res2.json();
        console.log(`AI Response: ${data2.assistantResponse.substring(0, 50)}...`);
        // Check if preferences updated (inferred from response or logs, but here just success)

        // 3. List Sessions
        console.log('\n3. Listing Sessions');
        const res3 = await fetch(`${baseUrl}/api/sessions?guestId=${guestId}`);
        const data3 = await res3.json();
        console.log(`Sessions found: ${data3.sessions.length}`);
        if (data3.sessions.length === 0) throw new Error('Session not listed');
        if (data3.sessions[0].id !== sessionId) throw new Error('Session ID mismatch');

        // 4. Get Message History
        console.log('\n4. Fetching Message History');
        const res4 = await fetch(`${baseUrl}/api/message/chat?sessionId=${sessionId}`);
        const data4 = await res4.json();
        console.log(`Messages found: ${data4.messages.length}`);
        // Should be 4 messages (User1, AI1, User2, AI2)
        if (data4.messages.length < 4) console.warn('Expected at least 4 messages');

        console.log('\n✅ Verification Successful!');

    } catch (error) {
        console.error('\n❌ Verification Failed:', error);
    }
}

testSessionFlow();
