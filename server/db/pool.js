const { Pool } = require('pg');
require('dotenv').config();

// SME database (Railway) — read-only access to businesses & product_photos
const smePool = new Pool({
  connectionString: process.env.SME_DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Railway requires SSL
});

// Posts database — stores generated_posts created by this system
const postsPool = new Pool({
  connectionString: process.env.POSTS_DATABASE_URL,
  ssl: process.env.POSTS_DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

module.exports = { smePool, postsPool };
