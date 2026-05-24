const { Pool } = require('pg');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const execPromise = util.promisify(exec);

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'dummydb',
  user:     process.env.DB_USER     || 'dummyuser',
  password: process.env.DB_PASSWORD || 'dummypass',
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const BACKUP_DIR = process.env.BACKUP_DIR || '/tmp/db-backups';

// Créer le dossier de backup s'il n'existe pas
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS items (
        id        SERIAL PRIMARY KEY,
        name      VARCHAR(255) NOT NULL,
        value     TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS uploads (
        id          SERIAL PRIMARY KEY,
        filename    VARCHAR(255) NOT NULL,
        originalname VARCHAR(255),
        size        INTEGER,
        uploaded_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS backups (
        id          SERIAL PRIMARY KEY,
        filename    VARCHAR(255) NOT NULL,
        size_bytes  INTEGER,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        status      VARCHAR(50) DEFAULT 'completed'
      );
    `);
    console.log(' DB schema ready');
  } finally {
    client.release();
  }
}

// BACKUP FUNCTIONS


async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);
  
  const pgDumpCmd = `pg_dump -h ${pool.options.host} -p ${pool.options.port} -U ${pool.options.user} -d ${pool.options.database} -F p > "${filepath}"`;
  
  const env = { ...process.env, PGPASSWORD: pool.options.password };
  
  try {
    await execPromise(pgDumpCmd, { env, shell: true });
    const stats = fs.statSync(filepath);
    
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO backups (filename, size_bytes, status) VALUES ($1, $2, $3)`,
        [filename, stats.size, 'completed']
      );
    } finally {
      client.release();
    }
    
    return {
      success: true,
      filename,
      size_kb: (stats.size / 1024).toFixed(2),
      created_at: new Date().toISOString()
    };
  } catch (error) {
    console.error('Backup failed:', error);
    return { success: false, error: error.message };
  }
}

async function restoreBackup(filename = 'latest') {
  let backupFile;
  
  if (filename === 'latest') {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT filename FROM backups ORDER BY created_at DESC LIMIT 1`
      );
      if (rows.length === 0) {
        return { success: false, message: 'No backup found' };
      }
      backupFile = rows[0].filename;
    } finally {
      client.release();
    }
  } else {
    backupFile = filename;
  }
  
  const filepath = path.join(BACKUP_DIR, backupFile);
  
  if (!fs.existsSync(filepath)) {
    return { success: false, message: `Backup file not found: ${backupFile}` };
  }
  
  const psqlCmd = `psql -h ${pool.options.host} -p ${pool.options.port} -U ${pool.options.user} -d ${pool.options.database} < "${filepath}"`;
  const env = { ...process.env, PGPASSWORD: pool.options.password };
  
  try {
    await execPromise(psqlCmd, { env, shell: true });
    return { success: true, message: `Restored from: ${backupFile}` };
  } catch (error) {
    console.error('Restore failed:', error);
    return { success: false, message: error.message };
  }
}

async function listBackups() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, filename, size_bytes, created_at, status 
       FROM backups ORDER BY created_at DESC`
    );
    return rows.map(row => ({
      id: row.id,
      filename: row.filename,
      size_kb: Math.round(row.size_bytes / 1024),
      created_at: row.created_at,
      status: row.status
    }));
  } finally {
    client.release();
  }
}

async function getDbStats() {
  const client = await pool.connect();
  try {
    const itemsCount = await client.query('SELECT COUNT(*) FROM items');
    const uploadsCount = await client.query('SELECT COUNT(*) FROM uploads');
    const backupsCount = await client.query('SELECT COUNT(*) FROM backups');
    
    const sizeResult = await client.query(
      `SELECT pg_database_size($1) as size_bytes`,
      [pool.options.database]
    );
    
    return {
      items: parseInt(itemsCount.rows[0].count),
      uploads: parseInt(uploadsCount.rows[0].count),
      backups: parseInt(backupsCount.rows[0].count),
      db_size_mb: (parseInt(sizeResult.rows[0].size_bytes) / (1024 * 1024)).toFixed(2)
    };
  } finally {
    client.release();
  }
}

module.exports = { 
  pool, 
  initSchema, 
  createBackup, 
  restoreBackup, 
  listBackups,
  getDbStats 
};