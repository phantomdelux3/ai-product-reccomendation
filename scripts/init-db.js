const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const initDatabase = async () => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres'
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    // Check if database exists
    const dbCheck = await client.query(`
      SELECT 1 FROM pg_database WHERE datname = '${process.env.DB_NAME}'
    `);

    if (dbCheck.rows.length === 0) {
      await client.query(`CREATE DATABASE ${process.env.DB_NAME}`);
      console.log(`Database ${process.env.DB_NAME} created successfully`);
    } else {
      console.log(`Database ${process.env.DB_NAME} already exists`);
    }

    await client.end();

    // Connect to the target database
    const dbClient = new Client({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    await dbClient.connect();

    // Drop tables if they exist (for clean setup)
    await dbClient.query(`
      DROP TABLE IF EXISTS feedback CASCADE;
      DROP TABLE IF EXISTS user_preferences CASCADE;
      DROP TABLE IF EXISTS messages CASCADE;
      DROP TABLE IF EXISTS sessions CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);

    // Create users table
    await dbClient.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create tables
    await dbClient.query(`
      CREATE TABLE sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255),
        guest_id VARCHAR(255),
        session_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await dbClient.query(`
      CREATE TABLE messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
        user_content TEXT NOT NULL,
        assistant_content TEXT,
        product TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await dbClient.query(`
      CREATE TABLE user_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
        occasion VARCHAR(100),
        persona VARCHAR(100),
        age_range VARCHAR(50),
        gender VARCHAR(50),
        interests TEXT[],
        price_min DECIMAL(10,2),
        price_max DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id)
      );
    `);

    await dbClient.query(`
      CREATE TABLE feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
        message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
        product_id VARCHAR(255) NOT NULL,
        user_query TEXT,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        reason TEXT,
        feedback_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    await dbClient.query(`
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_messages_session_id ON messages(session_id);
      CREATE INDEX idx_messages_created_at ON messages(created_at);
      CREATE INDEX idx_feedback_session_id ON feedback(session_id);
      CREATE INDEX idx_feedback_message_id ON feedback(message_id);
      CREATE INDEX idx_feedback_product_id ON feedback(product_id);
      CREATE INDEX idx_user_preferences_session_id ON user_preferences(session_id);
      CREATE INDEX idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX idx_sessions_guest_id ON sessions(guest_id);
    `);

    console.log('All tables created successfully');
    await dbClient.end();

  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
};

initDatabase();