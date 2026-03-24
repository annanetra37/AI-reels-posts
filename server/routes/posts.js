const express = require('express');
const router = express.Router();
const multer = require('multer');
const { smePool, postsPool } = require('../db/pool');
const { generateCaption } = require('../services/caption-agent');
const { generateLumaPrompt } = require('../services/luma-agent');
const { publishToInstagram, publishToFacebook } = require('../services/meta-api');
const { getProvider, isConfigured } = require('../services/video-provider');
const { toPublicUrl } = require('../services/upload');
const { createStoryCollage } = require('../services/story-collage');
const { uploadBuffer } = require('../services/cloudinary');
const { mergeAudioWithVideo, createVideoFromImage } = require('../services/audio-merge');

// POST /api/posts/upload-video — upload a user-provided video to Cloudinary
const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

router.post('/upload-video', videoUpload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });

  try {
    const { cloudinary } = require('../services/cloudinary');
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'uploaded-videos', resource_type: 'video' },
        (err, result) => err ? reject(err) : resolve(result)
      );
      stream.end(req.file.buffer);
    });
    console.log(`[UPLOAD] Video uploaded to Cloudinary: ${result.secure_url}`);
    res.json({ url: result.secure_url, duration: result.duration });
  } catch (err) {
    console.error('[UPLOAD] Video upload error:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// POST /api/posts/generate — generate a post (caption, hashtags, luma prompt)
router.post('/generate', async (req, res) => {
  const { businessIds, postType, postStyle, videoModel: rawVideoModel, videoQuality, languages, selectedPhotos, customDescription, music, uploadedVideoUrl } = req.body;
  const videoModel = rawVideoModel || 'luma';

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
    // Mirror all events to backend terminal
    if (event === 'log' || event === 'status') {
      const prefix = event === 'status' ? '[STATUS]' : `[${(data.level || 'info').toUpperCase()}]`;
      console.log(`${prefix} ${data.message}`);
    }
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
      customDescription,
    });
    send('log', { level: 'success', message: `Caption generated — ${Object.keys(captionResult.caption || {}).length} language(s), ${(captionResult.hashtags || '').split(' ').filter(Boolean).length} hashtags` });

    send('caption', captionResult);

    // Step 3: If user uploaded their own video, skip all AI video generation
    if (uploadedVideoUrl) {
      send('status', { stage: 'uploaded', message: '✅ Using your uploaded video' });
      send('log', { level: 'success', message: `Using uploaded video: ${uploadedVideoUrl}` });
      mediaUrls.push(uploadedVideoUrl);
    }

    // Step 3a: For stories with multiple photos, create a collage image
    else if (postType === 'story' && selectedPhotos?.length > 1) {
      send('status', { stage: 'collage', message: '🖼️ Creating story collage from your photos...' });
      send('log', { level: 'info', message: `Compositing ${selectedPhotos.length} photos into a single 1080×1920 story image...` });
      const collageBuf = await createStoryCollage(selectedPhotos);
      const { url: collageUrl } = await uploadBuffer(collageBuf, 'story-collages');
      mediaUrls.push(collageUrl);
      send('log', { level: 'success', message: `Story collage ready: ${collageUrl}` });
    }

    // Step 3b: If reel, animation, or carousel, generate LumaLabs prompt (skip if user uploaded video)
    const needsLuma = !uploadedVideoUrl && (postType === 'reel' || postType === 'carousel' || postStyle === 'animation');
    let lumaResult = null;
    if (needsLuma) {
      send('status', { stage: 'luma', message: '🎬 Generating creative brief for visual content...' });
      send('log', { level: 'info', message: `Generating LumaLabs creative brief for ${postType}...` });
      lumaResult = await generateLumaPrompt({
        businesses,
        postType,
        postStyle,
        selectedPhotos,
        captionResult,
        customDescription,
        music,
      });
      send('log', { level: 'success', message: `Luma brief ready — style: "${lumaResult.style || 'N/A'}", mood: "${lumaResult.mood || 'N/A'}"` });
      send('luma', lumaResult);

      // Step 3b: Call video provider API to generate actual media
      const provider = getProvider(videoModel);
      if (provider.api.setResolution) provider.api.setResolution(videoQuality || '1080p');
      const { generateVideo, generateImage, addAudio, pollGeneration } = provider.api;

      if (!isConfigured(videoModel)) {
        send('log', { level: 'warn', message: `${provider.name} not configured — ${provider.envKey} not set in .env. Skipping media generation.` });
      } else {
        send('status', { stage: 'luma_generating', message: `🎨 ${provider.name} is generating your media...` });

        if (postType === 'reel' || postStyle === 'animation') {
          // Convert all selected photos to public URLs (via Cloudinary)
          const publicPhotos = (await Promise.all(
            (selectedPhotos || []).map(p => toPublicUrl(p))
          )).filter(Boolean);

          if (publicPhotos.length === 0) {
            send('log', { level: 'warn', message: 'No public reference images available — skipping video generation. Ensure Cloudinary is configured in .env.' });
          } else {
            const pairs = [];
            if (postStyle === 'animation') {
              pairs.push({ start: publicPhotos[0], end: null, duration: '5s' });
            } else if (publicPhotos.length === 1) {
              pairs.push({ start: publicPhotos[0], end: null, duration: '5s' });
            } else if (publicPhotos.length === 2) {
              pairs.push({ start: publicPhotos[0], end: publicPhotos[1], duration: '9s' });
            } else {
              for (let i = 0; i < publicPhotos.length; i += 2) {
                if (i + 1 < publicPhotos.length) {
                  pairs.push({ start: publicPhotos[i], end: publicPhotos[i + 1], duration: '9s' });
                } else {
                  pairs.push({ start: publicPhotos[i], end: null, duration: '5s' });
                }
              }
            }

            const segments = lumaResult.segments || [{ prompt: lumaResult.prompt }];
            const totalEstimate = pairs.reduce((s, p) => s + parseInt(p.duration), 0);
            send('log', { level: 'info', message: `[${provider.name}] Generating ${pairs.length} video segment(s) from ${publicPhotos.length} photos (~${totalEstimate}s total)...` });

            const generations = []; // { id, _submission } for each segment
            for (let i = 0; i < pairs.length; i++) {
              const pair = pairs[i];
              const segmentPrompt = segments[i]?.prompt || lumaResult.prompt;

              send('log', { level: 'info', message: `Segment ${i + 1}/${pairs.length}: ${pair.duration} video${pair.end ? ' (transition between 2 photos)' : ' (single photo)'}...` });
              const gen = await generateVideo(segmentPrompt, pair.start, pair.end, pair.duration);
              send('log', { level: 'info', message: `${provider.name} generation started (ID: ${gen.id}). Polling for completion...` });

              const completed = await pollGeneration(gen.id, gen._submission);
              generations.push(gen);
              const videoUrl = completed.assets?.video || completed.video?.url || null;
              if (videoUrl) {
                mediaUrls.push(videoUrl);
                send('log', { level: 'success', message: `Segment ${i + 1} ready: ${videoUrl}` });
              } else {
                send('log', { level: 'warn', message: `Segment ${i + 1}: ${provider.name} completed but no video URL returned` });
              }
            }

            // Add audio/music if requested (only if provider supports it)
            if (music === 'auto' && generations.length > 0 && provider.supportsAudio) {
              const audioPrompt = lumaResult.musicSuggestion || 'upbeat modern background music matching the brand energy';
              send('status', { stage: 'luma_audio', message: '🎵 Adding AI-generated music...' });
              send('log', { level: 'info', message: `Adding music to ${generations.length} segment(s): "${audioPrompt.slice(0, 80)}..."` });

              for (let i = 0; i < generations.length; i++) {
                try {
                  const audioGen = await addAudio(generations[i].id, audioPrompt);
                  const audioId = audioGen.id || generations[i].id;
                  send('log', { level: 'info', message: `Audio generation started for segment ${i + 1} (ID: ${audioId}). Polling...` });
                  const audioCompleted = await pollGeneration(audioId, audioGen._submission);
                  const audioVideoUrl = audioCompleted.assets?.video || null;
                  if (audioVideoUrl) {
                    mediaUrls[i] = audioVideoUrl;
                    send('log', { level: 'success', message: `Segment ${i + 1} with music ready: ${audioVideoUrl}` });
                  } else {
                    send('log', { level: 'warn', message: `Segment ${i + 1}: audio done but no new URL — keeping silent version` });
                  }
                } catch (audioErr) {
                  send('log', { level: 'warn', message: `Audio failed for segment ${i + 1}: ${audioErr.message}. Keeping silent version.` });
                }
              }
            } else if (music === 'auto' && !provider.supportsAudio) {
              send('log', { level: 'warn', message: `${provider.name} does not support audio generation — skipping music. Consider using LumaLabs for music support.` });
            }

            lumaResultUrl = mediaUrls[0] || null;
            send('log', { level: 'success', message: `Generated ${mediaUrls.length} video segment(s) — total ~${totalEstimate}s reel` });
          }
        } else if (postType === 'carousel') {
          if (!provider.supportsImage) {
            // Fall back to Luma for carousel image generation
            const lumaProvider = getProvider('luma');
            if (isConfigured('luma')) {
              send('log', { level: 'info', message: `${provider.name} doesn't support image generation — using LumaLabs for carousel slides.` });
              const { generateImage: lumaGenerateImage, pollGeneration: lumaPoll } = lumaProvider.api;
              const slides = lumaResult.slides || [];
              send('log', { level: 'info', message: `Generating ${slides.length} carousel slide image(s) via LumaLabs...` });

              for (let i = 0; i < slides.length; i++) {
                const slide = slides[i];
                const slidePrompt = slide.prompt || lumaResult.prompt;
                send('log', { level: 'info', message: `Generating slide ${i + 1}/${slides.length}...` });

                const gen = await lumaGenerateImage(slidePrompt);
                const completed = await lumaPoll(gen.id);
                const imageUrl = completed.assets?.image || null;
                if (imageUrl) {
                  mediaUrls.push(imageUrl);
                  send('log', { level: 'success', message: `Slide ${i + 1} ready: ${imageUrl}` });
                }
              }
            } else {
              send('log', { level: 'warn', message: `${provider.name} doesn't support image generation and LumaLabs is not configured. Skipping carousel slides.` });
            }
          } else {
            const slides = lumaResult.slides || [];
            send('log', { level: 'info', message: `Generating ${slides.length} carousel slide image(s) via ${provider.name}...` });

            for (let i = 0; i < slides.length; i++) {
              const slide = slides[i];
              const slidePrompt = slide.prompt || lumaResult.prompt;
              send('log', { level: 'info', message: `Generating slide ${i + 1}/${slides.length}...` });

              const gen = await generateImage(slidePrompt);
              const completed = await pollGeneration(gen.id, gen._submission);
              const imageUrl = completed.assets?.image || null;
              if (imageUrl) {
                mediaUrls.push(imageUrl);
                send('log', { level: 'success', message: `Slide ${i + 1} ready: ${imageUrl}` });
              }
            }
          }
          lumaResultUrl = mediaUrls[0] || null;
          send('log', { level: 'success', message: `Generated ${mediaUrls.length} carousel image(s)` });
        }
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

// POST /api/posts/:id/regenerate-video — regenerate only the video, keep caption
router.post('/:id/regenerate-video', async (req, res) => {
  const { videoModel: rawVideoModel, videoQuality, music } = req.body;
  const videoModel = rawVideoModel || 'luma';

  // SSE for real-time updates
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (event === 'log' || event === 'status') {
      const prefix = event === 'status' ? '[STATUS]' : `[${(data.level || 'info').toUpperCase()}]`;
      console.log(`${prefix} ${data.message}`);
    }
  };

  try {
    // Load existing post
    const { rows } = await postsPool.query('SELECT * FROM generated_posts WHERE id = $1', [req.params.id]);
    if (!rows.length) {
      send('error', { message: 'Post not found' });
      res.end();
      return;
    }

    const post = rows[0];
    const selectedPhotos = post.selected_photos || [];
    const postType = post.post_type;
    const postStyle = post.post_style;

    send('status', { stage: 'luma', message: '🎬 Regenerating creative brief...' });

    // Fetch business details for the creative brief
    const { rows: businesses } = await smePool.query(
      'SELECT id, name, category, description, short_tagline, tags, emoji, city, country FROM businesses WHERE id = ANY($1)',
      [post.business_ids]
    );

    // Parse caption back
    let captionResult = {};
    try {
      captionResult = { caption: JSON.parse(post.caption), hashtags: post.hashtags };
    } catch {
      captionResult = { caption: { en: post.caption || '' }, hashtags: post.hashtags };
    }

    // Generate a new creative brief
    const lumaResult = await generateLumaPrompt({
      businesses,
      postType,
      postStyle,
      selectedPhotos,
      captionResult,
      music: music || 'none',
    });
    send('log', { level: 'success', message: `New brief ready — style: "${lumaResult.style || 'N/A'}", mood: "${lumaResult.mood || 'N/A'}"` });
    send('luma', lumaResult);

    // Generate video
    const provider = getProvider(videoModel);
    if (provider.api.setResolution) provider.api.setResolution(videoQuality || '1080p');
    const { generateVideo, pollGeneration, addAudio } = provider.api;
    let mediaUrls = [];

    if (!isConfigured(videoModel)) {
      send('log', { level: 'warn', message: `${provider.name} not configured — ${provider.envKey} not set in .env.` });
    } else {
      send('status', { stage: 'luma_generating', message: `🎨 ${provider.name} is generating your video...` });

      const publicPhotos = (await Promise.all(
        selectedPhotos.map(p => toPublicUrl(p))
      )).filter(Boolean);

      if (publicPhotos.length === 0) {
        send('log', { level: 'warn', message: 'No public reference images available.' });
      } else {
        const pairs = [];
        if (postStyle === 'animation') {
          pairs.push({ start: publicPhotos[0], end: null, duration: '5s' });
        } else if (publicPhotos.length === 1) {
          pairs.push({ start: publicPhotos[0], end: null, duration: '5s' });
        } else if (publicPhotos.length === 2) {
          pairs.push({ start: publicPhotos[0], end: publicPhotos[1], duration: '9s' });
        } else {
          for (let i = 0; i < publicPhotos.length; i += 2) {
            if (i + 1 < publicPhotos.length) {
              pairs.push({ start: publicPhotos[i], end: publicPhotos[i + 1], duration: '9s' });
            } else {
              pairs.push({ start: publicPhotos[i], end: null, duration: '5s' });
            }
          }
        }

        const segments = lumaResult.segments || [{ prompt: lumaResult.prompt }];
        const generations = [];

        for (let i = 0; i < pairs.length; i++) {
          const pair = pairs[i];
          const segmentPrompt = segments[i]?.prompt || lumaResult.prompt;

          send('log', { level: 'info', message: `Segment ${i + 1}/${pairs.length}: ${pair.duration} video...` });
          const gen = await generateVideo(segmentPrompt, pair.start, pair.end, pair.duration);
          send('log', { level: 'info', message: `${provider.name} generation started (ID: ${gen.id}). Polling...` });

          const completed = await pollGeneration(gen.id, gen._submission);
          generations.push(gen);
          const videoUrl = completed.assets?.video || completed.video?.url || null;
          if (videoUrl) {
            mediaUrls.push(videoUrl);
            send('log', { level: 'success', message: `Segment ${i + 1} ready: ${videoUrl}` });
          }
        }

        // Audio
        if (music === 'auto' && generations.length > 0 && provider.supportsAudio) {
          const audioPrompt = lumaResult.musicSuggestion || 'upbeat modern background music matching the brand energy';
          send('status', { stage: 'luma_audio', message: '🎵 Adding AI-generated music...' });
          for (let i = 0; i < generations.length; i++) {
            try {
              const audioGen = await addAudio(generations[i].id, audioPrompt);
              const audioId = audioGen.id || generations[i].id;
              const audioCompleted = await pollGeneration(audioId, audioGen._submission);
              const audioVideoUrl = audioCompleted.assets?.video || null;
              if (audioVideoUrl) mediaUrls[i] = audioVideoUrl;
            } catch (audioErr) {
              send('log', { level: 'warn', message: `Audio failed: ${audioErr.message}` });
            }
          }
        }
      }
    }

    // Update post in DB with new media
    if (mediaUrls.length > 0) {
      await postsPool.query(
        'UPDATE generated_posts SET media_urls = $1, luma_prompt = $2, luma_result_url = $3 WHERE id = $4',
        [mediaUrls, lumaResult?.prompt || null, mediaUrls[0], post.id]
      );
    }

    send('complete', { post: { ...post, media_urls: mediaUrls }, mediaUrls });
    send('status', { stage: 'done', message: '✅ Video regenerated!' });
    res.end();
  } catch (err) {
    console.error('Regenerate video error:', err);
    send('log', { level: 'error', message: `ERROR: ${err.message}` });
    send('error', { message: err.message || 'Video regeneration failed' });
    res.end();
  }
});

// POST /api/posts/:id/trim-video — trim a video using ffmpeg
router.post('/:id/trim-video', async (req, res) => {
  const { startTime, endTime, mediaIndex } = req.body;
  const idx = mediaIndex || 0;

  try {
    const { rows } = await postsPool.query('SELECT * FROM generated_posts WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });

    const post = rows[0];
    const mediaUrls = post.media_urls || [];
    const videoUrl = mediaUrls[idx];
    if (!videoUrl) return res.status(400).json({ error: 'No video at that index' });

    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');

    // Download video to temp file
    const tmpDir = path.join(__dirname, '../../tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const inputPath = path.join(tmpDir, `trim_input_${post.id}_${idx}.mp4`);
    const outputPath = path.join(tmpDir, `trim_output_${post.id}_${idx}.mp4`);

    const videoRes = await fetch(videoUrl);
    const buffer = Buffer.from(await videoRes.arrayBuffer());
    fs.writeFileSync(inputPath, buffer);

    // Trim with ffmpeg
    const duration = (endTime - startTime).toFixed(2);
    execSync(`ffmpeg -y -i "${inputPath}" -ss ${startTime.toFixed(2)} -t ${duration} -c copy "${outputPath}"`, {
      timeout: 30000,
    });

    // Upload trimmed video to Cloudinary
    const { cloudinary } = require('../services/cloudinary');
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(outputPath, {
        resource_type: 'video',
        folder: 'trimmed-reels',
      }, (err, result) => err ? reject(err) : resolve(result));
    });

    // Clean up temp files
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}

    // Update DB
    mediaUrls[idx] = uploadResult.secure_url;
    await postsPool.query(
      'UPDATE generated_posts SET media_urls = $1, luma_result_url = $2 WHERE id = $3',
      [mediaUrls, mediaUrls[0], post.id]
    );

    res.json({ success: true, mediaUrls, trimmedUrl: uploadResult.secure_url });
  } catch (err) {
    console.error('Trim error:', err);
    res.status(500).json({ error: err.message || 'Trim failed' });
  }
});

// POST /api/posts/:id/publish — publish to Instagram and/or Facebook
router.post('/:id/publish', async (req, res) => {
  const { instagram = true, facebook = false, musicTrackUrl = null } = req.body || {};
  console.log(`[PUBLISH] Starting publish for post ID: ${req.params.id} — IG: ${instagram}, FB: ${facebook}, music: ${musicTrackUrl ? 'yes' : 'none'}`);
  try {
    const { rows } = await postsPool.query('SELECT * FROM generated_posts WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });

    const post = rows[0];
    const fullCaption = `${post.caption}\n\n${post.hashtags}`;
    let mediaUrls = [...(post.media_urls || post.selected_photos || [])];
    console.log(`[PUBLISH] Post type: ${post.post_type}, style: ${post.post_style}, media URLs: ${mediaUrls.length}`);

    // If a music track is selected, merge audio into the media
    if (musicTrackUrl && mediaUrls.length > 0) {
      console.log(`[PUBLISH] Merging music track into media...`);
      const isVideo = mediaUrls[0].match(/\.(mp4|mov|avi|webm)$/i) || post.post_type === 'reel';

      if (isVideo) {
        // Merge audio into existing video
        const mergedUrl = await mergeAudioWithVideo(mediaUrls[0], musicTrackUrl, { replaceAudio: false });
        mediaUrls[0] = mergedUrl;
        console.log(`[PUBLISH] Music merged into video: ${mergedUrl}`);
      } else {
        // Image + music → create a video (15s for stories, 30s for images)
        const duration = post.post_type === 'story' ? 15 : 30;
        const size = post.post_type === 'story' ? '1080x1920' : '1080x1080';
        const videoUrl = await createVideoFromImage(mediaUrls[0], musicTrackUrl, { duration, size });
        mediaUrls[0] = videoUrl;
        // Switch post type for publishing since it's now a video
        if (post.post_type === 'story') {
          post.post_type = 'reel'; // IG stories with video use reel container
        } else {
          post.post_type = 'reel';
        }
        console.log(`[PUBLISH] Image converted to video with music: ${videoUrl}`);
      }
    }

    let instagramId = null;
    let facebookId = null;
    const errors = [];

    // Publish to Instagram
    if (instagram) {
      try {
        const igResult = await publishToInstagram({
          postType: post.post_type,
          caption: fullCaption,
          mediaUrls,
        });
        instagramId = igResult.id;
        console.log(`[PUBLISH] Instagram posted — ID: ${instagramId}`);
      } catch (igErr) {
        console.error('[PUBLISH] Instagram error:', igErr);
        errors.push(`Instagram: ${igErr.message}`);
      }
    }

    // Publish to Facebook
    if (facebook) {
      try {
        const fbResult = await publishToFacebook({
          postType: post.post_type,
          caption: fullCaption,
          mediaUrls,
        });
        facebookId = fbResult.id || fbResult.post_id;
        console.log(`[PUBLISH] Facebook posted — ID: ${facebookId}`);
      } catch (fbErr) {
        console.error('[PUBLISH] Facebook error:', fbErr);
        errors.push(`Facebook: ${fbErr.message}`);
      }
    }

    // If both failed, report failure
    if (instagram && !instagramId && facebook && !facebookId) {
      await postsPool.query("UPDATE generated_posts SET status = 'failed' WHERE id = $1", [req.params.id]);
      return res.status(500).json({ error: errors.join('; ') });
    }

    // Update DB — store whichever ID we got
    const metaPostId = instagramId || facebookId;
    await postsPool.query(`
      UPDATE generated_posts SET status = 'posted', meta_post_id = $1, fb_post_id = $2, posted_at = NOW()
      WHERE id = $3
    `, [metaPostId, facebookId, post.id]);

    res.json({
      success: true,
      instagramId,
      facebookId,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error('[PUBLISH] Error:', err);
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
