import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';

const { Pool } = pg;

// Resolve paths so .env is reliably loaded whether executed from root or inside server/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prioritize server/.env, fallback to root .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * PostgreSQL Database Configuration Object
 */
export const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'postgres',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_TIMEOUT_MS || '5000', 10),
};

/**
 * PostgreSQL Connection Pool Instance
 */
export const pool = new Pool(dbConfig);

// Catch unexpected errors on idle pool clients
pool.on('error', (err) => {
  console.error('[DB Pool Error] Unexpected idle client error:', err.message);
});

/**
 * Execute a query with the pool
 * @param {string} text - SQL Query
 * @param {Array} [params] - Query Parameters
 */
export const query = (text, params) => pool.query(text, params);

/**
 * Health check function to verify connection and ping the database
 * @returns {Promise<object>} Status object detailing connection health
 */
export async function checkDatabaseConnection() {
  const startTime = Date.now();
  let client;

  try {
    // Acquire a client from the pool
    client = await pool.connect();

    // Run a lightweight probe query
    const result = await client.query(`
      SELECT 
        NOW() AS server_time,
        current_database() AS database_name,
        version() AS pg_version
    `);

    const latencyMs = Date.now() - startTime;
    const row = result.rows[0];

    return {
      connected: true,
      latencyMs,
      database: row.database_name,
      serverTime: row.server_time,
      version: row.pg_version,
      config: {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        database: dbConfig.database,
        ssl: Boolean(dbConfig.ssl),
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    return {
      connected: false,
      latencyMs,
      error: error.message,
      code: error.code || 'CONNECTION_FAILED',
      config: {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        database: dbConfig.database,
        ssl: Boolean(dbConfig.ssl),
      },
    };
  } finally {
    // Release client back to pool
    if (client) {
      client.release();
    }
  }
}

export default {
  dbConfig,
  pool,
  query,
  checkDatabaseConnection,
};
