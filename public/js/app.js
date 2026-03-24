// ===== State =====
const state = {
  businesses: [],
  selectedSMEs: new Set(),
  photos: {},           // { bizId: { logo, mainProductPhoto, productPhotos } }
  selectedPhotos: [],   // array of photo URLs
  postType: null,
  postStyle: null,
  videoModel: 'luma',
  videoQuality: '1080p',
  music: 'none',
  languages: new Set(),
  currentStep: 1,
  generatedPost: null,  // { post, caption, luma }
  activeLang: null,     // currently viewed language in preview
};

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  fetchBusinesses();
  addLog('info', 'System initialized. Ready.');
});

// ===== API =====
async function fetchBusinesses() {
  try {
    addLog('info', 'Fetching businesses from database...');
    const res = await fetch('/api/businesses');
    state.businesses = await res.json();
    addLog('success', `Loaded ${state.businesses.length} business(es)`);
    renderSMEGrid();
  } catch (err) {
    console.error('Failed to load businesses:', err);
    addLog('error', `Failed to load businesses: ${err.message}`);
    document.getElementById('sme-grid').innerHTML =
      '<p style="color: var(--danger)">Failed to load businesses. Is the database connected?</p>';
  }
}

async function fetchPhotos(bizId) {
  if (state.photos[bizId]) return state.photos[bizId];
  const res = await fetch(`/api/businesses/${bizId}/photos`);
  const data = await res.json();
  state.photos[bizId] = data;
  return data;
}

// ===== Rendering =====
function renderSMEGrid() {
  const grid = document.getElementById('sme-grid');
  const query = (document.getElementById('sme-search').value || '').toLowerCase();

  const filtered = state.businesses.filter(b => {
    const text = `${b.name} ${b.category} ${(b.tags || []).join(' ')} ${b.description}`.toLowerCase();
    return text.includes(query);
  });

  grid.innerHTML = filtered.map(b => `
    <div class="biz-card ${state.selectedSMEs.has(b.id) ? 'selected' : ''}"
         onclick="toggleSME(${b.id})" data-id="${b.id}">
      <div class="check-badge">✓</div>
      ${b.logo ? `<img class="biz-logo" src="${b.logo}" alt="${b.name} logo">` :
        `<div class="biz-logo" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem">${b.emoji || '🏪'}</div>`}
      <h3>${b.emoji || ''} ${b.name}</h3>
      <div class="biz-cat">${b.category}</div>
      <div class="biz-desc">${b.description}</div>
      ${b.tags?.length ? `<div class="biz-tags">${b.tags.map(t => `<span class="biz-tag">${t}</span>`).join('')}</div>` : ''}
    </div>
  `).join('');
}

// Search handler
document.getElementById('sme-search')?.addEventListener('input', renderSMEGrid);

function toggleSME(id) {
  if (state.selectedSMEs.has(id)) {
    state.selectedSMEs.delete(id);
    // Remove photos belonging to this deselected SME
    const bizPhotos = state.photos[id];
    if (bizPhotos) {
      const toRemove = new Set();
      if (bizPhotos.logo) toRemove.add(bizPhotos.logo);
      if (bizPhotos.mainProductPhoto) toRemove.add(bizPhotos.mainProductPhoto);
      for (const pp of (bizPhotos.productPhotos || [])) {
        if (pp.photo) toRemove.add(pp.photo);
      }
      state.selectedPhotos = state.selectedPhotos.filter(p => !toRemove.has(p));
    }
  } else {
    state.selectedSMEs.add(id);
  }
  updateSMECount();
  renderSMEGrid();
}

function updateSMECount() {
  const badge = document.getElementById('sme-count');
  const count = state.selectedSMEs.size;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline' : 'none';
  document.querySelectorAll('.btn-step1-next').forEach(btn => btn.disabled = count === 0);
}

// ===== Photo Gallery =====
async function renderPhotoGallery() {
  const container = document.getElementById('photos-container');
  container.innerHTML = '<div class="skeleton" style="height:200px;width:100%"></div>';

  let html = '';
  for (const bizId of state.selectedSMEs) {
    const biz = state.businesses.find(b => b.id === bizId);
    const photos = await fetchPhotos(bizId);

    html += `<h3 style="margin: 16px 0 8px">${biz.emoji || ''} ${biz.name}</h3>`;
    html += '<div class="photo-gallery">';

    // Logo
    if (photos.logo) {
      html += photoCard(photos.logo, 'Logo', bizId);
    }

    // Main product photo
    if (photos.mainProductPhoto) {
      html += photoCard(photos.mainProductPhoto, 'Product Photo', bizId);
    }

    // Additional product photos
    for (const pp of photos.productPhotos) {
      html += photoCard(pp.photo, `Photo #${pp.sort_order + 1}`, bizId);
    }

    if (!photos.logo && !photos.mainProductPhoto && !photos.productPhotos.length) {
      html += '<p style="color: var(--text-muted); padding: 20px;">No photos available for this business.</p>';
    }

    // Upload button
    html += `
      <div class="photo-item photo-upload" onclick="document.getElementById('upload-${bizId}').click()" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;border-style:dashed;cursor:pointer">
        <span style="font-size:1.5rem;color:var(--text-muted)">+</span>
        <span style="font-size:0.75rem;color:var(--text-muted)">Upload Photo</span>
        <input type="file" id="upload-${bizId}" accept="image/*" style="display:none" onchange="uploadPhoto(${bizId}, this)">
      </div>
    `;

    html += '</div>';
  }

  container.innerHTML = html;
  updatePhotoCount();
}

