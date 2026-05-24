const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { pool } = require('../db');

// Configuration S3 (LeaseWeb Object Storage)
const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'https://ca.object-storage.io',
  region: process.env.S3_REGION || 'ca-central-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true,  
});

const BUCKET = process.env.S3_BUCKET;

// Multer config (uniquement pour parser le fichier, pas pour stocker sur disque)
const upload = multer({
  storage: multer.memoryStorage(), // Stocke en mémoire, pas sur disque
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|txt|csv|doc|docx/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    if (ext) return cb(null, true);
    cb(new Error('File type not allowed'));
  },
});

// ==================== POST /api/upload ====================
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filename = `${Date.now()}-${req.file.originalname}`;
  const params = {
    Bucket: BUCKET,
    Key: filename,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  };

  try {
    await s3Client.send(new PutObjectCommand(params));
    
    // Sauvegarder l'info dans PostgreSQL
    const { rows } = await pool.query(
      `INSERT INTO uploads (filename, originalname, size)
       VALUES ($1, $2, $3) RETURNING *`,
      [filename, req.file.originalname, req.file.size]
    );
    
    res.status(201).json({
      upload: rows[0],
      url: `/api/upload/${filename}`,
    });
  } catch (err) {
    console.error('S3 upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== GET /api/upload ====================
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM uploads ORDER BY uploaded_at DESC LIMIT 50'
    );
    res.json({ uploads: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== GET /api/upload/:filename (DOWNLOAD) ====================
router.get('/:filename', async (req, res) => {
  const { filename } = req.params;

  try {
    const params = {
      Bucket: BUCKET,
      Key: filename,
    };
    
    const command = new GetObjectCommand(params);
    const response = await s3Client.send(command);
    
    // Récupérer le nom original depuis la DB
    const { rows } = await pool.query(
      'SELECT originalname FROM uploads WHERE filename = $1',
      [filename]
    );
    
    const originalName = rows[0]?.originalname || filename;
    
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
    res.setHeader('Content-Type', response.ContentType);
    
    // Streamer le fichier depuis S3
    response.Body.pipe(res);
  } catch (err) {
    if (err.name === 'NoSuchKey') {
      res.status(404).json({ error: 'File not found' });
    } else {
      console.error('Download error:', err);
      res.status(500).json({ error: err.message });
    }
  }
});

// ==================== DELETE /api/upload/:filename ====================
router.delete('/:filename', async (req, res) => {
  const { filename } = req.params;

  try {
    // Supprimer de S3
    const params = {
      Bucket: BUCKET,
      Key: filename,
    };
    await s3Client.send(new DeleteObjectCommand(params));
    
    // Supprimer de PostgreSQL
    await pool.query('DELETE FROM uploads WHERE filename = $1', [filename]);
    
    res.json({ success: true, message: `File "${filename}" deleted` });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== Multer error handler ====================
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 10MB)' });
  }
  res.status(400).json({ error: err.message });
});

module.exports = router;