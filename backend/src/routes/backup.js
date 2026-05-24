const router = require('express').Router();
const { createBackup, restoreBackup, listBackups, getDbStats } = require('../db');

// GET /api/backup/stats - Database statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await getDbStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/list - List all backups
router.get('/list', async (req, res) => {
  try {
    const backups = await listBackups();
    res.json({ backups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/create - Create a new backup
router.post('/create', async (req, res) => {
  try {
    const result = await createBackup();
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/restore - Restore from backup
router.post('/restore', async (req, res) => {
  const { filename } = req.body;
  try {
    const result = await restoreBackup(filename || 'latest');
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;