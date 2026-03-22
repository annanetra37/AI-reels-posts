const express = require('express');
const router = express.Router();
const { smePool, postsPool } = require('../db/pool');
const { generateCaption } = require('../services/caption-agent');
const { generateLumaPrompt } = require('../services/luma-agent');
const { publishToInstagram } = require('../services/meta-api');
const { generateVideo, generateImage, pollGeneration } = require('../services/luma-api');
const { toPublicUrl } = require('../services/upload');

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
    let lumaResultUrl = null;
    let mediaUrls = [];

    // Step 1: Fetch business details
    send('status', { stage: 'fetching', message: '📦 Loading business details...' });
    send('log', { level: 'info', message: `Fetching details for ${businessIds.length} business(es): IDs [${businessIds.join(', ')}]` });
    const { rows: businesses } = await smePool.query(
      'SELECT id, name, category, description, short_tagline, tags, emoji, city, country FROM businesses WHERE id = ANY($1)',
      [businessIds]
    );
    send('log', { level: 'success', message: `Loaded ${businesses.length} business(es): ${businesses.map(b => b.name).join(', ')}` });

    // Step 2: Generate caption & hashtags
    send('status', { stage: 'caption', message: '✍️ Crafting the perfect caption & hashtags...' });
    send('log', { level: 'info', message: `Calling Anthropic API — style: "${postStyle}", type: "${postType}", languages: [${languages.join(', ')}]` });
    const captionResult = await generateCaption({
      businesses,
      postType,
      postStyle,
      languages,
      selectedPhotos,
    });
    send('log', { level: 'success', message: `Caption generated — ${Object.keys(captionResult.caption || {}).length} language(s), ${(captionResult.hashtags || '').split(' ').filter(Boolean).length} hashtags` });

    send('caption', captionResult);

    // Step 3: If reel or carousel, generate LumaLabs prompt
    let lumaResult = null;
    if (postType === 'reel' || postType === 'carousel') {
      send('status', { stage: 'luma', message: '🎬 Generating creative brief for visual content...' });
      send('log', { level: 'info', message: `Generating LumaLabs creative brief for ${postType}...` });
      lumaResult = await generateLumaPrompt({
        businesses,
        postType,
        postStyle,
        selectedPhotos,
        captionResult,
      });
      send('log', { level: 'success', message: `Luma brief ready — style: "${lumaResult.style || 'N/A'}", mood: "${lumaResult.mood || 'N/A'}"` });
      send('luma', lumaResult);

      // Step 3b: Call LumaLabs API to generate actual media
      if (process.env.LUMALABS_API_KEY && process.env.LUMALABS_API_KEY !== 'your-lumalabs-key') {
        send('status', { stage: 'luma_generating', message: '🎨 LumaLabs is generating your media...' });

        if (postType === 'reel') {
          // Generate video — require a public reference image to avoid paying for generic videos
          const rawPhoto = selectedPhotos?.[0] || null;
          const referenceImage = toPublicUrl(rawPhoto);
          if (!referenceImage) {
            send('log', { level: 'warn', message: 'No public reference image available — skipping LumaLabs video generation. Set PUBLIC_URL in .env if using base64 photos.' });
          } else {
            send('log', { level: 'info', message: `Calling LumaLabs video API with reference image...` });
            const gen = await generateVideo(lumaResult.prompt, referenceImage);
            send('log', { level: 'info', message: `LumaLabs generation started (ID: ${gen.id}). Polling for completion...` });

            const completed = await pollGeneration(gen.id);
            lumaResultUrl = completed.assets?.video || completed.video?.url || null;
            if (lumaResultUrl) {
              mediaUrls = [lumaResultUrl];
              send('log', { level: 'success', message: `Video generated: ${lumaResultUrl}` });
            } else {
              send('log', { level: 'warn', message: 'LumaLabs generation completed but no video URL returned' });
            }
          }
        } else if (postType === 'carousel') {
          // Generate images for each slide
          const slides = lumaResult.slides || [];
          send('log', { level: 'info', message: `Generating ${slides.length} carousel slide image(s) via LumaLabs...` });

          for (let i = 0; i < slides.length; i++) {
            const slide = slides[i];
            const slidePrompt = slide.prompt || lumaResult.prompt;
            send('log', { level: 'info', message: `Generating slide ${i + 1}/${slides.length}...` });

            const gen = await generateImage(slidePrompt);
            const completed = await pollGeneration(gen.id);
            const imageUrl = completed.assets?.image || null;
            if (imageUrl) {
              mediaUrls.push(imageUrl);
              send('log', { level: 'success', message: `Slide ${i + 1} ready: ${imageUrl}` });
            }
          }
          lumaResultUrl = mediaUrls[0] || null;
          send('log', { level: 'success', message: `Generated ${mediaUrls.length} carousel image(s)` });
        }
      } else {
        send('log', { level: 'warn', message: 'LUMALABS_API_KEY not set — skipping media generation. Set it in .env to enable.' });
      }
    } else {
      send('log', { level: 'info', message: `Post type "${postType}" — skipping LumaLabs generation` });
    }

    // Step 4: Save to DB
    send('status', { stage: 'saving', message: '💾 Saving your post...' });
    send('log', { level: 'info', message: 'Saving post to database...' });
    // caption is an object keyed by language — serialize to JSON for DB storage
    const captionForDB = typeof captionResult.caption === 'object'
      ? JSON.stringify(captionResult.caption)
      : captionResult.caption;

    const { rows: saved } = await postsPool.query(`
      INSERT INTO generated_posts
        (business_ids, post_type, post_style, languages, caption, hashtags,
         selected_photos, luma_prompt, luma_result_url, media_urls, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft')
      RETURNING *
    `, [
      businessIds,
      postType,
      postStyle,
      languages,
      captionForDB,
      captionResult.hashtags,
      selectedPhotos || [],
      lumaResult?.prompt || null,
      lumaResultUrl,
      mediaUrls.length > 0 ? mediaUrls : null,
    ]);

    send('log', { level: 'success', message: `Post saved with ID: ${saved[0].id}` });

    send('complete', {
      post: saved[0],
      caption: captionResult,
      luma: lumaResult,
      mediaUrls,
    });

    send('status', { stage: 'done', message: '✅ Post ready for preview!' });
    send('log', { level: 'success', message: 'Generation complete — post ready for preview!' });
    res.end();
  } catch (err) {
    console.error('Generation error:', err);
    send('log', { level: 'error', message: `ERROR: ${err.message}` });
    send('error', { message: err.message || 'Generation failed' });
    res.end();
  }
});

