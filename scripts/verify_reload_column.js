const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const verify = async () => {
    const client = new Client({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        await client.connect();
        const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'messages' AND column_name = 'is_reload';
    `);

        if (res.rows.length > 0) {
            console.log('Verification SUCCESS: is_reload column exists.');
            console.log(res.rows[0]);
        } else {
            console.error('Verification FAILED: is_reload column NOT found.');
            process.exit(1);
        }
        await client.end();

    } catch (error) {
        console.error('Verification error:', error);
        process.exit(1);
    }
};

verify();
