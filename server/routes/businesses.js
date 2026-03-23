const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { smePool } = require('../db/pool');

// Configure multer to save to public/uploads/
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
const fs = require('fs');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const hash = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${hash}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// GET /api/businesses — list all approved businesses
router.get('/', async (req, res) => {
  try {
    const { rows } = await smePool.query(`
      SELECT id, name, category, description, website, city, country,
             price_range, tags, emoji, logo, product_photo, short_tagline,
             instagram, year_founded, owner_name
      FROM businesses
      WHERE approved = true
      ORDER BY pin_order DESC, name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching businesses:', err);
    res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// GET /api/businesses/:id/photos — get product photos for a business
router.get('/:id/photos', async (req, res) => {
  try {
    const { rows } = await smePool.query(`
      SELECT pp.id, pp.photo, pp.sort_order
      FROM product_photos pp
      WHERE pp.business_id = $1
      ORDER BY pp.sort_order ASC
    `, [req.params.id]);

    // Also include the main logo and product_photo from businesses table
    const { rows: biz } = await smePool.query(`
      SELECT logo, product_photo FROM businesses WHERE id = $1
    `, [req.params.id]);

    res.json({
      logo: biz[0]?.logo || null,
      mainProductPhoto: biz[0]?.product_photo || null,
      productPhotos: rows,
    });
  } catch (err) {
    console.error('Error fetching photos:', err);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// POST /api/businesses/:id/photos — upload a photo for a business
router.post('/:id/photos', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const bizId = req.params.id;
    const filename = req.file.filename;

    // Build public URL
    const publicUrl = process.env.PUBLIC_URL;
    if (!publicUrl) {
      return res.status(400).json({ error: 'PUBLIC_URL not set in .env — needed to create a public URL for the uploaded photo' });
    }
    const photoUrl = `${publicUrl.replace(/\/$/, '')}/uploads/${filename}`;

    // Get next sort_order
    const { rows: maxRow } = await smePool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM product_photos WHERE business_id = $1',
      [bizId]
    );
    const sortOrder = maxRow[0].next_order;

    // Insert into SME database
    const { rows } = await smePool.query(
      'INSERT INTO product_photos (business_id, photo, sort_order) VALUES ($1, $2, $3) RETURNING *',
      [bizId, photoUrl, sortOrder]
    );

    console.log(`[UPLOAD] Photo uploaded for business ${bizId}: ${photoUrl}`);
    res.json({ success: true, photo: rows[0] });
  } catch (err) {
    console.error('[UPLOAD] Error:', err);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

module.exports = router;
