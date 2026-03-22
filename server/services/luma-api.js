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
 */
async function generateVideo(prompt, imageUrl) {
  const body = {
    prompt,
    model: 'ray-flash-2',
    resolution: '720p',
    duration: '5s',
    ...(imageUrl ? { keyframes: { frame0: { type: 'image', url: imageUrl } } } : {}),
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
 * Poll for generation completion.
 */
async function pollGeneration(generationId, maxWaitMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const gen = await lumaGet(`/generations/${generationId}`);
    if (gen.state === 'completed') return gen;
    if (gen.state === 'failed') throw new Error('LumaLabs generation failed');
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('LumaLabs generation timeout');
}

module.exports = { generateVideo, generateImage, pollGeneration };
