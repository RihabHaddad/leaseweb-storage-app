const router = require('express').Router();
const { pool } = require('../db');

// GET /health — returns app + DB status
router.get('/', async (req, res) => {
  const result = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: 'unknown',
  };

  try {
    const { rows } = await pool.query('SELECT NOW() AS now');
    result.db = 'ok';
    result.db_time = rows[0].now;
  } catch (err) {
    result.db = 'error';
    result.db_error = err.message;
    return res.status(503).json(result);
  }

  res.json(result);
});

module.exports = router;
