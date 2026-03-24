const express = require('express');
const router = express.Router();
const multer = require('multer');
const { postsPool } = require('../db/pool');
const { cloudinary } = require('../services/cloudinary');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// GET /api/music — list all tracks
router.get('/', async (req, res) => {
  try {
    const { rows } = await postsPool.query('SELECT * FROM music_tracks ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('Music list error:', err);
    res.status(500).json({ error: 'Failed to fetch music library' });
  }
});

// POST /api/music — upload a new track
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { name, artist, genre, mood } = req.body;
  if (!name) return res.status(400).json({ error: 'Track name is required' });

  try {
    // Upload to Cloudinary as raw/audio
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'music-library', resource_type: 'video' },
        (err, result) => err ? reject(err) : resolve(result)
      );
      stream.end(req.file.buffer);
    });

    const { rows } = await postsPool.query(`
      INSERT INTO music_tracks (name, artist, duration_seconds, genre, mood, url, public_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      name,
      artist || null,
      Math.round(result.duration || 0),
      genre || null,
      mood || null,
      result.secure_url,
      result.public_id,
    ]);

    res.json(rows[0]);
  } catch (err) {
    console.error('Music upload error:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// DELETE /api/music/:id — delete a track
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await postsPool.query('SELECT * FROM music_tracks WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Track not found' });

    // Delete from Cloudinary
    if (rows[0].public_id) {
      await cloudinary.uploader.destroy(rows[0].public_id, { resource_type: 'video' });
    }

    await postsPool.query('DELETE FROM music_tracks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Music delete error:', err);
    res.status(500).json({ error: 'Failed to delete track' });
  }
});

module.exports = router;
