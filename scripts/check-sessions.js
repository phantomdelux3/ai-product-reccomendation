const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const checkSessions = async () => {
    const client = new Client({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    const guestId = '46a1ed0c-07b4-4736-bee5-1a172908965c'; // From failed test

    try {
        await client.connect();
        console.log(`Checking sessions for Guest ID: ${guestId}`);

        const res = await client.query('SELECT * FROM sessions WHERE guest_id = $1', [guestId]);
        console.log(`Sessions found: ${res.rows.length}`);
        res.rows.forEach(row => {
            console.log(`- Session ID: ${row.id}, Name: ${row.session_name}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
};

checkSessions();
