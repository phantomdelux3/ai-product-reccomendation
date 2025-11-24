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
        console.log('Connected to database');

        await client.query(`
      ALTER TABLE messages 
      ADD COLUMN IF NOT EXISTS is_reload BOOLEAN DEFAULT FALSE;
    `);

        console.log('Successfully added is_reload column to messages table');
        await client.end();

    } catch (error) {
        console.error('Error running migration:', error);
        process.exit(1);
    }
};

migrate();
