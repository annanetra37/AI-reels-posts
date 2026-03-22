# Instagram Marketing Studio

AI-powered Instagram content creation system for SME businesses. Generate captions, hashtags, reels, and carousels using Anthropic Claude and LumaLabs, then publish directly to Instagram via Meta Graph API.

## Prerequisites

- **Node.js** v18+ ([download](https://nodejs.org/))
- **PostgreSQL** running locally (for storing generated posts)
- Access to your **Railway PostgreSQL** (where SME business data lives)
- API keys for: **Anthropic**, **LumaLabs**, **Meta Graph API**

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/annanetra37/AI-reels-posts.git
cd AI-reels-posts
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Your Railway PostgreSQL (existing SME data - businesses & product_photos)
SME_DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@YOUR_RAILWAY_HOST:PORT/railway

# Local PostgreSQL (stores generated posts)
POSTS_DATABASE_URL=postgresql://postgres:password@localhost:5432/instagram_posts

# Anthropic API key (https://console.anthropic.com/)
ANTHROPIC_API_KEY=sk-ant-xxxxx

# LumaLabs API key (https://lumalabs.ai/dream-machine/api)
LUMALABS_API_KEY=your-lumalabs-key

# Meta Graph API (https://developers.facebook.com/)
META_ACCESS_TOKEN=your-meta-access-token
INSTAGRAM_BUSINESS_ACCOUNT_ID=your-ig-account-id

PORT=3000

# Public URL (required for LumaLabs when product photos are base64 in the DB)
# See "LumaLabs with base64 photos" section below
PUBLIC_URL=
```

### 3. Create the posts database

Create a local PostgreSQL database for storing generated posts:

```bash
# Create the database
createdb instagram_posts

# Run the schema migration
psql instagram_posts < server/db/posts-schema.sql
```

Or if you prefer using `psql` directly:

```sql
CREATE DATABASE instagram_posts;
\c instagram_posts
-- Then paste the contents of server/db/posts-schema.sql
```

### 4. Run the app

```bash
# Production
npm start

# Development (auto-restart on file changes)
npm run dev
```

Open **http://localhost:3000** in your browser.

## How It Works

The app is a 4-step wizard:

| Step | What you do |
|------|------------|
| **1. Select SMEs** | Search and multi-select businesses from your Railway database |
| **2. Choose Photos** | Pick logos and product photos to feature in the post |
| **3. Configure Post** | Choose post type, style, and caption languages |
| **4. Preview & Post** | Review the AI-generated content, edit if needed, publish to Instagram |

### Post Types
- **Image** — Single image post
- **Reel** — Short video (LumaLabs generates the video prompt)
- **Carousel** — Multi-slide post (LumaLabs generates harmonious slides with a title cover)
- **Story** — Instagram story

### Post Styles (20 options)
Did You Know, Brand of the Day, Top X Brands, Before & After, Behind the Scenes, Hot Take, This or That, Myth vs. Reality, Unpopular Opinion, Day in the Life, Trend Alert, Customer Spotlight, Throwback/Origin, Hidden Local Gem, Seasonal Pick, Meet the Founder, Product Hack, Caption This, Aesthetic Mood Board, Weekly Roundup

## Architecture

```
├── server/
│   ├── index.js                  # Express server entry point
│   ├── db/
│   │   ├── pool.js               # Two PostgreSQL connections (SME + Posts)
│   │   └── posts-schema.sql      # Schema for generated_posts table
│   ├── routes/
│   │   ├── businesses.js         # GET /api/businesses, GET /api/businesses/:id/photos
│   │   └── posts.js              # POST /api/posts/generate, PUT, POST publish, GET history
│   └── services/
│       ├── caption-agent.js      # Anthropic Agent 1: caption & hashtag generation
│       ├── luma-agent.js         # Anthropic Agent 2: LumaLabs prompt generation
│       ├── luma-api.js           # LumaLabs Dream Machine API client
│       ├── meta-api.js           # Meta Graph API client (Instagram publishing)
│       └── upload.js             # Base64 → public URL converter (saves to public/uploads/)
├── public/
│   ├── index.html                # Single-page app
│   ├── css/styles.css            # Dark-themed UI styles
│   └── js/app.js                 # Frontend logic
├── .env.example                  # Environment variable template
└── package.json
```

### Two Databases

| Database | Connection | Purpose |
|----------|-----------|---------|
| **SME (Railway)** | `SME_DATABASE_URL` | Read-only. Existing `businesses` and `product_photos` tables |
| **Posts (Local)** | `POSTS_DATABASE_URL` | Read/write. Stores `generated_posts` created by this system |

### AI Pipeline

1. **Anthropic Agent 1** — Takes selected businesses + post config, generates multi-language captions and hashtags
2. **Anthropic Agent 2** — For reels/carousels only: generates a detailed LumaLabs prompt with visual direction, mood, color palette, and per-slide descriptions
3. **LumaLabs API** — Generates video (reels) or images (carousel slides) from the prompt
4. **Meta Graph API** — Publishes the final post to Instagram

Real-time progress is streamed to the frontend via Server-Sent Events (SSE).

## API Keys Setup

### Anthropic
1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Create an API key
3. Set `ANTHROPIC_API_KEY` in `.env`

### LumaLabs
1. Go to [lumalabs.ai/dream-machine/api](https://lumalabs.ai/dream-machine/api)
2. Get your API key
3. Set `LUMALABS_API_KEY` in `.env`

### Meta Graph API (Instagram)
1. Create a Meta app at [developers.facebook.com](https://developers.facebook.com/)
2. Add the Instagram Graph API product
3. Connect your Instagram Business Account
4. Generate a long-lived access token
5. Set `META_ACCESS_TOKEN` and `INSTAGRAM_BUSINESS_ACCOUNT_ID` in `.env`

## LumaLabs with base64 photos

If your product photos are stored as base64 data URIs in the SME database (rather than public URLs), LumaLabs cannot access them directly. The app will automatically save the base64 images to `public/uploads/` and serve them via Express — but it needs a publicly accessible URL to give to LumaLabs.

**For local development**, use [ngrok](https://ngrok.com/) to expose your local server:

```bash
# Install ngrok (https://ngrok.com/download)
npm install -g ngrok

# Start your app
npm run dev

# In another terminal, expose port 3000
ngrok http 3000
```

ngrok will give you a public URL like `https://abc123.ngrok-free.app`. Add it to your `.env`:

```env
PUBLIC_URL=https://abc123.ngrok-free.app
```

**For production**, set `PUBLIC_URL` to your deployed domain (e.g. `https://your-app.railway.app`).

If the photos in the DB are already public `https://` URLs, they are passed directly to LumaLabs and `PUBLIC_URL` is not needed.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Failed to load businesses` | Check `SME_DATABASE_URL` and ensure Railway allows external connections |
| `ECONNREFUSED` on posts DB | Make sure local PostgreSQL is running and `instagram_posts` database exists |
| Anthropic errors | Verify `ANTHROPIC_API_KEY` is valid and has credits |
| Instagram publish fails | Check Meta access token hasn't expired and account permissions are correct |
| LumaLabs skips video generation | Product photos are base64 and `PUBLIC_URL` is not set. See "LumaLabs with base64 photos" section |
