const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const businessesRouter = require('./routes/businesses');
const postsRouter = require('./routes/posts');
const musicRouter = require('./routes/music');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[${req.method}] ${req.path}`);
  }
  next();
});

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/businesses', businessesRouter);
app.use('/api/posts', postsRouter);
app.use('/api/music', musicRouter);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// SPA fallback
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Instagram Marketing System running on http://localhost:${PORT}`);
});