function photoCard(url, label) {
  const isSelected = state.selectedPhotos.includes(url);
  return `
    <div class="photo-item ${isSelected ? 'selected' : ''}" onclick="togglePhoto('${url.replace(/'/g, "\\'")}')">
      <img src="${url}" alt="${label}" loading="lazy" onerror="this.parentElement.style.display='none'">
      <div class="photo-check">✓</div>
      <div class="photo-label">${label}</div>
    </div>
  `;
}

function togglePhoto(url) {
  const idx = state.selectedPhotos.indexOf(url);
  if (idx >= 0) {
    state.selectedPhotos.splice(idx, 1);
  } else {
    state.selectedPhotos.push(url);
  }
  renderPhotoGallery();
}

async function uploadPhoto(bizId, input) {
  const file = input.files?.[0];
  if (!file) return;

  const biz = state.businesses.find(b => b.id === bizId);
  addLog('info', `Uploading photo for ${biz?.name || bizId}...`);

  try {
    const formData = new FormData();
    formData.append('photo', file);

    const res = await fetch(`/api/businesses/${bizId}/photos`, {
      method: 'POST',
      body: formData,
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Upload failed');

    addLog('success', `Photo uploaded: ${result.photo.photo}`);

    // Clear cached photos so gallery refreshes from DB
    delete state.photos[bizId];
    await renderPhotoGallery();
  } catch (err) {
    console.error('Upload failed:', err);
    addLog('error', `Upload failed: ${err.message}`);
  }
}

function updatePhotoCount() {
  const badge = document.getElementById('photo-count');
  const btn = document.getElementById('btn-step2-next');
  const count = state.selectedPhotos.length;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline' : 'none';
  btn.disabled = count === 0;
}

// ===== Add SME Modal =====
let selectedPriceRange = '';

function openAddSME() {
  document.getElementById('add-sme-modal').style.display = 'flex';
  // Populate country dropdown from geo-data.js
  const countrySelect = document.getElementById('sme-country');
  if (countrySelect.options.length <= 1 && window.COUNTRIES) {
    for (const c of window.COUNTRIES) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      countrySelect.appendChild(opt);
    }
  }
}

function closeAddSME() {
  document.getElementById('add-sme-modal').style.display = 'none';
}

function onCountryChange() {
  const country = document.getElementById('sme-country').value;
  const citySelect = document.getElementById('sme-city');
  citySelect.innerHTML = '<option value="">Select city...</option>';

  const cities = window.CITIES_BY_COUNTRY?.[country] || [];
  for (const c of cities) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    citySelect.appendChild(opt);
  }
}

