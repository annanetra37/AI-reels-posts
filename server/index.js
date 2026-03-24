const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const businessesRouter = require('./routes/businesses');
const postsRouter = require('./routes/posts');
const musicRouter = require('./routes/music');

const { postsPool } = require('./db/pool');

const app = express();
const PORT = process.env.PORT || 3000;

// Auto-migrate: add per-platform tracking columns if missing
(async () => {
  try {
    await postsPool.query(`
      ALTER TABLE generated_posts ADD COLUMN IF NOT EXISTS posted_to_ig BOOLEAN DEFAULT FALSE;
      ALTER TABLE generated_posts ADD COLUMN IF NOT EXISTS posted_to_fb BOOLEAN DEFAULT FALSE;
      ALTER TABLE generated_posts ADD COLUMN IF NOT EXISTS repost_count INTEGER DEFAULT 0;
      ALTER TABLE generated_posts ADD COLUMN IF NOT EXISTS repost_history JSONB DEFAULT '[]';
    `);
    // Backfill existing rows: if meta_post_id is set, mark posted_to_ig; if fb_post_id, mark posted_to_fb
    await postsPool.query(`
      UPDATE generated_posts SET posted_to_ig = TRUE WHERE meta_post_id IS NOT NULL AND NOT posted_to_ig;
      UPDATE generated_posts SET posted_to_fb = TRUE WHERE fb_post_id IS NOT NULL AND NOT posted_to_fb;
    `);
    console.log('[DB] Per-platform tracking columns ready');
  } catch (err) {
    console.warn('[DB] Migration note:', err.message);
  }
})();

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
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Instagram Marketing System running on http://localhost:${PORT}`);
});
