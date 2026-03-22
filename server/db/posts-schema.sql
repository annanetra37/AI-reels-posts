-- Store every generated post
CREATE TABLE IF NOT EXISTS generated_posts (
  id SERIAL PRIMARY KEY,
  business_ids INTEGER[] NOT NULL,
  post_type VARCHAR(20) NOT NULL,       -- reel, image, carousel, story
  post_style VARCHAR(100) NOT NULL,
  languages TEXT[] NOT NULL,
  caption TEXT,
  hashtags TEXT,
  selected_photos TEXT[],               -- URLs of selected photos
  luma_prompt TEXT,                      -- prompt sent to LumaLabs (if reel/carousel)
  luma_result_url TEXT,                  -- result from LumaLabs
  media_urls TEXT[],                     -- final media URLs used in post
  status VARCHAR(30) DEFAULT 'draft',   -- draft, generated, posted, failed
  meta_post_id VARCHAR(100),            -- ID returned by Meta Graph API
  posted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
