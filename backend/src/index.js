require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./db');
const uploadRouter = require('./routes/upload');
const healthRouter = require('./routes/health');
const itemsRouter = require('./routes/items');
const backupRouter = require('./routes/backup');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet());

// CORS — allow only frontend origin in production
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || '*',
  methods: ['GET', 'POST', 'DELETE'],
}));

// Rate limiting — 100 req/min per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});
app.use(limiter);

app.use(express.json());

// Serve uploaded files statically
app.use('/files', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/health', healthRouter);
app.use('/api/items', itemsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/backup', backupRouter);
app.use('/files', uploadRouter);



// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Init DB then start
db.initSchema()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Backend running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('DB init failed:', err.message);
    process.exit(1);
  });

module.exports = app;
