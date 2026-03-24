/**
 * Video provider abstraction.
 * Routes video generation calls to the selected provider (Luma or Pika).
 *
 * Both providers expose the same interface:
 *   - generateVideo(prompt, startImageUrl, endImageUrl, duration)
 *   - generateImage(prompt)
 *   - addAudio(generationId, prompt)
 *   - pollGeneration(generationId, _extra)
 *
 * The route layer passes `videoModel` from the frontend and this module
 * returns the right provider + metadata.
 */

const luma = require('./luma-api');
const pika = require('./pika-api');

const PROVIDERS = {
  luma: {
    name: 'LumaLabs',
    api: luma,
    envKey: 'LUMALABS_API_KEY',
    supportsImage: true,
    supportsAudio: true,
    // Pika's pollGeneration needs _submission; Luma's doesn't
    needsSubmission: false,
  },
  pika: {
    name: 'Pika 2.2',
    api: pika,
    envKey: 'FAL_KEY',
    supportsImage: false,   // carousel images not supported
    supportsAudio: false,   // no audio endpoint
    needsSubmission: true,
  },
};

/**
 * Get the video provider for a given model selection.
 * @param {string} videoModel - 'luma' or 'pika'
 * @returns {object} Provider config with .api, .name, etc.
 */
function getProvider(videoModel) {
  const provider = PROVIDERS[videoModel];
  if (!provider) {
    throw new Error(`Unknown video model "${videoModel}". Supported: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider;
}

/**
 * Check if a provider is configured (API key is set).
 */
function isConfigured(videoModel) {
  const provider = PROVIDERS[videoModel];
  if (!provider) return false;
  const key = process.env[provider.envKey];
  return !!(key && key !== `your-${provider.envKey.toLowerCase()}`);
}

/**
 * List available (configured) providers for the frontend.
 */
function listProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    name: p.name,
    configured: isConfigured(id),
    supportsImage: p.supportsImage,
    supportsAudio: p.supportsAudio,
  }));
}

module.exports = { getProvider, isConfigured, listProviders, PROVIDERS };
