// db.js — pool PostgreSQL partagé
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[db] DATABASE_URL manquant dans .env');
  process.exit(1);
}

// Auto-détection SSL : active SSL si DB_SSL=true OU si l'URL contient alwaysdata.net
// (les connexions externes vers alwaysdata exigent souvent SSL)
const needsSsl = process.env.DB_SSL === 'true' || connectionString.includes('alwaysdata.net');

const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  // alwaysdata : max 50 connexions par user en Public Cloud — on reste large
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[db] Erreur pool PostgreSQL:', err.message);
});

// Helper query : promisifié avec params
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      console.log(`[db] slow query (${duration}ms):`, text.substring(0, 80));
    }
    return res;
  } catch (err) {
    console.error('[db] query error:', err.message, '\nSQL:', text.substring(0, 200));
    throw err;
  }
}

// Helper transaction
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
};
