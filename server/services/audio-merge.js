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

    // Probe whether the video has an audio stream
    let hasAudio = false;
    try {
      const probe = execSync(
        `ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "${videoPath}"`,
        { timeout: 10000 }
      ).toString().trim();
      hasAudio = probe.length > 0;
    } catch {
      hasAudio = false;
    }

    if (replaceAudio || !hasAudio) {
      // Replace audio entirely, or video has no audio — just add the music track
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
/**
 * Create a video from a static image with Ken Burns animation.
 * Optionally adds a music track. If audioUrl is null, creates a silent video.
 * @param {string} imageUrl - URL of the image
 * @param {string|null} audioUrl - URL of the music track (null for silent)
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
  const audioPath = audioUrl ? path.join(TMP_DIR, `img2vid_audio_${id}.mp3`) : null;
  const outputPath = path.join(TMP_DIR, `img2vid_output_${id}.mp4`);

  try {
    const downloads = [downloadToFile(imageUrl, imgPath)];
    if (audioUrl) downloads.push(downloadToFile(audioUrl, audioPath));
    await Promise.all(downloads);

    const [w, h] = size.split('x').map(Number);
    const fps = 30;
    const totalFrames = duration * fps;

    // Butter-smooth Ken Burns using high-resolution crop+scale pipeline.
    // Why NOT zoompan: it operates on integer pixels → visible stutter.
    //
    // Our approach:
    //   1. Scale source image to 3x target size (e.g. 3240x3240 for 1080x1080)
    //   2. Use crop filter with floating-point expressions for position + size
    //   3. Scale crop result down to target — this gives sub-pixel interpolation
    //   4. Use -sws_flags lanczos for high-quality downscale
    //
    // The crop window starts large (covering ~93% of the 3x image) and slowly
    // shrinks to ~82%, creating a gentle 12% zoom-in over the full duration.
    // The crop center drifts slightly for natural parallax motion.

    const scale = 3; // supersampling factor
    const sw = w * scale;
    const sh = h * scale;

    // Crop window dimensions (in 3x space) — start big, end smaller
    const cropStartW = Math.round(sw * 0.93);
    const cropEndW = Math.round(sw * 0.82);
    const cropStartH = Math.round(sh * 0.93);
    const cropEndH = Math.round(sh * 0.82);

    const cwExpr = `${cropStartW}+(${cropEndW - cropStartW})*n/${totalFrames}`;
    const chExpr = `${cropStartH}+(${cropEndH - cropStartH})*n/${totalFrames}`;

    const driftPixels = Math.round(sw * 0.02);
    const cxExpr = `(iw-${cropStartW}+(${cropStartW - cropEndW})*n/${totalFrames})/2+${driftPixels}*(n/${totalFrames}-0.5)`;
    const cyExpr = `(ih-${cropStartH}+(${cropStartH - cropEndH})*n/${totalFrames})/2`;

    const filterComplex =
      `[0:v]scale=${sw}:${sh}:force_original_aspect_ratio=increase,` +
      `crop=${sw}:${sh},` +
      `crop='${cwExpr}':'${chExpr}':'${cxExpr}':'${cyExpr}',` +
      `scale=${w}:${h}:flags=lanczos[v]`;

    let ffmpegCmd;
    if (audioPath) {
      // With audio
      ffmpegCmd =
        `ffmpeg -y -loop 1 -i "${imgPath}" -i "${audioPath}" ` +
        `-filter_complex "${filterComplex}" ` +
        `-map "[v]" -map 1:a:0 ` +
        `-c:v libx264 -preset medium -crf 18 -r ${fps} -pix_fmt yuv420p ` +
        `-c:a aac -b:a 192k ` +
        `-t ${duration} -shortest "${outputPath}"`;
    } else {
      // Silent video (no audio input)
      ffmpegCmd =
        `ffmpeg -y -loop 1 -i "${imgPath}" ` +
        `-filter_complex "${filterComplex}" ` +
        `-map "[v]" ` +
        `-c:v libx264 -preset medium -crf 18 -r ${fps} -pix_fmt yuv420p ` +
        `-t ${duration} "${outputPath}"`;
    }

    execSync(ffmpegCmd, { timeout: 180000 });

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(outputPath, {
        resource_type: 'video',
        folder: 'merged-media',
      }, (err, r) => err ? reject(err) : resolve(r));
    });

    return result.secure_url;
  } finally {
    cleanup(imgPath, ...(audioPath ? [audioPath] : []), outputPath);
  }
}

module.exports = { mergeAudioWithVideo, createVideoFromImage };
