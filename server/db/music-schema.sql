-- Music library for background tracks
CREATE TABLE IF NOT EXISTS music_tracks (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  artist VARCHAR(200),
  duration_seconds INTEGER,
  genre VARCHAR(50),
  mood VARCHAR(50),
  url TEXT NOT NULL,                    -- Cloudinary URL
  public_id VARCHAR(200),              -- Cloudinary public_id for deletion
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
