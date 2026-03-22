// ===== State =====
const state = {
  businesses: [],
  selectedSMEs: new Set(),
  photos: {},           // { bizId: { logo, mainProductPhoto, productPhotos } }
  selectedPhotos: [],   // array of photo URLs
  postType: null,
  postStyle: null,
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
  } else {
    state.selectedSMEs.add(id);
  }
  updateSMECount();
  renderSMEGrid();
}

function updateSMECount() {
  const badge = document.getElementById('sme-count');
  const btn = document.getElementById('btn-step1-next');
  const count = state.selectedSMEs.size;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline' : 'none';
  btn.disabled = count === 0;
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

function updatePhotoCount() {
  const badge = document.getElementById('photo-count');
  const btn = document.getElementById('btn-step2-next');
  const count = state.selectedPhotos.length;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline' : 'none';
  btn.disabled = count === 0;
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
    const body = {
      businessIds: [...state.selectedSMEs],
      postType: state.postType,
      postStyle: state.postStyle,
      languages: [...state.languages],
      selectedPhotos: state.selectedPhotos,
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
  if (generatedMedia.length > 0) {
    if (state.postType === 'reel' && generatedMedia[0]) {
      mediaEl.innerHTML = `<video src="${generatedMedia[0]}" controls autoplay muted loop style="width:100%;height:100%;object-fit:cover"></video>`;
    } else {
      mediaEl.innerHTML = `<img src="${generatedMedia[0]}" alt="Generated media">`;
    }
  } else if (state.selectedPhotos.length > 0) {
    mediaEl.innerHTML = `<img src="${state.selectedPhotos[0]}" alt="Post media">`;
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
  if (luma && (state.postType === 'reel' || state.postType === 'carousel')) {
    document.getElementById('luma-brief').style.display = 'block';
    document.getElementById('luma-prompt-text').textContent = luma.prompt || '';
    document.getElementById('luma-style').textContent = luma.style || '';
    document.getElementById('luma-mood').textContent = luma.mood || '';

    const colorsEl = document.getElementById('luma-colors');
    colorsEl.innerHTML = (luma.colorPalette || []).map(c =>
      `<div class="color-dot" style="background:${c}" title="${c}"></div>`
    ).join('');

    // Carousel slides
    if (state.postType === 'carousel' && luma.slides?.length) {
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
      btn.innerHTML = '✅ Posted!';
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