function selectPriceRange(el) {
  document.querySelectorAll('#price-range-chips .chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedPriceRange = el.dataset.value;
}

async function saveNewSME() {
  const name = document.getElementById('sme-name').value.trim();
  const category = document.getElementById('sme-category').value;
  const country = document.getElementById('sme-country').value;

  if (!name || !category || !country) {
    alert('Name, category, and country are required.');
    return;
  }

  const btn = document.getElementById('btn-save-sme');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const tagsRaw = document.getElementById('sme-tags').value.trim();
  const tagsArray = tagsRaw ? `{${tagsRaw.split(',').map(t => t.trim()).filter(Boolean).join(',')}}` : '{}';

  const body = {
    name,
    category,
    description: document.getElementById('sme-description').value.trim(),
    short_tagline: document.getElementById('sme-tagline').value.trim(),
    country,
    city: document.getElementById('sme-city').value,
    address: document.getElementById('sme-address').value.trim(),
    emoji: document.getElementById('sme-emoji').value,
    price_range: selectedPriceRange,
    tags: tagsArray,
    website: document.getElementById('sme-website').value.trim(),
    contact_email: document.getElementById('sme-email').value.trim(),
    contact_phone: document.getElementById('sme-phone').value.trim(),
    owner_name: document.getElementById('sme-owner').value.trim(),
    year_founded: document.getElementById('sme-year').value ? parseInt(document.getElementById('sme-year').value) : null,
    instagram: document.getElementById('sme-instagram').value.trim(),
    facebook: document.getElementById('sme-facebook').value.trim(),
    linkedin: document.getElementById('sme-linkedin').value.trim(),
    tiktok: document.getElementById('sme-tiktok').value.trim(),
  };

  try {
    const res = await fetch('/api/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to create business');

    addLog('success', `New business created: ${result.business.name} (ID: ${result.business.id})`);

    // Refresh businesses list and close modal
    await fetchBusinesses();
    closeAddSME();

    // Reset form
    document.querySelectorAll('#add-sme-modal input, #add-sme-modal textarea, #add-sme-modal select').forEach(el => {
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
    document.querySelectorAll('#price-range-chips .chip').forEach(c => c.classList.remove('selected'));
    selectedPriceRange = '';
  } catch (err) {
    console.error('Failed to create business:', err);
    addLog('error', `Failed to create business: ${err.message}`);
    alert('Failed to create business: ' + err.message);
  }

  btn.disabled = false;
  btn.textContent = 'Save Business';
}

// ===== Post Config =====
function selectPostType(el) {
  document.querySelectorAll('#post-type-chips .chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.postType = el.dataset.value;
  updateGenerateBtn();
}

function selectPostStyle(el) {
  document.querySelectorAll('#post-style-chips .chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.postStyle = el.dataset.value;
  updateGenerateBtn();
}

function selectVideoModel(el) {
  document.querySelectorAll('#video-model-chips .chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.videoModel = el.dataset.value;
}

function selectVideoQuality(el) {
  document.querySelectorAll('#video-quality-chips .chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.videoQuality = el.dataset.value;
}

function selectMusic(el) {
  document.querySelectorAll('#music-chips .chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.music = el.dataset.value;
}

function toggleLang(el) {
  const lang = el.dataset.value;
  if (state.languages.has(lang)) {
    state.languages.delete(lang);
    el.classList.remove('selected');
  } else {
    state.languages.add(lang);
    el.classList.add('selected');
  }
  updateGenerateBtn();
}

function addCustomLang() {
  const input = document.getElementById('custom-lang-input');
  const raw = input.value.trim();
  if (!raw) return;

  // Use the language name as the value (lowercase)
  const langKey = raw.toLowerCase();
  if (state.languages.has(langKey)) {
    input.value = '';
    return;
  }

  state.languages.add(langKey);

  // Add a chip to the UI
  const chipGroup = document.getElementById('language-chips');
  const chip = document.createElement('div');
  chip.className = 'chip selected';
  chip.dataset.value = langKey;
  chip.textContent = raw;
  chip.onclick = function () { toggleLang(this); };
  chipGroup.appendChild(chip);

  input.value = '';
  updateGenerateBtn();
  addLog('info', `Added custom language: ${raw}`);
}

function updateGenerateBtn() {
  const btn = document.getElementById('btn-generate');
  btn.disabled = !(state.postType && state.postStyle && state.languages.size > 0);
}

// ===== Step Navigation =====
function goToStep(step) {
  // Validate
  if (step === 2 && state.selectedSMEs.size === 0) return;
  if (step === 3 && state.selectedPhotos.length === 0) return;

  // Deactivate all
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.step-indicator').forEach(s => {
    const sStep = parseInt(s.dataset.step);
    s.classList.remove('active');
    if (sStep < step) s.classList.add('completed');
    else s.classList.remove('completed');
  });

  // Activate target
  document.getElementById(`step-${step}`).classList.add('active');
  document.querySelector(`.step-indicator[data-step="${step}"]`).classList.add('active');

  state.currentStep = step;

  // Load data for step
  if (step === 2) renderPhotoGallery();
  if (step === 4) fetchPostHistory();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== Generation (SSE) =====
async function generatePost() {
  const btn = document.getElementById('btn-generate');
  btn.disabled = true;
  btn.innerHTML = '<div class="status-spinner" style="width:16px;height:16px"></div> Generating...';

  showStatus('Starting generation...');
  addLog('info', `Starting post generation — type: ${state.postType}, style: ${state.postStyle}, languages: [${[...state.languages].join(', ')}], photos: ${state.selectedPhotos.length}`);

  try {
    const customDesc = document.getElementById('custom-description')?.value?.trim() || '';
    const body = {
      businessIds: [...state.selectedSMEs],
      postType: state.postType,
      postStyle: state.postStyle,
      videoModel: state.videoModel,
      videoQuality: state.videoQuality,
      languages: [...state.languages],
      selectedPhotos: state.selectedPhotos,
      music: state.music,
      ...(customDesc ? { customDescription: customDesc } : {}),
    };

    const response = await fetch('/api/posts/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      let eventName = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventName = line.slice(7);
        } else if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          handleSSEEvent(eventName, data);
        }
      }
    }
  } catch (err) {
    console.error('Generation failed:', err);
    addLog('error', `Generation failed: ${err.message}`);
    showStatus('Generation failed: ' + err.message, true);
  }

  btn.disabled = false;
  btn.innerHTML = '✨ Generate Post';
}

function handleSSEEvent(event, data) {
  switch (event) {
    case 'status':
      showStatus(data.message);
      addLog('status', data.message);
      // Progress stages
      const stages = { fetching: 15, caption: 35, luma: 50, luma_generating: 70, saving: 90, done: 100 };
      setProgress(stages[data.stage] || 0);
      if (data.stage === 'done') {
        setTimeout(() => hideStatus(), 2000);
      }
      break;

    case 'caption':
      state.generatedPost = state.generatedPost || {};
      state.generatedPost.caption = data;
      break;

    case 'luma':
      state.generatedPost = state.generatedPost || {};
      state.generatedPost.luma = data;
      break;

    case 'complete':
      state.generatedPost = data;
      renderPreview();
      goToStep(4);
      break;

    case 'log':
      addLog(data.level || 'info', data.message);
      break;

    case 'error':
      showStatus('Error: ' + data.message, true);
      addLog('error', data.message);
      break;
  }
}

// ===== Preview =====
function renderPreview() {
  if (!state.generatedPost) return;

  const { caption: captionData, luma, post } = state.generatedPost;

  // Set up language tabs
  const langs = Object.keys(captionData.caption || {});
  state.activeLang = langs[0] || 'en';

  const tabsEl = document.getElementById('lang-tabs');
  tabsEl.innerHTML = langs.map(lang =>
    `<div class="lang-tab ${lang === state.activeLang ? 'active' : ''}" onclick="switchPreviewLang('${lang}')">${lang.toUpperCase()}</div>`
  ).join('');

  // Fill preview
  updatePreviewContent();

  // Media preview — prefer Luma-generated media, fall back to selected photos
  const mediaEl = document.getElementById('preview-media');
  const generatedMedia = state.generatedPost.mediaUrls || [];
  const postType = state.postType || state.generatedPost?.post?.post_type;
  const hasVideo = generatedMedia.length > 0 && (postType === 'reel' || postType === 'story');
  if (generatedMedia.length > 0) {
    if (hasVideo && generatedMedia[0]) {
      mediaEl.innerHTML = `<video id="preview-video" src="${generatedMedia[0]}" controls autoplay muted loop style="width:100%;height:100%;object-fit:cover"></video>`;
    } else {
      mediaEl.innerHTML = `<img src="${generatedMedia[0]}" alt="Generated media">`;
    }
  } else if (state.selectedPhotos.length > 0) {
    mediaEl.innerHTML = `<img src="${state.selectedPhotos[0]}" alt="Post media">`;
  }

  // Show/hide video controls
  const videoControls = document.getElementById('video-controls');
  if (hasVideo || (postType === 'reel' || postStyle === 'animation')) {
    videoControls.style.display = 'block';
    document.getElementById('trim-panel').style.display = hasVideo ? 'block' : 'none';
    if (hasVideo) initTrimSlider();
  } else {
    videoControls.style.display = 'none';
  }

  // Username from first selected business
  const firstBiz = state.businesses.find(b => state.selectedSMEs.has(b.id));
  if (firstBiz) {
    document.getElementById('preview-username').textContent = firstBiz.instagram || firstBiz.name.toLowerCase().replace(/\s+/g, '_');
    if (firstBiz.logo) {
      document.getElementById('preview-avatar').style.backgroundImage = `url(${firstBiz.logo})`;
      document.getElementById('preview-avatar').style.backgroundSize = 'cover';
    }
  }

  // Luma brief
  if (luma && (postType === 'reel' || postType === 'carousel')) {
    document.getElementById('luma-brief').style.display = 'block';
    document.getElementById('luma-prompt-text').textContent = luma.prompt || '';
    document.getElementById('luma-style').textContent = luma.style || '';
    document.getElementById('luma-mood').textContent = luma.mood || '';

    const colorsEl = document.getElementById('luma-colors');
    colorsEl.innerHTML = (luma.colorPalette || []).map(c =>
      `<div class="color-dot" style="background:${c}" title="${c}"></div>`
    ).join('');

    // Carousel slides
    if (postType === 'carousel' && luma.slides?.length) {
      document.getElementById('carousel-preview-section').style.display = 'block';
      document.getElementById('carousel-slides').innerHTML = luma.slides.map((s, i) => `
        <div class="carousel-slide" style="display:flex;align-items:center;justify-content:center;padding:16px;text-align:center;">
          <div>
            <div style="font-size:0.75rem;color:var(--accent2);margin-bottom:4px">Slide ${s.slideNumber || i + 1}</div>
            <div style="font-size:0.85rem;color:var(--text)">${s.description || ''}</div>
          </div>
        </div>
      `).join('');
    }
  } else {
    document.getElementById('luma-brief').style.display = 'none';
    document.getElementById('carousel-preview-section').style.display = 'none';
  }
}

function updatePreviewContent() {
  const { caption: captionData } = state.generatedPost;
  const lang = state.activeLang;

  const captionText = captionData.caption?.[lang] || Object.values(captionData.caption || {})[0] || '';
  const hashtags = captionData.hashtags || '';

  document.getElementById('preview-caption').textContent = captionText;
  document.getElementById('preview-hashtags').textContent = hashtags;
  document.getElementById('edit-caption').value = captionText;
  document.getElementById('edit-hashtags').value = hashtags;
}

function switchPreviewLang(lang) {
  state.activeLang = lang;
  document.querySelectorAll('.lang-tab').forEach(t => {
    t.classList.toggle('active', t.textContent.toLowerCase() === lang);
  });
  updatePreviewContent();
}

// ===== Edit handlers =====
document.getElementById('edit-caption')?.addEventListener('input', (e) => {
  document.getElementById('preview-caption').textContent = e.target.value;
  if (state.generatedPost?.caption?.caption) {
    state.generatedPost.caption.caption[state.activeLang] = e.target.value;
  }
});

document.getElementById('edit-hashtags')?.addEventListener('input', (e) => {
  document.getElementById('preview-hashtags').textContent = e.target.value;
  if (state.generatedPost?.caption) {
    state.generatedPost.caption.hashtags = e.target.value;
  }
});

// ===== Regenerate =====
function regeneratePost() {
  goToStep(3);
  generatePost();
}

// ===== Publish =====
async function publishPost() {
  if (!state.generatedPost?.post?.id) {
    showStatus('No post to publish', true);
    return;
  }

  const btn = document.getElementById('btn-publish');
  btn.disabled = true;
  btn.innerHTML = '<div class="status-spinner" style="width:16px;height:16px"></div> Publishing...';
  showStatus('Publishing to Instagram...');

  try {
    // Save edits first
    await fetch(`/api/posts/${state.generatedPost.post.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption: document.getElementById('edit-caption').value,
        hashtags: document.getElementById('edit-hashtags').value,
      }),
    });

    // Publish
    const res = await fetch(`/api/posts/${state.generatedPost.post.id}/publish`, {
      method: 'POST',
    });

    const result = await res.json();
    if (result.success) {
      showStatus('Successfully posted to Instagram!');
      // Hide spinner and auto-dismiss status bar
      document.getElementById('status-spinner').style.display = 'none';
      setTimeout(() => hideStatus(), 3000);
      btn.innerHTML = '✅ Posted!';
      // Refresh history to show updated status
      fetchPostHistory();
    } else {
      throw new Error(result.error || 'Publishing failed');
    }
  } catch (err) {
    showStatus('Publishing failed: ' + err.message, true);
    btn.disabled = false;
    btn.innerHTML = '📱 Post to Instagram';
  }
}

// ===== Status Bar =====
function showStatus(message, isError) {
  const bar = document.getElementById('status-bar');
  const text = document.getElementById('status-text');
  const spinner = document.getElementById('status-spinner');
  bar.classList.add('visible');
  text.textContent = message;
  text.style.color = isError ? 'var(--danger)' : 'var(--text)';
  spinner.style.display = isError ? 'none' : 'block';
}

function hideStatus() {
  document.getElementById('status-bar').classList.remove('visible');
  setProgress(0);
}

function setProgress(pct) {
  document.getElementById('progress-fill').style.width = pct + '%';
}

// ===== Activity Logs =====
let logCount = 0;

function addLog(level, message) {
  const container = document.getElementById('logs-content');
  if (!container) return;

  logCount++;
  const time = new Date().toLocaleTimeString();
  const prefix = { info: 'ℹ', success: '✓', error: '✗', warn: '⚠', status: '►' }[level] || '•';
  const entry = document.createElement('div');
  entry.className = `log-entry log-${level}`;
  entry.innerHTML = `<span class="log-time">${time}</span> ${prefix} ${message}`;
  container.appendChild(entry);

  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;

  // Update badge
  const badge = document.getElementById('logs-badge');
  if (badge) {
    badge.textContent = logCount;
    badge.style.display = 'inline';
  }
}

function toggleLogs() {
  const panel = document.getElementById('logs-panel');
  panel.classList.toggle('collapsed');
}

// ===== Post History =====
async function fetchPostHistory() {
  try {
    const res = await fetch('/api/posts');
    const posts = await res.json();
    renderPostHistory(posts);
  } catch (err) {
    console.error('Failed to fetch post history:', err);
    document.getElementById('post-history').innerHTML =
      '<p style="color: var(--text-muted); font-size: 0.85rem;">Failed to load history.</p>';
  }
}

function renderPostHistory(posts) {
  const container = document.getElementById('post-history');
  const badge = document.getElementById('history-count');

  if (!posts.length) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">No posts yet.</p>';
    badge.style.display = 'none';
    return;
  }

  badge.textContent = posts.length;
  badge.style.display = 'inline';

  container.innerHTML = `<table class="history-table">
    <thead>
      <tr>
        <th>ID</th>
        <th>SMEs</th>
        <th>Type</th>
        <th>Style</th>
        <th>Status</th>
        <th>Created</th>
        <th>Caption</th>
      </tr>
    </thead>
    <tbody>
      ${posts.map(p => {
        const statusClass = p.status === 'posted' ? 'posted' : p.status === 'failed' ? 'failed' : 'draft';
        const date = new Date(p.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        // Resolve SME names from loaded businesses
        const smeNames = (p.business_ids || [])
          .map(id => state.businesses.find(b => b.id == id))
          .filter(Boolean)
          .map(b => `${b.emoji || ''} ${b.name}`.trim())
          .join(', ') || '—';
        // Parse caption — could be JSON string or plain text
        let captionPreview = '';
        try {
          const parsed = JSON.parse(p.caption);
          const firstLang = Object.values(parsed)[0] || '';
          captionPreview = firstLang;
        } catch {
          captionPreview = p.caption || '';
        }
        if (captionPreview.length > 60) captionPreview = captionPreview.slice(0, 60) + '...';

        return `<tr class="history-row" onclick='loadPostFromHistory(${JSON.stringify(p.id)})' style="cursor:pointer">
          <td>#${p.id}</td>
          <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${smeNames}</td>
          <td>${p.post_type}</td>
          <td>${p.post_style}</td>
          <td><span class="status-badge ${statusClass}">${p.status}</span></td>
          <td>${date}</td>
          <td style="color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${captionPreview}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;

  // Store posts for quick lookup
  state.historyPosts = posts;
}

// ===== Regenerate Video Only =====
async function regenerateVideoOnly() {
  const postId = state.generatedPost?.post?.id;
  if (!postId) {
    showStatus('No post to regenerate video for', true);
    return;
  }

  const btn = document.getElementById('btn-regen-video');
  btn.disabled = true;
  btn.innerHTML = '<div class="status-spinner" style="width:16px;height:16px"></div> Regenerating...';
  showStatus('Regenerating video...');
  addLog('info', `Regenerating video only for post #${postId} using ${state.videoModel}`);

  try {
    const response = await fetch(`/api/posts/${postId}/regenerate-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoModel: state.videoModel,
        videoQuality: state.videoQuality,
        music: state.music,
      }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      let eventName = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventName = line.slice(7);
        } else if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (eventName === 'complete') {
            // Update media URLs in state without touching caption
            state.generatedPost.mediaUrls = data.mediaUrls || [];
            if (state.generatedPost.post) {
              state.generatedPost.post.media_urls = data.mediaUrls || [];
            }
            renderPreview();
          } else if (eventName === 'luma') {
            state.generatedPost.luma = data;
          } else {
            handleSSEEvent(eventName, data);
          }
        }
      }
    }
  } catch (err) {
    addLog('error', `Video regeneration failed: ${err.message}`);
    showStatus('Video regeneration failed: ' + err.message, true);
  }

  btn.disabled = false;
  btn.innerHTML = '🎬 Regenerate Video Only';
}

// ===== Video Trimming =====
let trimState = { duration: 0, startTime: 0, endTime: 0 };

function initTrimSlider() {
  const video = document.getElementById('preview-video');
  if (!video) return;

  const setup = () => {
    trimState.duration = video.duration || 0;
    trimState.startTime = 0;
    trimState.endTime = trimState.duration;

    const startSlider = document.getElementById('trim-start');
    const endSlider = document.getElementById('trim-end');

    startSlider.max = trimState.duration;
    startSlider.value = 0;
    startSlider.step = 0.1;

    endSlider.max = trimState.duration;
    endSlider.value = trimState.duration;
    endSlider.step = 0.1;

    updateTrimLabels();

    startSlider.oninput = () => {
      trimState.startTime = parseFloat(startSlider.value);
      if (trimState.startTime >= trimState.endTime - 0.5) {
        trimState.startTime = trimState.endTime - 0.5;
        startSlider.value = trimState.startTime;
      }
      video.currentTime = trimState.startTime;
      updateTrimLabels();
    };

    endSlider.oninput = () => {
      trimState.endTime = parseFloat(endSlider.value);
      if (trimState.endTime <= trimState.startTime + 0.5) {
        trimState.endTime = trimState.startTime + 0.5;
        endSlider.value = trimState.endTime;
      }
      video.currentTime = trimState.endTime;
      updateTrimLabels();
    };
  };

  if (video.readyState >= 1) {
    setup();
  } else {
    video.addEventListener('loadedmetadata', setup, { once: true });
  }
}

function updateTrimLabels() {
  document.getElementById('trim-start-label').textContent = formatTime(trimState.startTime);
  document.getElementById('trim-end-label').textContent = formatTime(trimState.endTime);
  const trimDuration = trimState.endTime - trimState.startTime;
  document.getElementById('trim-duration-label').textContent = `Duration: ${trimDuration.toFixed(1)}s`;

  // Update visual track
  const track = document.getElementById('trim-track');
  if (track && trimState.duration > 0) {
    const leftPct = (trimState.startTime / trimState.duration) * 100;
    const rightPct = (trimState.endTime / trimState.duration) * 100;
    track.style.left = leftPct + '%';
    track.style.width = (rightPct - leftPct) + '%';
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${ms}`;
}

async function trimVideo() {
  const postId = state.generatedPost?.post?.id;
  if (!postId) return;

  if (trimState.startTime === 0 && trimState.endTime === trimState.duration) {
    showStatus('Adjust the trim sliders first', true);
    return;
  }

  const btn = document.getElementById('btn-trim');
  btn.disabled = true;
  btn.innerHTML = '<div class="status-spinner" style="width:16px;height:16px"></div> Trimming...';
  showStatus('Trimming video...');
  addLog('info', `Trimming video: ${formatTime(trimState.startTime)} → ${formatTime(trimState.endTime)}`);

  try {
    const res = await fetch(`/api/posts/${postId}/trim-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startTime: trimState.startTime,
        endTime: trimState.endTime,
        mediaIndex: 0,
      }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Trim failed');

    // Update state with trimmed video
    state.generatedPost.mediaUrls = result.mediaUrls;
    if (state.generatedPost.post) {
      state.generatedPost.post.media_urls = result.mediaUrls;
    }

    addLog('success', `Video trimmed successfully: ${result.trimmedUrl}`);
    showStatus('Video trimmed!');
    setTimeout(() => hideStatus(), 2000);

    renderPreview();
  } catch (err) {
    addLog('error', `Trim failed: ${err.message}`);
    showStatus('Trim failed: ' + err.message, true);
  }

  btn.disabled = false;
  btn.innerHTML = '✂️ Trim & Save';
}

// ===== Post History =====
async function loadPostFromHistory(postId) {
  const post = state.historyPosts?.find(p => p.id === postId);
  if (!post) return;

  // Parse caption from DB (could be JSON string or plain text)
  let captionObj = {};
  try {
    captionObj = JSON.parse(post.caption);
  } catch {
    captionObj = { en: post.caption || '' };
  }

  // Reconstruct state.generatedPost to match what renderPreview expects
  state.postType = post.post_type;
  state.generatedPost = {
    post: post,
    caption: {
      caption: captionObj,
      hashtags: post.hashtags || '',
      hook: '',
      cta: '',
    },
    luma: post.luma_prompt ? { prompt: post.luma_prompt } : null,
    mediaUrls: post.media_urls || [],
  };

  // Use selected_photos from the saved post
  state.selectedPhotos = post.selected_photos || [];

  // Try to resolve business info for avatar/username
  if (post.business_ids?.length) {
    const biz = state.businesses.find(b => post.business_ids.some(id => id == b.id));
    if (biz) {
      document.getElementById('preview-username').textContent = biz.instagram || biz.name.toLowerCase().replace(/\s+/g, '_');
      if (biz.logo) {
        document.getElementById('preview-avatar').style.backgroundImage = `url(${biz.logo})`;
        document.getElementById('preview-avatar').style.backgroundSize = 'cover';
      }
    }
  }

  renderPreview();

  // Update publish button based on status
  const btn = document.getElementById('btn-publish');
  if (post.status === 'posted') {
    btn.disabled = true;
    btn.innerHTML = '✅ Already Posted';
  } else {
    btn.disabled = false;
    btn.innerHTML = '📱 Post to Instagram';
  }

  // Scroll to top of preview
  document.getElementById('step-4').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Highlight the selected row
  document.querySelectorAll('.history-row').forEach(r => r.classList.remove('selected'));
  const rows = document.querySelectorAll('.history-row');
  for (const row of rows) {
    if (row.querySelector('td')?.textContent === `#${postId}`) {
      row.classList.add('selected');
      break;
    }
  }
}
