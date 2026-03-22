const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/businesses — list all approved businesses
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
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
    const { rows } = await pool.query(`
      SELECT pp.id, pp.photo, pp.sort_order
      FROM product_photos pp
      WHERE pp.business_id = $1
      ORDER BY pp.sort_order ASC
    `, [req.params.id]);

    // Also include the main logo and product_photo from businesses table
    const { rows: biz } = await pool.query(`
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

module.exports = router;
