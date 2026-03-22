const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const businessesRouter = require('./routes/businesses');
const postsRouter = require('./routes/posts');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/businesses', businessesRouter);
app.use('/api/posts', postsRouter);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Instagram Marketing System running on http://localhost:${PORT}`);
});
