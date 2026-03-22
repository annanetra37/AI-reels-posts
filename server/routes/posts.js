const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { generateCaption } = require('../services/caption-agent');
const { generateLumaPrompt } = require('../services/luma-agent');
const { publishToInstagram } = require('../services/meta-api');

// POST /api/posts/generate — generate a post (caption, hashtags, luma prompt)
router.post('/generate', async (req, res) => {
  const { businessIds, postType, postStyle, languages, selectedPhotos } = req.body;

  if (!businessIds?.length || !postType || !postStyle || !languages?.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Use SSE for real-time status updates
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Step 1: Fetch business details
    send('status', { stage: 'fetching', message: '📦 Loading business details...' });
    const { rows: businesses } = await pool.query(
      'SELECT id, name, category, description, short_tagline, tags, emoji, city, country FROM businesses WHERE id = ANY($1)',
      [businessIds]
    );

    // Step 2: Generate caption & hashtags
    send('status', { stage: 'caption', message: '✍️ Crafting the perfect caption & hashtags...' });
    const captionResult = await generateCaption({
      businesses,
      postType,
      postStyle,
      languages,
      selectedPhotos,
    });

    send('caption', captionResult);

    // Step 3: If reel or carousel, generate LumaLabs prompt
    let lumaResult = null;
    if (postType === 'reel' || postType === 'carousel') {
      send('status', { stage: 'luma', message: '🎬 Generating creative brief for visual content...' });
      lumaResult = await generateLumaPrompt({
        businesses,
        postType,
        postStyle,
        selectedPhotos,
        captionResult,
      });
      send('luma', lumaResult);
    }

    // Step 4: Save to DB
    send('status', { stage: 'saving', message: '💾 Saving your post...' });
    const { rows: saved } = await pool.query(`
      INSERT INTO generated_posts
        (business_ids, post_type, post_style, languages, caption, hashtags,
         selected_photos, luma_prompt, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
      RETURNING *
    `, [
      businessIds,
      postType,
      postStyle,
      languages,
      captionResult.caption,
      captionResult.hashtags,
      selectedPhotos || [],
      lumaResult?.prompt || null,
    ]);

    send('complete', {
      post: saved[0],
      caption: captionResult,
      luma: lumaResult,
    });

    send('status', { stage: 'done', message: '✅ Post ready for preview!' });
    res.end();
  } catch (err) {
    console.error('Generation error:', err);
    send('error', { message: err.message || 'Generation failed' });
    res.end();
  }
});

// POST /api/posts/:id/publish — publish to Instagram via Meta Graph API
router.post('/:id/publish', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM generated_posts WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });

    const post = rows[0];
    const fullCaption = `${post.caption}\n\n${post.hashtags}`;

    const result = await publishToInstagram({
      postType: post.post_type,
      caption: fullCaption,
      mediaUrls: post.media_urls || post.selected_photos,
    });

    await pool.query(`
      UPDATE generated_posts SET status = 'posted', meta_post_id = $1, posted_at = NOW()
      WHERE id = $2
    `, [result.id, post.id]);

    res.json({ success: true, metaPostId: result.id });
  } catch (err) {
    console.error('Publish error:', err);
    await pool.query("UPDATE generated_posts SET status = 'failed' WHERE id = $1", [req.params.id]);
    res.status(500).json({ error: err.message || 'Publishing failed' });
  }
});

// PUT /api/posts/:id — update a draft post (edit caption, etc.)
router.put('/:id', async (req, res) => {
  const { caption, hashtags, selectedPhotos } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE generated_posts
      SET caption = COALESCE($1, caption),
          hashtags = COALESCE($2, hashtags),
          selected_photos = COALESCE($3, selected_photos)
      WHERE id = $4
      RETURNING *
    `, [caption, hashtags, selectedPhotos, req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// GET /api/posts — list all posts
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM generated_posts ORDER BY created_at DESC LIMIT 50');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

module.exports = router;
