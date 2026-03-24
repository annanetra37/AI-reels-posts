/**
 * Merges a background music track into media using ffmpeg.
 * - Video + audio → video with music
 * - Image + audio → short video with music (for stories/image posts)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { cloudinary } = require('./cloudinary');

const { generateTrackBuffer, getTrackMeta } = require('./sample-tracks');

const TMP_DIR = path.join(__dirname, '../../tmp');
const SERVER_PORT = process.env.PORT || 3000;

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

async function downloadToFile(url, filePath) {
  // Handle built-in sample tracks (relative URLs like /api/music/sample/xyz.wav)
  const sampleMatch = url.match(/\/api\/music\/sample\/([^.]+)\.wav/);
  if (sampleMatch) {
    const trackId = sampleMatch[1];
    if (getTrackMeta(trackId)) {
      const buf = generateTrackBuffer(trackId);
      fs.writeFileSync(filePath, buf);
      return filePath;
    }
  }

  // Handle relative URLs by making them absolute against localhost
  let fullUrl = url;
  if (url.startsWith('/')) {
    fullUrl = `http://127.0.0.1:${SERVER_PORT}${url}`;
  }

  const res = await fetch(fullUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${fullUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filePath, buf);
  return filePath;
}

function cleanup(...files) {
  for (const f of files) {
    try { fs.unlinkSync(f); } catch {}
  }
}

/**
 * Merge audio track into a video file.
 * Replaces or mixes the original audio with the music track.
 * @param {string} videoUrl - URL of the video
 * @param {string} audioUrl - URL of the music track
 * @param {object} [opts]
 * @param {number} [opts.musicVolume=0.3] - Music volume (0-1), original audio kept at 1.0
 * @param {boolean} [opts.replaceAudio=false] - If true, replace original audio entirely
 * @returns {Promise<string>} - Cloudinary URL of the merged video
 */
async function mergeAudioWithVideo(videoUrl, audioUrl, opts = {}) {
  const { musicVolume = 0.3, replaceAudio = false } = opts;
  ensureTmpDir();

  const id = Date.now();
  const videoPath = path.join(TMP_DIR, `merge_video_${id}.mp4`);
  const audioPath = path.join(TMP_DIR, `merge_audio_${id}.mp3`);
  const outputPath = path.join(TMP_DIR, `merge_output_${id}.mp4`);

  try {
    await Promise.all([
      downloadToFile(videoUrl, videoPath),
      downloadToFile(audioUrl, audioPath),
    ]);

    if (replaceAudio) {
      // Replace: use only the music track
      execSync(
        `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v copy -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`,
        { timeout: 60000 }
      );
    } else {
      // Mix: keep original audio + add music underneath
      execSync(
        `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -filter_complex "[0:a]volume=1.0[a0];[1:a]volume=${musicVolume}[a1];[a0][a1]amix=inputs=2:duration=shortest[aout]" -map 0:v:0 -map "[aout]" -c:v copy -shortest "${outputPath}"`,
        { timeout: 60000 }
      );
    }

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(outputPath, {
        resource_type: 'video',
        folder: 'merged-media',
      }, (err, r) => err ? reject(err) : resolve(r));
    });

    return result.secure_url;
  } finally {
    cleanup(videoPath, audioPath, outputPath);
  }
}

/**
 * Create a video from a static image + music track.
 * Useful for image posts and stories that need music.
 * @param {string} imageUrl - URL of the image
 * @param {string} audioUrl - URL of the music track
 * @param {object} [opts]
 * @param {number} [opts.duration=15] - Video duration in seconds
 * @param {string} [opts.size='1080x1080'] - Output size (WxH)
 * @returns {Promise<string>} - Cloudinary URL of the video
 */
async function createVideoFromImage(imageUrl, audioUrl, opts = {}) {
  const { duration = 15, size = '1080x1080' } = opts;
  ensureTmpDir();

  const id = Date.now();
  const imgPath = path.join(TMP_DIR, `img2vid_img_${id}.jpg`);
  const audioPath = path.join(TMP_DIR, `img2vid_audio_${id}.mp3`);
  const scaledPath = path.join(TMP_DIR, `img2vid_scaled_${id}.jpg`);
  const outputPath = path.join(TMP_DIR, `img2vid_output_${id}.mp4`);

  try {
    await Promise.all([
      downloadToFile(imageUrl, imgPath),
      downloadToFile(audioUrl, audioPath),
    ]);

    const [w, h] = size.split('x').map(Number);
    const fps = 30;
    const totalFrames = duration * fps;

    // Step 1: Scale the source image to fill the target size (cover), center-crop to exact dimensions
    // This ensures the image fills the entire frame regardless of its original aspect ratio
    execSync(
      `ffmpeg -y -i "${imgPath}" -vf "scale=${Math.round(w * 1.15)}:${Math.round(h * 1.15)}:force_original_aspect_ratio=increase,crop=${Math.round(w * 1.15)}:${Math.round(h * 1.15)}" "${scaledPath}"`,
      { timeout: 30000 }
    );

    // Step 2: Create video with smooth Ken Burns zoom effect
    // Zoom from 1.0 to 1.12 over the full duration for a gentle, cinematic effect
    // Use higher fps (30) for smoothness, and linear zoom interpolation
    const zoomStart = 1.0;
    const zoomEnd = 1.12;
    const zoomIncrement = ((zoomEnd - zoomStart) / totalFrames).toFixed(8);
    execSync(
      `ffmpeg -y -loop 1 -i "${scaledPath}" -i "${audioPath}" ` +
      `-filter_complex "[0:v]zoompan=z='${zoomStart}+on*${zoomIncrement}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${w}x${h}:fps=${fps}[v]" ` +
      `-map "[v]" -map 1:a:0 -c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -b:a 192k -t ${duration} -shortest "${outputPath}"`,
      { timeout: 120000 }
    );

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(outputPath, {
        resource_type: 'video',
        folder: 'merged-media',
      }, (err, r) => err ? reject(err) : resolve(r));
    });

    return result.secure_url;
  } finally {
    cleanup(imgPath, audioPath, scaledPath, outputPath);
  }
}

module.exports = { mergeAudioWithVideo, createVideoFromImage };