// POST /api/posts/:id/publish — publish to Instagram via Meta Graph API
router.post('/:id/publish', async (req, res) => {
  try {
    const { rows } = await postsPool.query('SELECT * FROM generated_posts WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });

    const post = rows[0];
    const fullCaption = `${post.caption}\n\n${post.hashtags}`;

    const result = await publishToInstagram({
      postType: post.post_type,
      caption: fullCaption,
      mediaUrls: post.media_urls || post.selected_photos,
    });

    await postsPool.query(`
      UPDATE generated_posts SET status = 'posted', meta_post_id = $1, posted_at = NOW()
      WHERE id = $2
    `, [result.id, post.id]);

    res.json({ success: true, metaPostId: result.id });
  } catch (err) {
    console.error('Publish error:', err);
    await postsPool.query("UPDATE generated_posts SET status = 'failed' WHERE id = $1", [req.params.id]);
    res.status(500).json({ error: err.message || 'Publishing failed' });
  }
});

// PUT /api/posts/:id — update a draft post (edit caption, etc.)
router.put('/:id', async (req, res) => {
  const { caption, hashtags, selectedPhotos } = req.body;
  try {
    const { rows } = await postsPool.query(`
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
    const { rows } = await postsPool.query('SELECT * FROM generated_posts ORDER BY created_at DESC LIMIT 50');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

module.exports = router;
