/**
 * Pika 2.2 API integration via fal.ai.
 * Used as an alternative video generation provider to LumaLabs.
 *
 * Endpoints:
 *   - Text-to-video:  fal-ai/pika/v2.2/text-to-video
 *   - Image-to-video: fal-ai/pika/v2.2/image-to-video
 *
 * Auth: FAL_KEY environment variable (sent as "Key <key>" in Authorization header).
 * Workflow: Submit to queue → poll status → fetch result.
 */

const FAL_KEY = process.env.FAL_KEY;
const FAL_QUEUE_BASE = 'https://queue.fal.run';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function falSubmit(modelId, input) {
  const res = await fetch(`${FAL_QUEUE_BASE}/${modelId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${FAL_KEY}`,
    },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.message || 'fal.ai submit error');
  return data; // { request_id, status_url, response_url, cancel_url }
}

async function falStatus(statusUrl) {
  const res = await fetch(statusUrl, {
    headers: { Authorization: `Key ${FAL_KEY}` },
  });
  return res.json();
}

async function falResult(responseUrl) {
  const res = await fetch(responseUrl, {
    headers: { Authorization: `Key ${FAL_KEY}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.message || 'fal.ai result error');
  return data;
}

// ── Poll until complete ─────────────────────────────────────────────────────

async function pollFal(submission) {
  const MAX_WAIT_MS = 15 * 60 * 1000; // 15 minutes
  const start = Date.now();
  const statusUrl = submission.status_url;
  const responseUrl = submission.response_url;

  while (true) {
    const status = await falStatus(statusUrl);
    const elapsed = Math.round((Date.now() - start) / 1000);

    if (status.status === 'COMPLETED') {
      return await falResult(responseUrl);
    }
    if (status.status === 'FAILED') {
      throw new Error(`Pika generation failed: ${status.error || 'unknown reason'}`);
    }
    if (Date.now() - start > MAX_WAIT_MS) {
      throw new Error(`Pika generation stuck in "${status.status}" for ${elapsed}s — timeout.`);
    }
    console.log(`[INFO] Polling Pika ${submission.request_id} — status: ${status.status}, elapsed: ${elapsed}s`);
    await new Promise(r => setTimeout(r, 5000));
  }
}

// ── Public API (mirrors luma-api.js interface) ──────────────────────────────

/**
 * Generate a video using Pika 2.2 via fal.ai.
 * @param {string} prompt - The generation prompt
 * @param {string} [startImageUrl] - Source image URL (triggers image-to-video)
 * @param {string} [endImageUrl] - Ignored for Pika (no keyframe transitions)
 * @param {string} [duration] - '5s' or '9s' — mapped to 5 or 10 seconds
 * @returns {{ id: string, _submission: object }} Submission info for polling
 */
async function generateVideo(prompt, startImageUrl, endImageUrl, duration = '5s') {
  const durationSec = parseInt(duration) >= 9 ? 10 : 5;

  if (startImageUrl) {
    // Image-to-video
    const submission = await falSubmit('fal-ai/pika/v2.2/image-to-video', {
      image_url: startImageUrl,
      prompt,
      resolution: '720p',
      duration: durationSec,
    });
    return { id: submission.request_id, _submission: submission };
  }

  // Text-to-video
  const submission = await falSubmit('fal-ai/pika/v2.2/text-to-video', {
    prompt,
    aspect_ratio: '9:16',  // vertical for reels
    resolution: '720p',
    duration: durationSec,
  });
  return { id: submission.request_id, _submission: submission };
}

/**
 * Generate an image using Pika.
 * Pika on fal.ai doesn't have a standalone image generation endpoint,
 * so we fall back to a very short text-to-video and extract a frame,
 * or simply return null to let the caller handle it.
 * For now: not supported — carousel image gen should use Luma's photon-1.
 */
async function generateImage(prompt) {
  throw new Error('Pika does not support standalone image generation. Use Luma for carousel images.');
}

/**
 * Add audio to a video. Not supported by Pika via fal.ai.
 * Music should be handled externally or skipped.
 */
async function addAudio(generationId, prompt) {
  throw new Error('Pika via fal.ai does not support adding audio. Music generation not available.');
}

/**
 * Poll for generation completion.
 * @param {string} generationId - The request_id from fal.ai
 * @param {object} [_submission] - The full submission object (has status_url etc.)
 */
async function pollGeneration(generationId, _submission) {
  if (!_submission) {
    throw new Error('Pika pollGeneration requires the _submission object. Pass it via the generation result.');
  }

  const result = await pollFal(_submission);

  // Normalize to match Luma's response shape: { assets: { video: url } }
  const videoUrl = result.video?.url || null;
  return {
    state: 'completed',
    assets: { video: videoUrl },
    video: { url: videoUrl },
  };
}

module.exports = { generateVideo, generateImage, addAudio, pollGeneration };
