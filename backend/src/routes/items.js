const router = require('express').Router();
const { pool } = require('../db');

// GET /api/items
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM items ORDER BY created_at DESC LIMIT 50'
    );
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/items
router.post('/', async (req, res) => {
  const { name, value } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    const { rows } = await pool.query(
      'INSERT INTO items (name, value) VALUES ($1, $2) RETURNING *',
      [name, value || null]
    );
    res.status(201).json({ item: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/items/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM items WHERE id = $1', [id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
