const express = require('express');
const router = express.Router();
const multer = require('multer');
const { postsPool } = require('../db/pool');
const { cloudinary } = require('../services/cloudinary');
const { getTrackIds, getTrackMeta, generateTrackBuffer } = require('../services/sample-tracks');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Cache generated audio buffers in memory (they're small ~1.3MB each)
const audioCache = {};

// GET /api/music — list all tracks (built-in + user-uploaded)
router.get('/', async (req, res) => {
  try {
    // Built-in sample tracks
    const builtIn = getTrackIds().map(id => ({
      ...getTrackMeta(id),
      builtin: true,
      url: `/api/music/sample/${id}.wav`,
    }));

    // User-uploaded tracks from DB
    let userTracks = [];
    try {
      const { rows } = await postsPool.query('SELECT * FROM music_tracks ORDER BY created_at DESC');
      userTracks = rows.map(r => ({ ...r, builtin: false }));
    } catch {
      // DB table might not exist yet — that's OK
    }

    res.json([...builtIn, ...userTracks]);
  } catch (err) {
    console.error('Music list error:', err);
    res.status(500).json({ error: 'Failed to fetch music library' });
  }
});

// GET /api/music/sample/:id.wav — serve a built-in sample track
router.get('/sample/:id.wav', (req, res) => {
  const id = req.params.id;
  if (!getTrackMeta(id)) return res.status(404).json({ error: 'Track not found' });

  // Generate and cache
  if (!audioCache[id]) {
    console.log(`[MUSIC] Generating built-in track: ${id}`);
    audioCache[id] = generateTrackBuffer(id);
  }

  res.set({
    'Content-Type': 'audio/wav',
    'Content-Length': audioCache[id].length,
    'Cache-Control': 'public, max-age=86400',
  });
  res.send(audioCache[id]);
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

// GET /api/music/freesound/search — search Freesound for royalty-free music
router.get('/freesound/search', async (req, res) => {
  const apiKey = process.env.FREESOUND_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'FREESOUND_API_KEY not configured. Get a free key at https://freesound.org/apiv2/apply' });

  const { q = 'background music', page = 1 } = req.query;
  try {
    const url = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(q)}&filter=duration:[5 TO 60] type:mp3&fields=id,name,username,duration,previews,tags,avg_rating&sort=rating_desc&page=${page}&page_size=20&token=${apiKey}`;
    const fsRes = await fetch(url);
    const data = await fsRes.json();
    if (data.detail) throw new Error(data.detail);

    const tracks = (data.results || []).map(s => ({
      id: `freesound-${s.id}`,
      name: s.name.replace(/\.[^.]+$/, '').slice(0, 60),
      artist: s.username,
      genre: 'freesound',
      mood: (s.tags || []).find(t => ['chill', 'energetic', 'dramatic', 'upbeat', 'emotional', 'inspiring'].includes(t)) || 'other',
      duration_seconds: Math.round(s.duration),
      rating: s.avg_rating,
      url: s.previews?.['preview-hq-mp3'] || s.previews?.['preview-lq-mp3'] || null,
      freesound_id: s.id,
      builtin: false,
      external: true,
    })).filter(t => t.url);

    res.json({
      tracks,
      count: data.count || 0,
      next: data.next ? true : false,
      page: Number(page),
    });
  } catch (err) {
    console.error('Freesound search error:', err);
    res.status(500).json({ error: err.message || 'Freesound search failed' });
  }
});

// DELETE /api/music/:id — delete a user-uploaded track
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
