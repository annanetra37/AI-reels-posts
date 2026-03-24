/**
 * Merges a background music track into media using ffmpeg.
 * - Video + audio → video with music
 * - Image + audio → short video with music (for stories/image posts)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { cloudinary } = require('./cloudinary');

const TMP_DIR = path.join(__dirname, '../../tmp');

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

async function downloadToFile(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
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
  const outputPath = path.join(TMP_DIR, `img2vid_output_${id}.mp4`);

  try {
    await Promise.all([
      downloadToFile(imageUrl, imgPath),
      downloadToFile(audioUrl, audioPath),
    ]);

    // Create video: static image + audio, with a slow zoom effect for visual interest
    const [w, h] = size.split('x').map(Number);
    execSync(
      `ffmpeg -y -loop 1 -i "${imgPath}" -i "${audioPath}" -filter_complex "[0:v]scale=${w * 1.1}:${h * 1.1},zoompan=z='min(zoom+0.0005,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${duration * 25}:s=${w}x${h}:fps=25[v]" -map "[v]" -map 1:a:0 -c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -t ${duration} -shortest "${outputPath}"`,
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
    cleanup(imgPath, audioPath, outputPath);
  }
}

module.exports = { mergeAudioWithVideo, createVideoFromImage };
