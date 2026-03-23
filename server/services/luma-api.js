/**
 * LumaLabs Dream Machine API integration.
 * Used for generating reel videos and carousel images.
 */

const LUMA_API_KEY = process.env.LUMALABS_API_KEY;
const LUMA_BASE_URL = 'https://api.lumalabs.ai/dream-machine/v1';

async function lumaFetch(path, body) {
  const res = await fetch(`${LUMA_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LUMA_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'LumaLabs API error');
  return data;
}

async function lumaGet(path) {
  const res = await fetch(`${LUMA_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${LUMA_API_KEY}` },
  });
  return res.json();
}

/**
 * Generate a video using LumaLabs Dream Machine.
 * @param {string} prompt - The generation prompt
 * @param {string} startImageUrl - Image for frame0 (start of video)
 * @param {string} [endImageUrl] - Image for frame1 (end of video) — creates a transition
 * @param {string} [duration] - '5s' or '9s' (default '5s')
 */
async function generateVideo(prompt, startImageUrl, endImageUrl, duration = '5s') {
  const keyframes = {};
  if (startImageUrl) keyframes.frame0 = { type: 'image', url: startImageUrl };
  if (endImageUrl) keyframes.frame1 = { type: 'image', url: endImageUrl };

  const body = {
    prompt,
    model: 'ray-flash-2',
    resolution: '720p',
    duration,
    ...(Object.keys(keyframes).length > 0 ? { keyframes } : {}),
  };
  const generation = await lumaFetch('/generations', body);
  return generation;
}

/**
 * Generate an image using LumaLabs.
 */
async function generateImage(prompt) {
  const generation = await lumaFetch('/generations/image', {
    prompt,
    model: 'photon-1',
    aspect_ratio: '4:3',
  });
  return generation;
}

/**
 * Add audio to a completed video generation.
 * This is a separate API call — POST /generations/{id}/audio
 * Audio generation is free (no credits used).
 * @param {string} generationId - The completed video generation ID
 * @param {string} [prompt] - Audio prompt (e.g. "upbeat electronic music, energetic")
 */
async function addAudio(generationId, prompt) {
  const body = {
    generation_type: 'add_audio',
    ...(prompt ? { prompt } : {}),
  };
  const generation = await lumaFetch(`/generations/${generationId}/audio`, body);
  return generation;
}

/**
 * Poll for generation completion.
 * Video generation typically takes 2-5 minutes; default timeout is 5 minutes.
 */
async function pollGeneration(generationId, maxWaitMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const gen = await lumaGet(`/generations/${generationId}`);
    if (gen.state === 'completed') return gen;
    if (gen.state === 'failed') {
      throw new Error(`LumaLabs generation failed: ${gen.failure_reason || 'unknown reason'}`);
    }
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[INFO] Polling generation ${generationId} — state: ${gen.state}, elapsed: ${elapsed}s`);
    await new Promise(r => setTimeout(r, 5000));
  }
  const elapsedSec = Math.round((Date.now() - start) / 1000);
  throw new Error(`LumaLabs generation timeout after ${elapsedSec}s`);
}

module.exports = { generateVideo, generateImage, addAudio, pollGeneration };
