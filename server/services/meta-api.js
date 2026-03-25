/**
 * Meta Graph API integration for Instagram & Facebook publishing.
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing
 * Facebook: https://developers.facebook.com/docs/pages-api/posts
 */

const IG_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
const FB_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const GRAPH_URL = 'https://graph.facebook.com/v19.0';

// Cache the Page Access Token (derived from user token)
let cachedPageToken = null;

/**
 * Get a Page Access Token from the User Access Token.
 * The /{page-id}/videos endpoint requires a Page token, not a User token.
 * If the token is already a page token, this still works fine.
 */
async function getPageAccessToken() {
  if (cachedPageToken) return cachedPageToken;
  try {
    const res = await fetch(
      `${GRAPH_URL}/${FB_PAGE_ID}?fields=access_token&access_token=${ACCESS_TOKEN}`
    );
    const data = await res.json();
    if (data.access_token) {
      cachedPageToken = data.access_token;
      console.log('[META] Obtained Page Access Token successfully');
      return cachedPageToken;
    }
    // If we can't get a page token, fall back to the user token
    console.warn('[META] Could not obtain Page Access Token, using user token');
    return ACCESS_TOKEN;
  } catch (err) {
    console.warn('[META] Page token exchange failed:', err.message);
    return ACCESS_TOKEN;
  }
}

async function publishToInstagram({ postType, caption, mediaUrls }) {
  if (!IG_ACCOUNT_ID || !ACCESS_TOKEN) {
    throw new Error('Meta API credentials not configured. Set INSTAGRAM_BUSINESS_ACCOUNT_ID and META_ACCESS_TOKEN.');
  }

  if (!mediaUrls?.length) {
    throw new Error('No media URLs provided for publishing.');
  }

  // Detect if media is actually a video (e.g. image+music → video)
  const isVideo = mediaUrls[0].match(/\.(mp4|mov|avi|webm)/i);

  if (postType === 'story') {
    if (isVideo) {
      // Video story: use STORIES media_type with video_url
      return publishVideoStory({ caption, videoUrl: mediaUrls[0] });
    }
    return publishSingleImage({ caption, imageUrl: mediaUrls[0], isStory: true });
  } else if (postType === 'image') {
    if (isVideo) {
      // Image was converted to video (music added) — publish as reel
      return publishReel({ caption, videoUrl: mediaUrls[0] });
    }
    return publishSingleImage({ caption, imageUrl: mediaUrls[0], isStory: false });
  } else if (postType === 'reel') {
    return publishReel({ caption, videoUrl: mediaUrls[0] });
  } else if (postType === 'carousel') {
    return publishCarousel({ caption, mediaUrls });
  }

  throw new Error(`Unknown post type: ${postType}`);
}

