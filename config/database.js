const { Pool } = require('pg');
require('dotenv').config();

// ==================================================================
// POOL DE CONEXIONES POSTGRES (USO COMPARTIDO EN TODO EL PROYECTO)
// ==================================================================
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'mindcare_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
});

pool.on('connect', () => {
    console.log('✓ Conectado a la base de datos PostgreSQL');
});

pool.on('error', err => {
    console.error('Error inesperado en el pool de conexiones:', err);
    // En servidores productivos podrías quitar este exit y manejar con PM2 / supervisor
    process.exit(-1);
});

// Helper simple: db.query(...)
const query = (text, params) => pool.query(text, params);

/**
 * Helper para ejecutar transacciones con una sola función:
 *
 *   await db.transaction(async (client) => {
 *       await client.query('...');
 *       await client.query('...');
 *   });
 */
const transaction = async callback => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {
            // ignorar error de rollback
        }
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    pool,
    query,
    transaction
};
