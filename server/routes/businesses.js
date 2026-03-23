const express = require('express');
const router = express.Router();
const multer = require('multer');
const { smePool } = require('../db/pool');
const { uploadBuffer } = require('../services/cloudinary');

// Use memory storage — files go straight to Cloudinary, not local disk
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

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

// POST /api/businesses — create a new business
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.name || !b.category || !b.country) {
      return res.status(400).json({ error: 'Name, category, and country are required' });
    }

    const { rows } = await smePool.query(`
      INSERT INTO businesses (
        name, category, description, website, city, country,
        contact_email, contact_phone, price_range, tags, emoji,
        featured, year_founded, owner_name, short_tagline,
        instagram, facebook, linkedin, tiktok,
        approved, website_domain, logo, product_photo, pin_order, address
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18, $19,
        true, $20, $21, $22, 0, $23
      ) RETURNING *
    `, [
      b.name, b.category, b.description || '', b.website || '', b.city || '', b.country,
      b.contact_email || '', b.contact_phone || '', b.price_range || '', b.tags || '{}', b.emoji || '',
      b.featured || false, b.year_founded || null, b.owner_name || '', b.short_tagline || '',
      b.instagram || '', b.facebook || '', b.linkedin || '', b.tiktok || '',
      b.website_domain || '', b.logo || '', b.product_photo || '', b.address || '',
    ]);

    console.log(`[NEW SME] Created business: ${rows[0].name} (ID: ${rows[0].id})`);
    res.json({ success: true, business: rows[0] });
  } catch (err) {
    console.error('[NEW SME] Error:', err);
    res.status(500).json({ error: 'Failed to create business' });
  }
});

// POST /api/businesses/:id/photos — upload a photo for a business
router.post('/:id/photos', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const bizId = req.params.id;

    // Upload to Cloudinary
    const { url: photoUrl } = await uploadBuffer(req.file.buffer, 'sme-photos');

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

    console.log(`[UPLOAD] Photo uploaded to Cloudinary for business ${bizId}: ${photoUrl}`);
    res.json({ success: true, photo: rows[0] });
  } catch (err) {
    console.error('[UPLOAD] Error:', err);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

module.exports = router;
