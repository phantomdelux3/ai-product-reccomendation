import 'dotenv/config';
import pool from '../lib/db';

async function updateSchema() {
    try {
        console.log('Attempting to connect to DB...');
        const client = await pool.connect();
        console.log('Connected successfully.');

        console.log('Adding is_guided column to messages table...');
        await client.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS is_guided BOOLEAN DEFAULT FALSE;
        `);
        console.log('Successfully added is_guided column.');
        client.release();
    } catch (error) {
        console.error('Error updating schema:', error);
    } finally {
        await pool.end();
    }
}

updateSchema();
