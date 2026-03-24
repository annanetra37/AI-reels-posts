/**
 * Composites multiple photos into a single 1080×1920 story image.
 * Uses sharp for image processing — no AI APIs needed.
 */

const sharp = require('sharp');

const STORY_W = 1080;
const STORY_H = 1920;
const GAP = 12;
const PADDING = 16;
const BORDER_RADIUS = 20;
const BG_COLOR = { r: 18, g: 18, b: 18, alpha: 1 }; // near-black

/**
 * Fetch an image from URL or decode base64 data URI, return as Buffer.
 */
async function fetchImageBuffer(urlOrDataUri) {
  if (urlOrDataUri.startsWith('data:')) {
    const base64 = urlOrDataUri.replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(base64, 'base64');
  }
  const res = await fetch(urlOrDataUri);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Compute grid layout for N items inside the story canvas.
 * Returns { cols, rows, cellW, cellH } for the optimal arrangement.
 */
function computeGrid(count) {
  if (count === 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 1, rows: 2 };
  if (count === 3) return { cols: 1, rows: 3 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 2, rows: Math.ceil(count / 2) };
  return { cols: 3, rows: Math.ceil(count / 3) };
}

/**
 * Create a rounded-corner version of an image buffer.
 */
async function roundCorners(imgBuffer, w, h, radius) {
  const roundedMask = Buffer.from(
    `<svg width="${w}" height="${h}">
      <rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>`
  );
  return sharp(imgBuffer)
    .resize(w, h, { fit: 'cover', position: 'centre' })
    .composite([{ input: roundedMask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/**
 * Build a single 1080×1920 collage image from multiple photo URLs.
 * @param {string[]} photoUrls - Array of image URLs or base64 data URIs
 * @returns {Promise<Buffer>} - PNG buffer of the composited story image
 */
async function createStoryCollage(photoUrls) {
  if (!photoUrls?.length) throw new Error('No photos provided for collage');
  if (photoUrls.length === 1) {
    // Single photo — just resize to story dimensions
    const buf = await fetchImageBuffer(photoUrls[0]);
    return sharp(buf)
      .resize(STORY_W, STORY_H, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();
  }

  const { cols, rows } = computeGrid(photoUrls.length);

  const availW = STORY_W - PADDING * 2 - GAP * (cols - 1);
  const availH = STORY_H - PADDING * 2 - GAP * (rows - 1);
  const cellW = Math.floor(availW / cols);
  const cellH = Math.floor(availH / rows);

  // Fetch all images in parallel
  const buffers = await Promise.all(photoUrls.map(fetchImageBuffer));

  // Resize each photo with rounded corners
  const composites = [];
  for (let i = 0; i < buffers.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PADDING + col * (cellW + GAP);
    const y = PADDING + row * (cellH + GAP);

    const rounded = await roundCorners(buffers[i], cellW, cellH, BORDER_RADIUS);
    composites.push({ input: rounded, left: x, top: y });
  }

  // Create background canvas and composite all cells
  return sharp({
    create: {
      width: STORY_W,
      height: STORY_H,
      channels: 4,
      background: BG_COLOR,
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

module.exports = { createStoryCollage };
