import pool from '../lib/db';

async function updateSchema() {
    try {
        console.log('Adding is_guided column to messages table...');
        await pool.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS is_guided BOOLEAN DEFAULT FALSE;
        `);
        console.log('Successfully added is_guided column.');
    } catch (error) {
        console.error('Error updating schema:', error);
    } finally {
        await pool.end();
    }
}

updateSchema();
