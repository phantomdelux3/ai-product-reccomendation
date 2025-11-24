const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const migrate = async () => {
    const client = new Client({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        await client.connect();
        console.log('Connected to database...');

        // Add guest_id column if it doesn't exist
        await client.query(`
      ALTER TABLE sessions 
      ADD COLUMN IF NOT EXISTS guest_id VARCHAR(255);
    `);

        // Add index
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_guest_id ON sessions(guest_id);
    `);

        console.log('Migration successful: guest_id column added.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
};

migrate();
