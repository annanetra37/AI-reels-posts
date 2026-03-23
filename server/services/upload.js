/**
 * Converts base64 data URIs to publicly accessible Cloudinary URLs.
 */

const { uploadBase64 } = require('./cloudinary');

/**
 * If the input is a base64 data URI, upload it to Cloudinary and return the URL.
 * If it's already an http(s) URL, return it unchanged.
 * Returns null if the input can't be converted.
 */
async function toPublicUrl(dataOrUrl) {
  if (!dataOrUrl) return null;

  // Already a public URL — pass through
  if (/^https?:\/\//.test(dataOrUrl)) return dataOrUrl;

  // Check for base64 data URI
  const match = dataOrUrl.match(/^data:image\/([\w+]+);base64,(.+)$/);
  if (!match) return null;

  const { url } = await uploadBase64(dataOrUrl, 'sme-photos');
  return url;
}

module.exports = { toPublicUrl };
