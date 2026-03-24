/**
 * Meta Graph API integration for Instagram & Facebook publishing.
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing
 * Facebook: https://developers.facebook.com/docs/pages-api/posts
 */

const IG_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
const FB_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const GRAPH_URL = 'https://graph.facebook.com/v19.0';

async function publishToInstagram({ postType, caption, mediaUrls }) {
  if (!IG_ACCOUNT_ID || !ACCESS_TOKEN) {
    throw new Error('Meta API credentials not configured. Set INSTAGRAM_BUSINESS_ACCOUNT_ID and META_ACCESS_TOKEN.');
  }

  if (!mediaUrls?.length) {
    throw new Error('No media URLs provided for publishing.');
  }

  if (postType === 'image') {
    return publishSingleImage({ caption, imageUrl: mediaUrls[0], isStory: false });
  } else if (postType === 'story') {
    // Stories always publish as a single image (collage if multi-photo)
    return publishSingleImage({ caption, imageUrl: mediaUrls[0], isStory: true });
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

async function publishToFacebook({ postType, caption, mediaUrls }) {
  if (!FB_PAGE_ID || !ACCESS_TOKEN) {
    throw new Error('Facebook credentials not configured. Set FACEBOOK_PAGE_ID and META_ACCESS_TOKEN.');
  }

  if (!mediaUrls?.length) {
    throw new Error('No media URLs provided for Facebook publishing.');
  }

  if (postType === 'reel') {
    return fbPublishVideo({ caption, videoUrl: mediaUrls[0] });
  }

  // For image, story, carousel — post photos to the page
  if (mediaUrls.length === 1) {
    return fbPublishPhoto({ caption, imageUrl: mediaUrls[0] });
  }

  // Multiple images — upload each as unpublished, then create a multi-photo post
  return fbPublishMultiPhoto({ caption, imageUrls: mediaUrls });
}

async function fbPublishPhoto({ caption, imageUrl }) {
  return graphFetch(`/${FB_PAGE_ID}/photos`, {
    url: imageUrl,
    message: caption,
    published: true,
  });
}

async function fbPublishMultiPhoto({ caption, imageUrls }) {
  // Step 1: Upload each photo as unpublished
  const photoIds = [];
  for (const url of imageUrls) {
    const photo = await graphFetch(`/${FB_PAGE_ID}/photos`, {
      url,
      published: false,
    });
    photoIds.push(photo.id);
  }

  // Step 2: Create a feed post attaching all photos
  const attachments = {};
  photoIds.forEach((id, i) => {
    attachments[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
  });

  // graphFetch sends JSON body, but multi-photo needs form-style params
  // Use the feed endpoint with attached_media
  const body = { message: caption };
  photoIds.forEach((id, i) => {
    body[`attached_media[${i}]`] = `{"media_fbid":"${id}"}`;
  });

  return graphFetch(`/${FB_PAGE_ID}/feed`, body);
}

async function fbPublishVideo({ caption, videoUrl }) {
  // Upload video to Facebook page
  const result = await graphFetch(`/${FB_PAGE_ID}/videos`, {
    file_url: videoUrl,
    description: caption,
  });
  return result;
}

module.exports = { publishToInstagram, publishToFacebook };
