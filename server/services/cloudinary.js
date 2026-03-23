/**
 * Cloudinary upload service.
 * Replaces local file storage + PUBLIC_URL for photo uploads.
 */

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file buffer to Cloudinary.
 * @param {Buffer} buffer - The file buffer
 * @param {string} [folder] - Cloudinary folder (default: 'sme-photos')
 * @returns {Promise<{url: string, public_id: string}>}
 */
async function uploadBuffer(buffer, folder = 'sme-photos') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, public_id: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

/**
 * Upload a base64 data URI to Cloudinary.
 * @param {string} dataUri - e.g. "data:image/png;base64,..."
 * @param {string} [folder] - Cloudinary folder
 * @returns {Promise<{url: string, public_id: string}>}
 */
async function uploadBase64(dataUri, folder = 'sme-photos') {
  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: 'image',
  });
  return { url: result.secure_url, public_id: result.public_id };
}

module.exports = { cloudinary, uploadBuffer, uploadBase64 };
