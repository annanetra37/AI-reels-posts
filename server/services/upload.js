/**
 * Converts base64 data URIs to publicly accessible URLs by saving them
 * as files in public/uploads/ and returning the full URL.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * If the input is a base64 data URI, save it to disk and return a public URL.
 * If it's already an http(s) URL, return it unchanged.
 * Returns null if the input can't be converted.
 */
function toPublicUrl(dataOrUrl) {
  if (!dataOrUrl) return null;

  // Already a public URL — pass through
  if (/^https?:\/\//.test(dataOrUrl)) return dataOrUrl;

  // Check for base64 data URI
  const match = dataOrUrl.match(/^data:image\/([\w+]+);base64,(.+)$/);
  if (!match) return null;

  const ext = match[1].replace('+', '.');  // e.g. "jpeg", "png", "svg+xml" → "svg.xml"
  const base64Data = match[2];
  const hash = crypto.createHash('md5').update(base64Data.slice(0, 1024)).digest('hex').slice(0, 12);
  const filename = `${hash}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);

  // Only write if not already cached
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
  }

  const publicUrl = process.env.PUBLIC_URL;
  if (!publicUrl) return null;

  return `${publicUrl.replace(/\/$/, '')}/uploads/${filename}`;
}

module.exports = { toPublicUrl };