async function graphFetch(path, body) {
  const res = await fetch(`${GRAPH_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: ACCESS_TOKEN, ...body }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

async function waitForContainer(containerId) {
  // Poll until the container is ready (max 60s)
  for (let i = 0; i < 30; i++) {
    const res = await fetch(
      `${GRAPH_URL}/${containerId}?fields=status_code&access_token=${ACCESS_TOKEN}`
    );
    const data = await res.json();
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') throw new Error('Media container processing failed');
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Media container processing timeout');
}

async function publishSingleImage({ caption, imageUrl, isStory }) {
  // Step 1: Create container
  const container = await graphFetch(`/${IG_ACCOUNT_ID}/media`, {
    image_url: imageUrl,
    caption,
    ...(isStory ? { media_type: 'STORIES' } : {}),
  });

  // Step 2: Publish
  const result = await graphFetch(`/${IG_ACCOUNT_ID}/media_publish`, {
    creation_id: container.id,
  });
  return result;
}

async function publishVideoStory({ caption, videoUrl }) {
  // Step 1: Create video story container
  const container = await graphFetch(`/${IG_ACCOUNT_ID}/media`, {
    video_url: videoUrl,
    caption,
    media_type: 'STORIES',
  });

  // Step 2: Wait for processing
  await waitForContainer(container.id);

  // Step 3: Publish
  const result = await graphFetch(`/${IG_ACCOUNT_ID}/media_publish`, {
    creation_id: container.id,
  });
  return result;
}

async function publishReel({ caption, videoUrl }) {
  // Step 1: Create video container
  const container = await graphFetch(`/${IG_ACCOUNT_ID}/media`, {
    video_url: videoUrl,
    caption,
    media_type: 'REELS',
  });

  // Step 2: Wait for processing
  await waitForContainer(container.id);

  // Step 3: Publish
  const result = await graphFetch(`/${IG_ACCOUNT_ID}/media_publish`, {
    creation_id: container.id,
  });
  return result;
}

async function publishCarousel({ caption, mediaUrls }) {
  // Step 1: Create child containers
  const children = [];
  for (const url of mediaUrls) {
    const isVideo = url.match(/\.(mp4|mov|avi)$/i);
    const container = await graphFetch(`/${IG_ACCOUNT_ID}/media`, {
      ...(isVideo ? { video_url: url, media_type: 'VIDEO' } : { image_url: url }),
      is_carousel_item: true,
    });
    if (isVideo) await waitForContainer(container.id);
    children.push(container.id);
  }

  // Step 2: Create carousel container
  const carousel = await graphFetch(`/${IG_ACCOUNT_ID}/media`, {
    caption,
    media_type: 'CAROUSEL',
    children: children.join(','),
  });

  // Step 3: Publish
  const result = await graphFetch(`/${IG_ACCOUNT_ID}/media_publish`, {
    creation_id: carousel.id,
  });
  return result;
}

// ===== Facebook Page Publishing =====

/**
 * Make a Graph API call using the Page Access Token (required for FB page publishing).
 */
async function pageGraphFetch(path, body) {
  const pageToken = await getPageAccessToken();
  const res = await fetch(`${GRAPH_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: pageToken, ...body }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Facebook error: ${data.error.message} (code: ${data.error.code})`);
  return data;
}

async function publishToFacebook({ postType, caption, mediaUrls }) {
  if (!FB_PAGE_ID || !ACCESS_TOKEN) {
    throw new Error('Facebook credentials not configured. Set FACEBOOK_PAGE_ID and META_ACCESS_TOKEN.');
  }

  if (!mediaUrls?.length) {
    throw new Error('No media URLs provided for Facebook publishing.');
  }

  // Detect if media is actually a video
  const isVideo = mediaUrls[0].match(/\.(mp4|mov|avi|webm)/i);

  if (postType === 'story') {
    // Facebook Page Stories API
    if (isVideo) {
      return fbPublishVideoStory({ caption, videoUrl: mediaUrls[0] });
    }
    return fbPublishPhotoStory({ caption, imageUrl: mediaUrls[0] });
  }

  if (postType === 'reel' || (isVideo && postType !== 'story')) {
    return fbPublishVideo({ caption, videoUrl: mediaUrls[0] });
  }

  // For image, carousel — post photos to the page
  if (mediaUrls.length === 1) {
    return fbPublishPhoto({ caption, imageUrl: mediaUrls[0] });
  }

  // Multiple images
  return fbPublishMultiPhoto({ caption, imageUrls: mediaUrls });
}

/**
 * Upload a video to a Facebook Page.
 * Uses the simple file_url approach (no upload_phase needed for URL-based uploads).
 * Falls back to resumable upload if the simple approach fails.
 * @param {string} videoUrl - Public URL of the video file
 * @param {object} [extraParams] - Additional params (description, published, etc.)
 * @returns {Promise<{id: string}>}
 */
async function fbUploadVideo(videoUrl, extraParams = {}) {
  const pageToken = await getPageAccessToken();

  // Approach 1: Simple file_url upload (no upload_phase — this is the correct
  // way to upload via URL on the Facebook Graph API)
  console.log('[META] Uploading video to Facebook via file_url...');
  const simpleRes = await fetch(`${GRAPH_URL}/${FB_PAGE_ID}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: pageToken,
      file_url: videoUrl,
      ...extraParams,
    }),
  });
  const simpleData = await simpleRes.json();

  if (simpleData.id) {
    console.log(`[META] Facebook video uploaded successfully: ${simpleData.id}`);
    return simpleData;
  }

  if (simpleData.error) {
    console.warn('[META] Simple file_url upload failed:', simpleData.error.message);

    // Approach 2: Resumable upload protocol (for cases where simple fails)
    console.log('[META] Trying resumable upload protocol...');

    // Phase 1: Start (without file_url)
    const startRes = await fetch(`${GRAPH_URL}/${FB_PAGE_ID}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: pageToken,
        upload_phase: 'start',
        file_size: 0, // Unknown size for URL uploads
      }),
    });
    const startData = await startRes.json();
    if (startData.error) throw new Error(`Facebook video start: ${startData.error.message}`);

    const sessionId = startData.upload_session_id;
    if (!sessionId) throw new Error('Facebook video upload: no session ID returned');

    // Phase 2: Transfer with file_url
    const transferRes = await fetch(`${GRAPH_URL}/${FB_PAGE_ID}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: pageToken,
        upload_phase: 'transfer',
        upload_session_id: sessionId,
        start_offset: 0,
        file_url: videoUrl,
      }),
    });
    const transferData = await transferRes.json();
    if (transferData.error) throw new Error(`Facebook video transfer: ${transferData.error.message}`);

    // Phase 3: Finish
    const finishRes = await fetch(`${GRAPH_URL}/${FB_PAGE_ID}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: pageToken,
        upload_phase: 'finish',
        upload_session_id: sessionId,
        ...extraParams,
      }),
    });
    const finishData = await finishRes.json();
    if (finishData.error) throw new Error(`Facebook video finish: ${finishData.error.message}`);

    return finishData;
  }

  throw new Error('Facebook video upload: unexpected response');
}

async function fbPublishPhotoStory({ caption, imageUrl }) {
  // Facebook Page photo stories: POST /{page-id}/photo_stories
  return pageGraphFetch(`/${FB_PAGE_ID}/photo_stories`, {
    photo_id: (await pageGraphFetch(`/${FB_PAGE_ID}/photos`, {
      url: imageUrl,
      published: false,
    })).id,
  });
}

async function fbPublishVideoStory({ caption, videoUrl }) {
  // Facebook Page video stories: POST /{page-id}/video_stories
  // Step 1: Upload video (unpublished) via resumable protocol
  const video = await fbUploadVideo(videoUrl, { description: caption, published: false });

  // Step 2: Create story
  return pageGraphFetch(`/${FB_PAGE_ID}/video_stories`, {
    video_id: video.id,
  });
}

async function fbPublishPhoto({ caption, imageUrl }) {
  return pageGraphFetch(`/${FB_PAGE_ID}/photos`, {
    url: imageUrl,
    message: caption,
    published: true,
  });
}

async function fbPublishMultiPhoto({ caption, imageUrls }) {
  // Step 1: Upload each photo as unpublished
  const photoIds = [];
  for (const url of imageUrls) {
    const photo = await pageGraphFetch(`/${FB_PAGE_ID}/photos`, {
      url,
      published: false,
    });
    photoIds.push(photo.id);
  }

  // Step 2: Create a feed post attaching all photos
  const body = { message: caption };
  photoIds.forEach((id, i) => {
    body[`attached_media[${i}]`] = `{"media_fbid":"${id}"}`;
  });

  return pageGraphFetch(`/${FB_PAGE_ID}/feed`, body);
}

async function fbPublishVideo({ caption, videoUrl }) {
  // Try the modern Reels API first, then fall back to resumable /videos upload.
  try {
    console.log('[META] Trying Facebook Reels API for video upload...');
    // Step 1: Initialize upload
    const init = await pageGraphFetch(`/${FB_PAGE_ID}/video_reels`, {
      upload_phase: 'start',
    });

    // Step 2: Upload the video via URL
    const pageToken = await getPageAccessToken();
    const uploadRes = await fetch(`${GRAPH_URL}/${init.video_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: pageToken,
        upload_phase: 'transfer',
        file_url: videoUrl,
      }),
    });
    const uploadData = await uploadRes.json();
    if (uploadData.error) throw new Error(uploadData.error.message);

    // Step 3: Publish
    const result = await pageGraphFetch(`/${FB_PAGE_ID}/video_reels`, {
      upload_phase: 'finish',
      video_id: init.video_id,
      description: caption,
    });
    console.log('[META] Facebook Reels API publish succeeded');
    return { id: init.video_id, ...result };
  } catch (reelErr) {
    console.warn('[META] Facebook Reels API failed, trying resumable /videos:', reelErr.message);
    // Fallback: use proper resumable video upload protocol
    return fbUploadVideo(videoUrl, { description: caption });
  }
}

module.exports = { publishToInstagram, publishToFacebook };
