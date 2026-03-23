(function() {
  'use strict';

  // ===== MODE DETECTION =====
  const isEmbedded = window !== window.parent;

  // ===== STATE =====
  let changes = {};
  let originalTexts = {};
  let currentSlug = window.GDS_SLUG || 'home';
  let seoData = {};
  let imageChanges = 0;
  let siteName = 'Site';

  // ===== BUILD ADMIN BAR =====
  function buildAdminBar() {
    document.body.classList.add('gds-admin-mode');

    // Try to get site name from parent frame or page title
    try {
      if (window.parent && window.parent.GDS_SITE_NAME) {
        siteName = window.parent.GDS_SITE_NAME;
      }
    } catch (e) { /* cross-origin, ignore */ }
    if (siteName === 'Site') {
      siteName = document.title || 'Mon Site';
    }

    const bar = document.createElement('div');
    bar.id = 'gds-admin-bar';
    bar.innerHTML = `
      <div class="gds-ab-logo">${escapeHtml(siteName)}</div>
      <div class="gds-ab-sep"></div>
      <select id="gdsPageSelect"></select>
      <div class="gds-ab-changes" id="gdsChangesCount"></div>
      <div class="gds-ab-spacer"></div>
      <button class="gds-ab-btn gds-ab-btn-seo" id="gdsSeoBtn">SEO</button>
      <button class="gds-ab-btn gds-ab-btn-publish" id="gdsPublishBtn" disabled>Publier</button>
      <button class="gds-ab-btn gds-ab-btn-logout" id="gdsLogoutBtn">Deconnexion</button>
    `;
    document.body.prepend(bar);

    // Toast
    const toast = document.createElement('div');
    toast.id = 'gds-admin-toast';
    document.body.appendChild(toast);

    // SEO Panel
    const seoPanel = document.createElement('div');
    seoPanel.id = 'gds-seo-panel';
    seoPanel.innerHTML = `
      <button class="gds-seo-close" id="gdsSeoClose">&times;</button>
      <h3>SEO - Meta tags</h3>
      <div class="gds-seo-grid">
        <div class="gds-seo-field">
          <label>Title</label>
          <input type="text" id="gdsSeoTitle" placeholder="Titre de la page">
        </div>
        <div class="gds-seo-field">
          <label>Meta Description</label>
          <input type="text" id="gdsSeoDesc" placeholder="Description pour Google">
        </div>
        <div class="gds-seo-field">
          <label>OG Title (reseaux sociaux)</label>
          <input type="text" id="gdsSeoOgTitle" placeholder="Titre Facebook/LinkedIn">
        </div>
        <div class="gds-seo-field">
          <label>OG Description</label>
          <input type="text" id="gdsSeoOgDesc" placeholder="Description reseaux sociaux">
        </div>
      </div>
    `;
    document.body.appendChild(seoPanel);

    // Events
    document.getElementById('gdsPublishBtn').addEventListener('click', publish);
    document.getElementById('gdsLogoutBtn').addEventListener('click', logout);
    document.getElementById('gdsSeoBtn').addEventListener('click', () => seoPanel.classList.toggle('open'));
    document.getElementById('gdsSeoClose').addEventListener('click', () => seoPanel.classList.remove('open'));

    // SEO field changes
    ['gdsSeoTitle', 'gdsSeoDesc', 'gdsSeoOgTitle', 'gdsSeoOgDesc'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        seoData._modified = true;
        updateChangesCount();
      });
    });

    // Load pages
    loadPages();
  }

  // ===== LOAD PAGES =====
  async function loadPages() {
    try {
      const res = await Auth.apiFetch('/api/pages');
      const data = await res.json();
      const pages = Array.isArray(data) ? data : (data.pages || []);
      const select = document.getElementById('gdsPageSelect');
      select.innerHTML = '';
      pages.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.slug;
        opt.textContent = p.name;
        if (p.slug === currentSlug) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });

      select.addEventListener('change', () => {
        const newSlug = select.value;
        if (Object.keys(changes).length > 0 || seoData._modified) {
          if (!confirm('Vous avez des modifications non publiees. Changer de page sans publier ?')) {
            select.value = currentSlug;
            return;
          }
        }
        window.location.href = '/api/pages/' + encodeURIComponent(newSlug) + '/preview?edit=1';
      });

      // Load SEO data
      loadSEO();
    } catch (err) {
      console.error('[GDS Admin] loadPages error:', err);
    }

    // Always init editing features regardless of page list loading
    try { autoTagEditableElements(); } catch (e) { console.error('[GDS] autoTagEditableElements error:', e); }
    try { initEditableElements(); } catch (e) { console.error('[GDS] initEditableElements error:', e); }
    try { initEditableImages(); } catch (e) { console.error('[GDS] initEditableImages error:', e); }
    try { initPlaceholderImages(); } catch (e) { console.error('[GDS] initPlaceholderImages error:', e); }
    try { initBlockInserters(); } catch (e) { console.error('[GDS] initBlockInserters error:', e); }
    try { initMurGallery(); } catch (e) { console.error('[GDS] initMurGallery error:', e); }
  }

  // ===== LOAD SEO =====
  async function loadSEO() {
    try {
      const res = await Auth.apiFetch('/api/pages/' + currentSlug);
      const data = await res.json();
      seoData = data.seo || {};
      document.getElementById('gdsSeoTitle').value = seoData.title || '';
      document.getElementById('gdsSeoDesc').value = seoData.description || '';
      document.getElementById('gdsSeoOgTitle').value = seoData.ogTitle || '';
      document.getElementById('gdsSeoOgDesc').value = seoData.ogDescription || '';
    } catch (e) { /* ignore */ }
  }

  // ===== AUTO-TAG EDITABLE ELEMENTS IN NEW BLOCKS =====
  function autoTagEditableElements() {
    // Find all section wrappers
    const wrappers = document.querySelectorAll('.gds-section-wrapper');
    let autoIdx = 0;

    wrappers.forEach(wrapper => {
      const file = wrapper.getAttribute('data-gds-file') || 'custom';
      const sectionName = file.replace(/^\d+-/, '').replace('.html', '');

      // Find h1-h4 and p elements that DON'T already have data-gds-edit
      const candidates = wrapper.querySelectorAll('h1, h2, h3, h4, p, .hero-subtitle, .hero-tagline');
      candidates.forEach(el => {
        // Skip if already tagged
        if (el.hasAttribute('data-gds-edit')) return;
        // Skip if inside admin UI elements
        if (el.closest('#gds-admin-bar, #gds-seo-panel, .gds-block-inserter, .gds-section-actions')) return;
        // Skip if inside an element with onclick (FAQ toggles, accordions, etc.)
        if (el.closest('[onclick]')) return;
        // Skip if it's an empty or whitespace-only element
        if (!el.textContent.trim()) return;
        // Skip tiny elements (likely labels or decorations)
        if (el.textContent.trim().length < 2) return;

        const tag = el.tagName.toLowerCase();
        const editId = `${sectionName}:${autoIdx}:${tag}`;
        el.setAttribute('data-gds-edit', editId);
        el.setAttribute('data-gds-section', sectionName);
        el.setAttribute('data-gds-tag', tag.toUpperCase());
        autoIdx++;
      });
    });

    if (autoIdx > 0) {
      console.log('[GDS Admin] Auto-tagged', autoIdx, 'elements in new blocks');
    }
  }

  // ===== INIT EDITABLE ELEMENTS =====
  function initEditableElements() {
    const editables = document.querySelectorAll('[data-gds-edit]');
    console.log('[GDS Admin] Found', editables.length, 'editable elements');
    if (editables.length === 0) {
      showToast('Aucun element editable trouve !', 'error');
    }

    editables.forEach(el => {
      const id = el.getAttribute('data-gds-edit');
      const tag = el.tagName.toLowerCase();

      // Store original text
      originalTexts[id] = el.innerHTML;

      // Set tag badge
      el.setAttribute('data-gds-tag', tag.toUpperCase());

      // Store original tag
      el.dataset.gdsOrigTag = tag;

      // Make focusable
      el.setAttribute('tabindex', '0');

      // Build tag selector buttons
      const tagBar = document.createElement('div');
      tagBar.className = 'gds-tag-select';
      ['H1','H2','H3','H4','P'].forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'gds-tag-btn' + (t === tag.toUpperCase() ? ' active' : '');
        btn.textContent = t;
        btn.type = 'button';
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault(); // prevent blur
          e.stopPropagation();
          changeTag(el, t.toLowerCase());
        });
        tagBar.appendChild(btn);
      });
      el.style.position = 'relative';
      el.appendChild(tagBar);

      // On click: enter edit mode
      el.addEventListener('click', (e) => {
        if (e.target.closest('.gds-tag-select')) return;
        if (e.target.tagName === 'A' && !e.target.closest('[data-gds-edit]').getAttribute('contenteditable')) {
          e.preventDefault();
        }
        el.setAttribute('contenteditable', 'true');
        el.focus();
      });

      // On focus: show tag bar + enable editing
      el.addEventListener('focus', () => {
        el.setAttribute('contenteditable', 'true');
        tagBar.style.display = 'flex';
      });

      // On blur: exit edit mode, track changes
      el.addEventListener('blur', () => {
        el.removeAttribute('contenteditable');
        tagBar.style.display = 'none';
        trackChange(el, id);
      });

      // Prevent Enter from creating divs
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          const t = el.tagName.toLowerCase();
          if (['h1', 'h2', 'h3', 'h4', 'p'].includes(t)) {
            e.preventDefault();
            el.blur();
          }
        }
        if (e.key === 'Escape') {
          el.innerHTML = originalTexts[id];
          el.blur();
        }
      });

      // Prevent link clicks when editing
      el.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', (e) => {
          if (el.getAttribute('contenteditable') === 'true') {
            e.preventDefault();
          }
        });
      });
    });
  }

  // ===== INIT EDITABLE IMAGES =====
  function initEditableImages() {
    const imgEls = document.querySelectorAll('[data-gds-img]');
    const bgEls = document.querySelectorAll('[data-gds-bg]');
    console.log('[GDS Admin] Found', imgEls.length, 'editable images +', bgEls.length, 'editable backgrounds');

    // Hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    // Floating toolbar (change + position)
    const toolbar = document.createElement('div');
    toolbar.className = 'gds-img-toolbar';
    toolbar.innerHTML = `
      <div class="gds-img-tb-row">
        <div class="gds-img-btn" id="gdsImgChangeBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Changer
        </div>
        <div class="gds-img-btn gds-img-pos-btn" id="gdsImgPosBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg> Position
        </div>
      </div>
      <div class="gds-img-sliders" id="gdsImgSliders" style="display:none">
        <div class="gds-img-slider-row">
          <label>H</label>
          <input type="range" min="0" max="100" value="50" id="gdsPosX">
          <span id="gdsPosXVal">50%</span>
        </div>
        <div class="gds-img-slider-row">
          <label>V</label>
          <input type="range" min="0" max="100" value="50" id="gdsPosY">
          <span id="gdsPosYVal">50%</span>
        </div>
        <button class="gds-img-pos-save" id="gdsPosSave">Appliquer</button>
      </div>
    `;
    toolbar.style.display = 'none';
    document.body.appendChild(toolbar);

    const changeBtn = document.getElementById('gdsImgChangeBtn');
    const posBtn = document.getElementById('gdsImgPosBtn');
    const slidersPanel = document.getElementById('gdsImgSliders');
    const posX = document.getElementById('gdsPosX');
    const posY = document.getElementById('gdsPosY');
    const posXVal = document.getElementById('gdsPosXVal');
    const posYVal = document.getElementById('gdsPosYVal');
    const posSave = document.getElementById('gdsPosSave');

    let activeEl = null;
    let hideTimer = null;
    let posOpen = false;

    // Detect images via elementsFromPoint (works through overlays)
    document.addEventListener('mousemove', (e) => {
      if (toolbar.contains(e.target)) return;
      if (posOpen) return; // Don't move toolbar while positioning

      const els = document.elementsFromPoint(e.clientX, e.clientY);
      let found = null;
      for (const el of els) {
        if (el.hasAttribute('data-gds-img') || el.hasAttribute('data-gds-bg')) {
          found = el;
          break;
        }
      }

      if (found && found !== activeEl) {
        clearTimeout(hideTimer);
        if (activeEl) activeEl.classList.remove('gds-img-hover');
        activeEl = found;
        activeEl.classList.add('gds-img-hover');
        showToolbar(found);
      } else if (!found && activeEl && !posOpen) {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          if (activeEl) activeEl.classList.remove('gds-img-hover');
          activeEl = null;
          toolbar.style.display = 'none';
          slidersPanel.style.display = 'none';
          posOpen = false;
        }, 400);
      }
    });

    function showToolbar(el) {
      const rect = el.getBoundingClientRect();
      toolbar.style.display = 'block';
      toolbar.style.top = (rect.top + window.scrollY + rect.height / 2 - 20) + 'px';
      toolbar.style.left = (rect.left + window.scrollX + rect.width / 2 - 110) + 'px';
      slidersPanel.style.display = 'none';
      posOpen = false;

      // Read current object-position
      const computed = window.getComputedStyle(el);
      const objPos = computed.objectPosition || computed.backgroundPosition || '50% 50%';
      const parts = objPos.split(/\s+/);
      const cx = parseInt(parts[0]) || 50;
      const cy = parseInt(parts[1]) || 50;
      posX.value = cx;
      posY.value = cy;
      posXVal.textContent = cx + '%';
      posYVal.textContent = cy + '%';
    }

    toolbar.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    toolbar.addEventListener('mouseleave', (e) => {
      if (posOpen) return;
      hideTimer = setTimeout(() => {
        if (activeEl) activeEl.classList.remove('gds-img-hover');
        activeEl = null;
        toolbar.style.display = 'none';
      }, 300);
    });

    // Change image button
    let uploadTarget = null; // Save reference before file dialog opens
    changeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeEl) {
        uploadTarget = activeEl; // Save before dialog steals focus
        fileInput.click();
      }
    });

    // Position button - toggle sliders
    posBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      posOpen = !posOpen;
      slidersPanel.style.display = posOpen ? 'block' : 'none';
    });

    // Live preview position
    posX.addEventListener('input', () => {
      posXVal.textContent = posX.value + '%';
      if (activeEl) applyPosition(activeEl, posX.value, posY.value);
    });
    posY.addEventListener('input', () => {
      posYVal.textContent = posY.value + '%';
      if (activeEl) applyPosition(activeEl, posX.value, posY.value);
    });

    function applyPosition(el, x, y) {
      if (el.hasAttribute('data-gds-img')) {
        el.style.objectPosition = x + '% ' + y + '%';
      } else {
        const style = el.getAttribute('style') || '';
        const newStyle = style.replace(/\d+%\s+\d+%/, x + '% ' + y + '%');
        el.setAttribute('style', newStyle);
      }
    }

    // Save position
    posSave.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!activeEl) return;

      const isImg = activeEl.hasAttribute('data-gds-img');
      const attrData = activeEl.getAttribute(isImg ? 'data-gds-img' : 'data-gds-bg');
      const section = attrData.split(':')[0];
      const src = attrData.split(':').slice(2).join(':');

      console.log('[GDS] Saving position:', { slug: currentSlug, section, src, posX: posX.value, posY: posY.value });
      posSave.textContent = '...';
      try {
        const res = await Auth.apiFetch('/api/pages/' + currentSlug + '/image-position', {
          method: 'POST',
          body: JSON.stringify({
            section: section,
            src: src,
            posX: posX.value,
            posY: posY.value
          })
        });
        const resData = await res.json().catch(() => ({}));
        console.log('[GDS] Position response:', res.status, resData);
        if (!res.ok) throw new Error(resData.error || 'Erreur ' + res.status);
        imageChanges++;
        updateChangesCount();
        showToast('Position sauvegardee !', 'success');
      } catch (err) {
        showToast('Erreur: ' + err.message, 'error');
        console.error('[GDS] Position save error:', err);
      }
      posSave.textContent = 'Appliquer';
      posOpen = false;
      slidersPanel.style.display = 'none';
    });

    // Upload handler
    fileInput.addEventListener('change', async () => {
      const el = uploadTarget || activeEl;
      if (!fileInput.files.length || !el) {
        console.error('[GDS] Upload: no file or no target element');
        return;
      }
      const file = fileInput.files[0];

      const isImg = el.hasAttribute('data-gds-img');
      const data = el.getAttribute(isImg ? 'data-gds-img' : 'data-gds-bg');
      if (!data) {
        console.error('[GDS] Upload: element has no data-gds-img/bg attribute');
        showToast('Erreur: image non editable', 'error');
        return;
      }
      const parts = data.split(':');
      const section = parts[0];
      const originalSrc = parts.slice(2).join(':');

      console.log('[GDS] Upload starting:', { section, originalSrc, file: file.name, size: file.size });
      changeBtn.textContent = 'Upload...';

      try {
        const renderedW = el.offsetWidth || 800;
        const renderedH = el.offsetHeight || 600;
        const maxWidth = Math.max(renderedW * 2, 400);
        const maxHeight = Math.max(renderedH * 2, 400);

        const formData = new FormData();
        formData.append('image', file);
        formData.append('originalSrc', originalSrc);
        formData.append('section', section);
        formData.append('slug', currentSlug);
        formData.append('maxWidth', maxWidth);
        formData.append('maxHeight', maxHeight);

        console.log('[GDS] Upload sending...', originalSrc);
        const res = await Auth.apiFetch('/api/pages/' + currentSlug + '/upload-image', {
          method: 'POST',
          body: formData
        });
        console.log('[GDS] Upload response:', res.status);
        if (!res.ok) {
          const errData = await res.json().catch(()=>({}));
          throw new Error(errData.error || 'Erreur ' + res.status);
        }
        const result = await res.json();
        console.log('[GDS] Upload result:', result);

        if (isImg) {
          el.src = result.newSrc + '?v=' + Date.now();
        } else {
          const currentStyle = el.getAttribute('style') || '';
          el.setAttribute('style', currentStyle.replace(/url\([^)]+\)/, 'url(' + result.newSrc + '?v=' + Date.now() + ')'));
        }
        imageChanges++;
        updateChangesCount();
        showToast('Image mise a jour !', 'success');
      } catch (err) {
        showToast('Erreur: ' + err.message, 'error');
      }

      changeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Changer`;
      fileInput.value = '';
      uploadTarget = null;
    });
  }

  // ===== PLACEHOLDER IMAGE REPLACEMENT =====
  function initPlaceholderImages() {
    // Find placeholder elements (bento-placeholder, or any div with placeholder-like content)
    const placeholders = document.querySelectorAll('.bento-placeholder, .image-placeholder, [data-gds-placeholder]');
    console.log('[GDS Admin] Found', placeholders.length, 'image placeholders');

    placeholders.forEach(ph => {
      // Style as clickable
      ph.style.cursor = 'pointer';
      ph.style.transition = 'all 0.2s';

      // Add hover overlay
      const overlay = document.createElement('div');
      overlay.className = 'gds-ph-overlay';
      overlay.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Ajouter une image';
      ph.style.position = 'relative';
      ph.appendChild(overlay);

      ph.addEventListener('click', (e) => {
        e.stopPropagation();
        openPlaceholderModal(ph);
      });
    });
  }

  function openPlaceholderModal(placeholderEl) {
    const existing = document.getElementById('gds-ph-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'gds-ph-modal';
    overlay.className = 'gds-modal-overlay';
    overlay.innerHTML = `
      <div class="gds-modal" style="max-width:500px;">
        <div class="gds-modal-header">
          <h3>Ajouter une image</h3>
          <button class="gds-modal-close" id="gds-ph-close">&times;</button>
        </div>
        <div class="gds-modal-body">
          <div style="display:flex;gap:12px;margin-bottom:20px;">
            <button class="gds-ph-tab active" data-tab="upload" id="gds-ph-tab-upload" style="flex:1;padding:12px;border:1px solid #30363d;border-radius:8px;background:#21262d;color:#e6edf3;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;">
              <div style="font-size:24px;margin-bottom:4px;">&#128228;</div>
              Uploader
            </button>
            <button class="gds-ph-tab" data-tab="url" id="gds-ph-tab-url" style="flex:1;padding:12px;border:1px solid #30363d;border-radius:8px;background:#0d1117;color:#8b949e;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;">
              <div style="font-size:24px;margin-bottom:4px;">&#128279;</div>
              URL
            </button>
          </div>
          <div id="gds-ph-upload-area" class="gds-ph-area">
            <div class="gds-block-upload visible" id="gds-ph-dropzone" style="display:block;">
              <input type="file" id="gds-ph-file" accept="image/*,video/mp4" style="display:none;">
              <div style="font-size:36px;margin-bottom:8px;">&#128247;</div>
              <div>Cliquez ou glissez une image / GIF / video</div>
              <div style="font-size:12px;color:#484f58;margin-top:6px;">JPG, PNG, WebP, GIF, MP4</div>
            </div>
            <div id="gds-ph-preview-img" style="display:none;text-align:center;">
              <img id="gds-ph-preview-src" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid #30363d;">
              <div style="margin-top:8px;font-size:12px;color:#3fb950;" id="gds-ph-file-name"></div>
            </div>
          </div>
          <div id="gds-ph-url-area" class="gds-ph-area" style="display:none;">
            <input type="url" id="gds-ph-url-input" placeholder="https://example.com/image.jpg" style="width:100%;padding:10px 14px;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#e6edf3;font-size:14px;">
            <div style="margin-top:8px;font-size:12px;color:#8b949e;">URL directe vers une image ou video (JPG, PNG, WebP, GIF, MP4)</div>
            <div id="gds-ph-url-preview" style="display:none;margin-top:12px;text-align:center;">
              <img id="gds-ph-url-preview-img" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid #30363d;">
            </div>
          </div>
        </div>
        <div class="gds-modal-footer">
          <button class="gds-modal-btn gds-modal-btn-cancel" id="gds-ph-cancel">Annuler</button>
          <button class="gds-modal-btn gds-modal-btn-submit" id="gds-ph-submit" disabled>Appliquer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('gds-ph-close').addEventListener('click', close);
    document.getElementById('gds-ph-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Tab switching
    const tabUpload = document.getElementById('gds-ph-tab-upload');
    const tabUrl = document.getElementById('gds-ph-tab-url');
    const areaUpload = document.getElementById('gds-ph-upload-area');
    const areaUrl = document.getElementById('gds-ph-url-area');

    tabUpload.addEventListener('click', () => {
      tabUpload.style.background = '#21262d'; tabUpload.style.color = '#e6edf3';
      tabUrl.style.background = '#0d1117'; tabUrl.style.color = '#8b949e';
      areaUpload.style.display = 'block'; areaUrl.style.display = 'none';
    });
    tabUrl.addEventListener('click', () => {
      tabUrl.style.background = '#21262d'; tabUrl.style.color = '#e6edf3';
      tabUpload.style.background = '#0d1117'; tabUpload.style.color = '#8b949e';
      areaUrl.style.display = 'block'; areaUpload.style.display = 'none';
    });

    // Upload dropzone
    const dropzone = document.getElementById('gds-ph-dropzone');
    const fileInput = document.getElementById('gds-ph-file');
    let selectedFile = null;
    let selectedUrl = '';

    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) {
        selectedFile = fileInput.files[0];
        selectedUrl = '';
        const isVid = selectedFile.type.startsWith('video/');
        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
          const previewContainer = document.getElementById('gds-ph-preview-img');
          const previewEl = document.getElementById('gds-ph-preview-src');
          if (isVid) {
            // Replace img with video for preview
            const vid = document.createElement('video');
            vid.src = e.target.result;
            vid.autoplay = true; vid.loop = true; vid.muted = true;
            vid.style.cssText = 'max-width:100%;max-height:200px;border-radius:8px;border:1px solid #30363d;';
            vid.id = 'gds-ph-preview-src';
            previewEl.replaceWith(vid);
          } else {
            previewEl.src = e.target.result;
          }
          document.getElementById('gds-ph-file-name').textContent = selectedFile.name + ' (' + (selectedFile.size / 1024).toFixed(0) + ' KB)';
          previewContainer.style.display = 'block';
          dropzone.style.display = 'none';
        };
        reader.readAsDataURL(selectedFile);
        document.getElementById('gds-ph-submit').disabled = false;
      }
    });

    // URL input
    const urlInput = document.getElementById('gds-ph-url-input');
    let urlDebounce;
    urlInput.addEventListener('input', () => {
      clearTimeout(urlDebounce);
      urlDebounce = setTimeout(() => {
        const url = urlInput.value.trim();
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          selectedUrl = url;
          selectedFile = null;
          // Try to show preview
          const preview = document.getElementById('gds-ph-url-preview');
          const previewImg = document.getElementById('gds-ph-url-preview-img');
          previewImg.src = url;
          previewImg.onload = () => { preview.style.display = 'block'; };
          previewImg.onerror = () => { preview.style.display = 'none'; };
          document.getElementById('gds-ph-submit').disabled = false;
        } else {
          document.getElementById('gds-ph-submit').disabled = true;
          document.getElementById('gds-ph-url-preview').style.display = 'none';
        }
      }, 500);
    });

    // Submit
    document.getElementById('gds-ph-submit').addEventListener('click', async () => {
      const submitBtn = document.getElementById('gds-ph-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Application...';

      try {
        let imgSrc = '';

        if (selectedFile) {
          // Upload image
          const formData = new FormData();
          formData.append('images', selectedFile);
          formData.append('slug', currentSlug);

          const res = await Auth.apiFetch('/api/media/upload', {
            method: 'POST',
            body: formData
          });
          if (!res.ok) throw new Error('Upload echoue');
          const data = await res.json();
          // upload returns { uploaded: [{ path, name, ... }] }
          imgSrc = (data.uploaded && data.uploaded[0] && data.uploaded[0].path) || data.url || data.path || '';
        } else if (selectedUrl) {
          imgSrc = selectedUrl;
        }

        if (!imgSrc) throw new Error('Aucune image');

        // Replace placeholder with img or video tag
        const parent = placeholderEl.parentElement;
        const caption = parent.querySelector('.bento-caption span');
        const altText = caption ? caption.textContent : 'Image';
        const isVideo = imgSrc.match(/\.(mp4|webm|mov)(\?|$)/i) || (selectedFile && selectedFile.type.startsWith('video/'));

        // Find section context for data-gds-img
        const wrapper = parent.closest('.gds-section-wrapper');
        const sectionFile = wrapper ? wrapper.getAttribute('data-gds-file') || 'custom' : 'custom';
        const sectionName = sectionFile.replace(/^\d+-/, '').replace('.html', '');

        let mediaEl;
        if (isVideo) {
          mediaEl = document.createElement('video');
          mediaEl.src = imgSrc;
          mediaEl.autoplay = true;
          mediaEl.loop = true;
          mediaEl.muted = true;
          mediaEl.playsInline = true;
          mediaEl.setAttribute('playsinline', '');
          mediaEl.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        } else {
          mediaEl = document.createElement('img');
          mediaEl.src = imgSrc;
          mediaEl.alt = altText;
          mediaEl.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
          // Add data-gds-img so the existing image editor toolbar can handle replacement
          mediaEl.setAttribute('data-gds-img', `${sectionName}:0:${imgSrc}`);
        }

        placeholderEl.replaceWith(mediaEl);

        // Save the section file with the new content (cleaned of admin UI)
        const wrapper = parent.closest('.gds-section-wrapper');
        if (wrapper) {
          const file = wrapper.getAttribute('data-gds-file');
          if (file) {
            const sectionHtml = cleanSectionHtml(wrapper);
            await Auth.apiFetch('/api/pages/' + currentSlug + '/section/' + encodeURIComponent(file), {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: sectionHtml })
            });
          }
        }

        close();
        showToast('Image ajoutee !', 'success');
        imageChanges++;
        updateChangesCount();
      } catch (err) {
        showToast('Erreur: ' + err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Appliquer';
      }
    });
  }

  // ===== CHANGE TAG (H1 <-> H2 etc) =====
  function changeTag(el, newTag) {
    const id = el.getAttribute('data-gds-edit');
    const currentTag = el.tagName.toLowerCase();
    if (currentTag === newTag) return;

    // Create new element with the new tag
    const newEl = document.createElement(newTag);
    // Copy all attributes
    for (const attr of el.attributes) {
      newEl.setAttribute(attr.name, attr.value);
    }
    // Copy content
    newEl.innerHTML = el.innerHTML;
    // Update tag badge
    newEl.setAttribute('data-gds-tag', newTag.toUpperCase());

    // Replace in DOM
    el.parentNode.replaceChild(newEl, el);

    // Re-init this element (events + tag bar)
    initSingleEditable(newEl);

    // Track the change
    trackChange(newEl, id);

    // Focus the new element
    newEl.setAttribute('contenteditable', 'true');
    newEl.focus();
  }

  function trackChange(el, id) {
    const newText = el.innerHTML;
    // Remove tag bar content from tracked text
    const cleanText = newText.replace(/<div class="gds-tag-select"[\s\S]*?<\/div>/, '');
    const currentTag = el.tagName.toLowerCase();
    const origTag = el.dataset.gdsOrigTag || currentTag;

    if (cleanText !== originalTexts[id] || currentTag !== origTag) {
      changes[id] = { id, text: cleanText, tag: currentTag, tagChanged: currentTag !== origTag };
      el.classList.add('gds-modified');
    } else {
      delete changes[id];
      el.classList.remove('gds-modified');
    }
    updateChangesCount();
  }

  function initSingleEditable(el) {
    const id = el.getAttribute('data-gds-edit');
    const tag = el.tagName.toLowerCase();

    el.dataset.gdsOrigTag = el.dataset.gdsOrigTag || tag;
    el.setAttribute('tabindex', '0');

    // Rebuild tag bar
    let tagBar = el.querySelector('.gds-tag-select');
    if (!tagBar) {
      tagBar = document.createElement('div');
      tagBar.className = 'gds-tag-select';
      el.style.position = 'relative';
      el.appendChild(tagBar);
    }
    tagBar.innerHTML = '';
    ['H1','H2','H3','H4','P'].forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'gds-tag-btn' + (t === tag.toUpperCase() ? ' active' : '');
      btn.textContent = t;
      btn.type = 'button';
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        changeTag(el, t.toLowerCase());
      });
      tagBar.appendChild(btn);
    });
    tagBar.style.display = 'none';

    el.addEventListener('click', (e) => {
      if (e.target.closest('.gds-tag-select')) return;
      if (e.target.tagName === 'A') e.preventDefault();
      el.setAttribute('contenteditable', 'true');
      el.focus();
    });

    el.addEventListener('focus', () => {
      el.setAttribute('contenteditable', 'true');
      tagBar.style.display = 'flex';
    });

    el.addEventListener('blur', () => {
      el.removeAttribute('contenteditable');
      tagBar.style.display = 'none';
      trackChange(el, id);
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (['h1','h2','h3','h4','p'].includes(el.tagName.toLowerCase())) {
          e.preventDefault();
          el.blur();
        }
      }
      if (e.key === 'Escape') {
        el.innerHTML = originalTexts[id];
        initSingleEditable(el);
        el.blur();
      }
    });

    el.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', (e) => {
        if (el.getAttribute('contenteditable') === 'true') e.preventDefault();
      });
    });
  }

  // ===== UPDATE CHANGES COUNT =====
  function updateChangesCount() {
    const count = Object.keys(changes).length + (seoData._modified ? 1 : 0) + imageChanges;

    // Update admin bar elements (only in standalone mode)
    const el = document.getElementById('gdsChangesCount');
    const btn = document.getElementById('gdsPublishBtn');
    if (el && btn) {
      if (count > 0) {
        el.textContent = count + ' modification' + (count > 1 ? 's' : '');
        el.classList.add('show');
        btn.disabled = false;
      } else {
        el.classList.remove('show');
        btn.disabled = true;
      }
    }

    // Notify parent frame of changes count
    notifyParent('changesCount', { count });
  }

  // ===== PUBLISH =====
  async function publish() {
    const btn = document.getElementById('gdsPublishBtn');
    btn.disabled = true;
    btn.textContent = 'Sauvegarde...';

    try {
      // Collect SEO changes
      const seo = seoData._modified ? {
        title: document.getElementById('gdsSeoTitle').value,
        description: document.getElementById('gdsSeoDesc').value,
        ogTitle: document.getElementById('gdsSeoOgTitle').value,
        ogDescription: document.getElementById('gdsSeoOgDesc').value
      } : null;

      // Clean tag bar HTML from change texts before saving
      const cleanChanges = Object.values(changes).map(c => ({
        ...c,
        text: c.text.replace(/<div class="gds-tag-select"[\s\S]*?<\/div>/g, '')
      }));

      // Save content
      const saveRes = await Auth.apiFetch('/api/pages/' + currentSlug + '/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changes: cleanChanges,
          seo
        })
      });

      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Erreur sauvegarde (' + saveRes.status + ')');
      }
      showToast('Sauvegarde OK, publication en cours...', 'success');

      btn.textContent = 'Publication...';

      // Publish / rebuild
      const publishRes = await Auth.apiFetch('/api/pages/' + currentSlug + '/publish', { method: 'POST' });
      if (!publishRes.ok) {
        const errData = await publishRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Erreur publication (' + publishRes.status + ')');
      }

      showToast('Modifications publiees !', 'success');

      // Reset state
      changes = {};
      seoData._modified = false;
      imageChanges = 0;
      document.querySelectorAll('.gds-modified').forEach(el => el.classList.remove('gds-modified'));
      updateChangesCount();

      // Update original texts to new values
      document.querySelectorAll('[data-gds-edit]').forEach(el => {
        originalTexts[el.getAttribute('data-gds-edit')] = el.innerHTML;
      });

      // Notify parent frame
      notifyParent('published', { slug: currentSlug });

    } catch (err) {
      showToast('Erreur: ' + err.message, 'error');
    }

    btn.textContent = 'Publier';
    btn.disabled = Object.keys(changes).length === 0;
  }

  // ===== LOGOUT =====
  async function logout() {
    await Auth.logout();
  }

  // ===== TOAST =====
  function showToast(msg, type) {
    const toast = document.getElementById('gds-admin-toast');
    toast.textContent = msg;
    toast.className = 'show ' + (type || '');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.className = ''; }, 3000);
  }

  // ===== MUR GALLERY MANAGER =====
  function initMurGallery() {
    const murSection = document.querySelector('.gds-mur');
    if (!murSection) return;

    // Add "Gerer les photos" button
    const murBtn = document.createElement('div');
    murBtn.className = 'gds-mur-manage-btn';
    murBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg> Gerer les photos du mur`;
    murSection.style.position = 'relative';
    murSection.appendChild(murBtn);

    murBtn.addEventListener('click', openMurPanel);
  }

  async function openMurPanel() {
    // Remove existing panel
    const old = document.getElementById('gds-mur-panel');
    if (old) old.remove();

    const panel = document.createElement('div');
    panel.id = 'gds-mur-panel';
    panel.innerHTML = `
      <div class="gds-mur-panel-inner">
        <div class="gds-mur-panel-header">
          <h3>Photos du mur</h3>
          <button class="gds-mur-close">&times;</button>
        </div>
        <div class="gds-mur-panel-body" id="gdsMurBody">
          <div class="gds-mur-loading">Chargement...</div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('.gds-mur-close').addEventListener('click', () => panel.remove());
    panel.addEventListener('click', (e) => { if (e.target === panel) panel.remove(); });

    // Load photos
    try {
      const res = await Auth.apiFetch('/api/pages/' + currentSlug + '/mur-photos');
      const photos = await res.json();
      renderMurPhotos(photos);
    } catch (err) {
      document.getElementById('gdsMurBody').innerHTML = '<div class="gds-mur-loading">Erreur de chargement</div>';
    }
  }

  function renderMurPhotos(photos) {
    const body = document.getElementById('gdsMurBody');
    const cats = [
      { key: 'portrait', label: 'Portrait', color: '#58a6ff' },
      { key: 'paysage', label: 'Paysage', color: '#3fb950' },
      { key: 'slim', label: 'Strip', color: '#bc8cff' }
    ];

    let html = '';
    cats.forEach(cat => {
      const items = photos[cat.key] || [];
      html += `
        <div class="gds-mur-cat">
          <div class="gds-mur-cat-header">
            <span class="gds-mur-cat-label" style="background:${cat.color}">${cat.label}</span>
            <span class="gds-mur-cat-count">${items.length} photos</span>
            <label class="gds-mur-add-btn" style="border-color:${cat.color};color:${cat.color}">
              + Ajouter
              <input type="file" accept="image/*" multiple data-cat="${cat.key}" style="display:none">
            </label>
          </div>
          <div class="gds-mur-cat-grid">
            ${items.map(src => `
              <div class="gds-mur-thumb">
                <img src="${src}" alt="">
                <button class="gds-mur-del" data-src="${src}" title="Supprimer">&times;</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });
    body.innerHTML = html;

    // Add upload handlers
    body.querySelectorAll('input[type="file"]').forEach(input => {
      input.addEventListener('change', async () => {
        const cat = input.dataset.cat;
        const files = Array.from(input.files);
        if (!files.length) return;

        for (const file of files) {
          const label = input.closest('.gds-mur-add-btn');
          label.textContent = 'Upload...';
          label.style.opacity = '0.6';

          try {
            const formData = new FormData();
            formData.append('image', file);
            formData.append('category', cat);
            const res = await Auth.apiFetch('/api/pages/' + currentSlug + '/mur-photos', {
              method: 'POST',
              body: formData
            });
            if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || 'Erreur');
          } catch (err) {
            showToast('Erreur: ' + err.message, 'error');
          }
        }

        showToast(files.length + ' photo(s) ajoutee(s) — rechargement...', 'success');
        setTimeout(() => window.location.reload(), 1500);
      });
    });

    // Add delete handlers
    body.querySelectorAll('.gds-mur-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const src = btn.dataset.src;
        if (!confirm('Supprimer cette photo du mur ?')) return;
        btn.textContent = '...';
        try {
          const res = await Auth.apiFetch('/api/pages/' + currentSlug + '/mur-photos', {
            method: 'DELETE',
            body: JSON.stringify({ src })
          });
          if (!res.ok) throw new Error('Erreur suppression');
          imageChanges++;
          updateChangesCount();
          showToast('Photo supprimee', 'success');
          const res2 = await Auth.apiFetch('/api/pages/' + currentSlug + '/mur-photos');
          renderMurPhotos(await res2.json());
        } catch (err) {
          showToast('Erreur: ' + err.message, 'error');
        }
      });
    });
  }

  // ===== SAVE WITHOUT PUBLISH =====
  async function saveOnly() {
    const changeCount = Object.keys(changes).length;
    const hasSeoChanges = seoData._modified;
    if (changeCount === 0 && !hasSeoChanges) return;

    // Collect SEO changes
    const seo = hasSeoChanges ? {
      title: document.getElementById('gdsSeoTitle')?.value,
      description: document.getElementById('gdsSeoDesc')?.value,
      ogTitle: document.getElementById('gdsSeoOgTitle')?.value,
      ogDescription: document.getElementById('gdsSeoOgDesc')?.value
    } : null;

    // Clean tag bar HTML from change texts
    const cleanChanges = Object.values(changes).map(c => ({
      ...c,
      text: c.text.replace(/<div class="gds-tag-select"[\s\S]*?<\/div>/g, '')
    }));

    try {
      const res = await Auth.apiFetch('/api/pages/' + currentSlug + '/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: cleanChanges, seo })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erreur sauvegarde');
      }

      // Reset state
      changes = {};
      seoData._modified = false;
      imageChanges = 0;
      document.querySelectorAll('.gds-modified').forEach(el => el.classList.remove('gds-modified'));
      updateChangesCount();

      // Update original texts to new values
      document.querySelectorAll('[data-gds-edit]').forEach(el => {
        originalTexts[el.getAttribute('data-gds-edit')] = el.innerHTML;
      });

      showToast('Sauvegarde OK', 'success');
      notifyParent('saved', { slug: currentSlug });
    } catch (err) {
      showToast('Erreur: ' + err.message, 'error');
    }
  }

  // ===== AUTO-SAVE =====
  let autoSaveTimer = null;
  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      const count = Object.keys(changes).length + (seoData._modified ? 1 : 0);
      if (count > 0) {
        console.log('[GDS Admin] Auto-saving', count, 'change(s)...');
        await saveOnly();
      }
    }, 30000); // 30 seconds
  }

  // Hook auto-save into change tracking
  const _origTrackChange = trackChange;
  // We can't override trackChange directly since it's already defined,
  // so we schedule auto-save from updateChangesCount instead

  // Override updateChangesCount to also schedule auto-save
  const _origUpdateChangesCount = updateChangesCount;
  updateChangesCount = function() {
    _origUpdateChangesCount();
    const count = Object.keys(changes).length + (seoData._modified ? 1 : 0) + imageChanges;
    if (count > 0) {
      scheduleAutoSave();
    }
  };

  // ===== PARENT FRAME COMMUNICATION =====
  function notifyParent(type, data) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: 'gds-editor', type, ...data }, '*');
      }
    } catch (e) { /* cross-origin, ignore */ }
  }

  // Listen for messages from parent frame
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.source !== 'gds-parent') return;
    const msg = e.data;

    switch (msg.type) {
      case 'setSiteName':
        siteName = msg.name || 'Site';
        const logoEl = document.querySelector('.gds-ab-logo');
        if (logoEl) logoEl.textContent = siteName;
        break;
      case 'setSlug':
        if (msg.slug && msg.slug !== currentSlug) {
          currentSlug = msg.slug;
          loadSEO();
        }
        break;
      case 'getChangesCount':
        notifyParent('changesCount', {
          count: Object.keys(changes).length + (seoData._modified ? 1 : 0) + imageChanges
        });
        break;
      case 'save':
        // Parent frame asks us to save (without publishing)
        saveOnly();
        break;
      case 'publish':
        // Parent frame asks us to save AND publish
        if (Object.keys(changes).length > 0 || seoData._modified) {
          publish();
        }
        break;
    }
  });

  // ===== UTILITIES =====
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== CLEAN SECTION HTML (remove admin UI before saving) =====
  function cleanSectionHtml(wrapper) {
    const clone = wrapper.cloneNode(true);
    // Remove admin UI elements
    clone.querySelectorAll('.gds-tag-select, .gds-section-actions, .gds-block-inserter, .gds-ph-overlay, .gds-img-toolbar, #gds-admin-bar').forEach(el => el.remove());
    // Remove admin attributes
    clone.querySelectorAll('[data-gds-edit]').forEach(el => {
      el.removeAttribute('data-gds-edit');
      el.removeAttribute('data-gds-section');
      el.removeAttribute('data-gds-tag');
      el.removeAttribute('data-gds-orig-tag');
      el.removeAttribute('tabindex');
      el.removeAttribute('contenteditable');
      // Only remove position:relative if it was added by editor (not in original style)
      if (el.style.position === 'relative' && !el.className) {
        el.style.removeProperty('position');
      }
    });
    // Remove contenteditable from any element
    clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
    // Remove gds-modified class
    clone.querySelectorAll('.gds-modified').forEach(el => el.classList.remove('gds-modified'));
    clone.querySelectorAll('.gds-img-hover').forEach(el => el.classList.remove('gds-img-hover'));
    return clone.innerHTML;
  }

  // ===== BLOCK INSERTER =====
  function initBlockInserters() {
    console.log('[GDS Admin] initBlockInserters START');

    // Find section wrappers injected by the preview route
    const wrappers = document.querySelectorAll('.gds-section-wrapper');
    const main = document.querySelector('main.snb-page-content');

    console.log('[GDS Admin] main:', !!main, 'wrappers:', wrappers.length);

    if (!main) {
      console.warn('[GDS Admin] No main.snb-page-content found — checking DOM...');
      console.log('[GDS Admin] All main tags:', document.querySelectorAll('main').length);
      console.log('[GDS Admin] Body children:', document.body.children.length);
      return;
    }

    console.log('[GDS Admin] Found', wrappers.length, 'section wrappers');

    function createInserter(index) {
      const inserter = document.createElement('div');
      inserter.className = 'gds-block-inserter';
      inserter.innerHTML = '<button class="gds-block-inserter-btn" title="Ajouter un bloc">+</button>';
      inserter.querySelector('.gds-block-inserter-btn').addEventListener('click', () => {
        openBlockModal(index);
      });
      return inserter;
    }

    if (wrappers.length === 0) {
      // Empty page — single inserter
      main.appendChild(createInserter(0));
      console.log('[GDS Admin] Empty page — added 1 inserter');
      return;
    }

    // Before first wrapper
    wrappers[0].parentNode.insertBefore(createInserter(0), wrappers[0]);

    // After each wrapper
    wrappers.forEach((wrapper, idx) => {
      const inserter = createInserter(idx + 1);
      wrapper.parentNode.insertBefore(inserter, wrapper.nextSibling);
    });

    // Add action buttons (code + delete) to each section wrapper
    wrappers.forEach((wrapper) => {
      const file = wrapper.getAttribute('data-gds-file');
      if (!file) return;

      const actions = document.createElement('div');
      actions.className = 'gds-section-actions';
      actions.innerHTML = `
        <button class="gds-section-save-btn" title="Sauvegarder dans la bibliotheque" data-file="${file}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </button>
        <button class="gds-section-code-btn" title="Modifier le code HTML" data-file="${file}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </button>
        <button class="gds-section-delete-btn" title="Supprimer ce bloc" data-file="${file}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      `;
      wrapper.appendChild(actions);

      actions.querySelector('.gds-section-save-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openSaveToLibraryModal(file, wrapper);
      });

      actions.querySelector('.gds-section-code-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openCodeModal(file, wrapper);
      });

      actions.querySelector('.gds-section-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openDeleteModal(file, wrapper);
      });
    });

    console.log('[GDS Admin] Inserted', wrappers.length + 1, 'block inserters');
  }

  let currentInsertIndex = 0;

  function openBlockModal(insertIndex) {
    currentInsertIndex = insertIndex;
    // Remove existing modal
    const existing = document.getElementById('gds-block-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'gds-block-modal';
    overlay.className = 'gds-modal-overlay';
    overlay.innerHTML = `
      <div class="gds-modal">
        <div class="gds-modal-header">
          <h3>Ajouter un bloc</h3>
          <button class="gds-modal-close" id="gds-modal-close-btn">&times;</button>
        </div>
        <div class="gds-modal-body">
          <div class="gds-block-types">
            <div class="gds-block-type" data-type="library">
              <div class="gds-block-type-icon">&#128218;</div>
              <div class="gds-block-type-label">Bibliotheque</div>
            </div>
            <div class="gds-block-type" data-type="html">
              <div class="gds-block-type-icon">&lt;/&gt;</div>
              <div class="gds-block-type-label">Code HTML</div>
            </div>
            <div class="gds-block-type" data-type="image">
              <div class="gds-block-type-icon">&#128247;</div>
              <div class="gds-block-type-label">Image</div>
            </div>
            <div class="gds-block-type" data-type="plugin">
              <div class="gds-block-type-icon">&#9881;</div>
              <div class="gds-block-type-label">Plugin</div>
            </div>
          </div>
          <div class="gds-block-library" id="gds-block-library-area">
            <div style="color:#8b949e;text-align:center;padding:20px;">Chargement...</div>
          </div>
          <div class="gds-block-code" id="gds-block-code-area">
            <textarea id="gds-block-html-input" placeholder="Collez votre code HTML ici..."></textarea>
          </div>
          <div class="gds-block-upload" id="gds-block-upload-area">
            <input type="file" id="gds-block-file-input" accept="image/*">
            <div style="font-size:36px;margin-bottom:8px">&#128247;</div>
            <div>Cliquez ou glissez une image</div>
          </div>
          <div class="gds-block-plugins" id="gds-block-plugins-area">
            <div class="gds-plugin-card" data-plugin="google-reviews">
              <div class="gds-plugin-card-name">Avis Google</div>
              <div class="gds-plugin-card-desc">Afficher les avis Google My Business</div>
            </div>
            <div class="gds-plugin-card" data-plugin="contact-form">
              <div class="gds-plugin-card-name">Formulaire de contact</div>
              <div class="gds-plugin-card-desc">Formulaire email simple</div>
            </div>
            <div class="gds-plugin-card" data-plugin="map">
              <div class="gds-plugin-card-name">Carte Google Maps</div>
              <div class="gds-plugin-card-desc">Carte interactive avec votre adresse</div>
            </div>
            <div class="gds-plugin-card" data-plugin="cta">
              <div class="gds-plugin-card-name">Bloc CTA</div>
              <div class="gds-plugin-card-desc">Appel a l'action avec bouton</div>
            </div>
          </div>
        </div>
        <div class="gds-modal-footer">
          <button class="gds-modal-btn gds-modal-btn-cancel" id="gds-modal-cancel-btn">Annuler</button>
          <button class="gds-modal-btn gds-modal-btn-submit" id="gds-block-submit" disabled>Inserer le bloc</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Close buttons
    const closeModal = () => overlay.remove();
    document.getElementById('gds-modal-close-btn').addEventListener('click', closeModal);
    document.getElementById('gds-modal-cancel-btn').addEventListener('click', closeModal);

    // Upload area click
    document.getElementById('gds-block-upload-area').addEventListener('click', () => {
      document.getElementById('gds-block-file-input').click();
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Block type selection
    let selectedType = null;
    overlay.querySelectorAll('.gds-block-type').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.gds-block-type').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedType = btn.dataset.type;

        document.getElementById('gds-block-code-area').classList.toggle('visible', selectedType === 'html');
        document.getElementById('gds-block-upload-area').classList.toggle('visible', selectedType === 'image');
        document.getElementById('gds-block-plugins-area').classList.toggle('visible', selectedType === 'plugin');
        document.getElementById('gds-block-library-area').classList.toggle('visible', selectedType === 'library');
        document.getElementById('gds-block-submit').disabled = selectedType === 'plugin' || selectedType === 'library';
        if (selectedType === 'html') document.getElementById('gds-block-submit').disabled = false;
        if (selectedType === 'image') document.getElementById('gds-block-submit').disabled = false;
        if (selectedType === 'library') loadBlockLibrary(overlay);
      });
    });

    // HTML input change
    const htmlInput = document.getElementById('gds-block-html-input');
    htmlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = htmlInput.selectionStart;
        htmlInput.value = htmlInput.value.substring(0, s) + '  ' + htmlInput.value.substring(htmlInput.selectionEnd);
        htmlInput.selectionStart = htmlInput.selectionEnd = s + 2;
      }
    });

    // Image file selection
    document.getElementById('gds-block-file-input').addEventListener('change', (e) => {
      if (e.target.files[0]) {
        const fileName = e.target.files[0].name;
        document.getElementById('gds-block-upload-area').innerHTML =
          '<div style="color:#3fb950;font-size:14px">&#10003; ' + fileName + '</div>';
        document.getElementById('gds-block-submit').disabled = false;
      }
    });

    // Plugin selection
    overlay.querySelectorAll('.gds-plugin-card').forEach(card => {
      card.addEventListener('click', () => {
        overlay.querySelectorAll('.gds-plugin-card').forEach(c => c.style.borderColor = '#30363d');
        card.style.borderColor = '#E51981';
        card.dataset.selected = 'true';
        document.getElementById('gds-block-submit').disabled = false;
      });
    });

    // Submit
    document.getElementById('gds-block-submit').addEventListener('click', () => {
      submitBlock(selectedType, overlay);
    });
  }

  async function submitBlock(type, modal) {
    let htmlContent = '';

    if (type === 'library') {
      if (!selectedLibraryBlock) { showToast('Selectionnez un bloc', 'error'); return; }
      // Fetch block content from API
      try {
        const res = await Auth.apiFetch('/api/blocks/' + selectedLibraryBlock);
        if (!res.ok) throw new Error('Erreur chargement bloc');
        const blockData = await res.json();
        htmlContent = blockData.html || '';
        if (!htmlContent) { showToast('Bloc vide', 'error'); return; }
      } catch (err) {
        showToast('Erreur: ' + err.message, 'error');
        return;
      }
    } else if (type === 'html') {
      htmlContent = document.getElementById('gds-block-html-input').value;
      if (!htmlContent.trim()) {
        showToast('Le code HTML est vide', 'error');
        return;
      }
    } else if (type === 'image') {
      const file = document.getElementById('gds-block-file-input').files[0];
      if (!file) { showToast('Aucune image selectionnee', 'error'); return; }

      // Upload image first
      const formData = new FormData();
      formData.append('image', file);
      formData.append('slug', currentSlug);
      try {
        const uploadRes = await Auth.apiFetch('/api/media/upload', { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Upload echoue');
        const uploadData = await uploadRes.json();
        const imgUrl = uploadData.url || uploadData.path || '/images/' + file.name;
        htmlContent = `<section style="padding:60px 20px;text-align:center;">
  <img src="${imgUrl}" alt="${file.name.replace(/\.[^.]+$/, '')}" style="max-width:100%;height:auto;border-radius:12px;" data-gds-img="custom:0:${imgUrl}">
</section>`;
      } catch (err) {
        // Fallback: use placeholder
        htmlContent = `<section style="padding:60px 20px;text-align:center;">
  <img src="" alt="Image" style="max-width:100%;height:auto;border-radius:12px;" data-gds-img="custom:0:">
  <p style="color:#999;margin-top:12px;">Image a remplacer via l'editeur</p>
</section>`;
      }
    } else if (type === 'plugin') {
      const selected = modal.querySelector('.gds-plugin-card[data-selected="true"]');
      if (!selected) { showToast('Selectionnez un plugin', 'error'); return; }
      htmlContent = getPluginHtml(selected.dataset.plugin);
    }

    if (!htmlContent) return;

    // Save the block via API
    const submitBtn = document.getElementById('gds-block-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Insertion...';

    try {
      const res = await Auth.apiFetch('/api/pages/' + currentSlug + '/add-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: htmlContent, position: currentInsertIndex })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur');
      }
      modal.remove();
      showToast('Bloc ajoute !', 'success');
      // Reload page to show the new block
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      showToast('Erreur: ' + err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Inserer le bloc';
    }
  }

  // ===== BLOCK LIBRARY =====
  let selectedLibraryBlock = null;

  async function loadBlockLibrary(modal) {
    const area = document.getElementById('gds-block-library-area');
    area.innerHTML = '<div style="color:#8b949e;text-align:center;padding:20px;">Chargement...</div>';

    try {
      const res = await Auth.apiFetch('/api/blocks');
      if (!res.ok) throw new Error('Erreur chargement');
      const data = await res.json();
      const blocks = data.blocks || [];

      if (blocks.length === 0) {
        area.innerHTML = '<div style="color:#8b949e;text-align:center;padding:30px;font-size:14px;">Aucun bloc sauvegarde.<br><span style="font-size:12px;margin-top:8px;display:block;">Utilisez le bouton &#128218; sur une section existante pour la sauvegarder.</span></div>';
        return;
      }

      // Group by category
      const cats = {};
      blocks.forEach(b => {
        const cat = b.category || 'custom';
        if (!cats[cat]) cats[cat] = [];
        cats[cat].push(b);
      });

      const catLabels = { section: 'Sections de page', custom: 'Blocs personnalises', plugin: 'Plugins' };

      let html = '';
      for (const [cat, items] of Object.entries(cats)) {
        html += '<div style="margin-bottom:16px;">';
        html += '<div style="font-size:11px;font-weight:700;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">' + (catLabels[cat] || cat) + '</div>';
        html += '<div class="gds-library-grid">';
        items.forEach(b => {
          html += '<div class="gds-library-card" data-block-id="' + b.id + '">';
          html += '<div class="gds-library-card-name">' + escapeHtml(b.name) + '</div>';
          if (b.description) html += '<div class="gds-library-card-desc">' + escapeHtml(b.description) + '</div>';
          html += '<div class="gds-library-card-size">' + (b.size / 1024).toFixed(1) + ' KB</div>';
          html += '</div>';
        });
        html += '</div></div>';
      }
      area.innerHTML = html;

      // Click handlers
      area.querySelectorAll('.gds-library-card').forEach(card => {
        card.addEventListener('click', () => {
          area.querySelectorAll('.gds-library-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          selectedLibraryBlock = card.dataset.blockId;
          document.getElementById('gds-block-submit').disabled = false;
        });
      });
    } catch (err) {
      area.innerHTML = '<div style="color:#f85149;text-align:center;padding:20px;">Erreur: ' + err.message + '</div>';
    }
  }

  function openSaveToLibraryModal(file, wrapper) {
    const existing = document.getElementById('gds-savelibrary-modal');
    if (existing) existing.remove();

    const firstHeading = wrapper.querySelector('h1, h2, h3, h4');
    const defaultName = firstHeading ? firstHeading.textContent.trim().substring(0, 50) : file.replace(/^\d+-/, '').replace('.html', '');

    const overlay = document.createElement('div');
    overlay.id = 'gds-savelibrary-modal';
    overlay.className = 'gds-modal-overlay';
    overlay.innerHTML = `
      <div class="gds-modal" style="max-width:440px;">
        <div class="gds-modal-header">
          <h3>Sauvegarder dans la bibliotheque</h3>
          <button class="gds-modal-close" id="gds-sl-close">&times;</button>
        </div>
        <div class="gds-modal-body">
          <div style="margin-bottom:14px;">
            <label style="font-size:12px;font-weight:700;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">Nom du bloc</label>
            <input type="text" id="gds-sl-name" value="${escapeHtml(defaultName)}" style="width:100%;padding:8px 12px;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:14px;">
          </div>
          <div style="margin-bottom:14px;">
            <label style="font-size:12px;font-weight:700;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">Description (optionnel)</label>
            <input type="text" id="gds-sl-desc" placeholder="Courte description du bloc" style="width:100%;padding:8px 12px;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:14px;">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">Categorie</label>
            <select id="gds-sl-cat" style="width:100%;padding:8px 12px;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:14px;">
              <option value="section">Section de page</option>
              <option value="custom">Bloc personnalise</option>
              <option value="plugin">Plugin</option>
            </select>
          </div>
        </div>
        <div class="gds-modal-footer">
          <button class="gds-modal-btn gds-modal-btn-cancel" id="gds-sl-cancel">Annuler</button>
          <button class="gds-modal-btn gds-modal-btn-submit" id="gds-sl-save">Sauvegarder</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('gds-sl-close').addEventListener('click', close);
    document.getElementById('gds-sl-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.getElementById('gds-sl-name').focus();

    document.getElementById('gds-sl-save').addEventListener('click', async () => {
      const name = document.getElementById('gds-sl-name').value.trim();
      if (!name) { showToast('Nom requis', 'error'); return; }

      const btn = document.getElementById('gds-sl-save');
      btn.disabled = true;
      btn.textContent = 'Sauvegarde...';

      try {
        const res = await Auth.apiFetch('/api/blocks/from-section', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: currentSlug,
            file: file,
            name: name,
            description: document.getElementById('gds-sl-desc').value.trim(),
            category: document.getElementById('gds-sl-cat').value
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Erreur');
        }

        close();
        showToast('Bloc sauvegarde dans la bibliotheque !', 'success');
      } catch (err) {
        showToast('Erreur: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Sauvegarder';
      }
    });
  }

  // ===== CODE EDITOR MODAL =====
  async function openCodeModal(file, wrapper) {
    const existing = document.getElementById('gds-code-modal');
    if (existing) existing.remove();

    // Load current HTML from server
    let htmlContent = '';
    try {
      const res = await Auth.apiFetch('/api/pages/' + currentSlug + '/section/' + encodeURIComponent(file));
      if (!res.ok) throw new Error('Erreur chargement');
      const data = await res.json();
      htmlContent = data.content || '';
    } catch (err) {
      showToast('Erreur: ' + err.message, 'error');
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'gds-code-modal';
    overlay.className = 'gds-modal-overlay';
    overlay.innerHTML = `
      <div class="gds-modal" style="max-width:900px;height:85vh;display:flex;flex-direction:column;">
        <div class="gds-modal-header">
          <h3 style="display:flex;align-items:center;gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            Code HTML — ${escapeHtml(file)}
          </h3>
          <button class="gds-modal-close" id="gds-code-close">&times;</button>
        </div>
        <div class="gds-modal-body" style="flex:1;overflow:hidden;padding:0;display:flex;flex-direction:column;">
          <textarea id="gds-code-editor" style="
            flex:1;width:100%;border:none;background:#0d1117;color:#c9d1d9;
            font-family:'Courier New',monospace;font-size:13px;line-height:1.6;
            padding:16px;resize:none;tab-size:2;outline:none;
          ">${escapeHtml(htmlContent)}</textarea>
        </div>
        <div class="gds-modal-footer">
          <span id="gds-code-status" style="color:#8b949e;font-size:12px;margin-right:auto;"></span>
          <button class="gds-modal-btn gds-modal-btn-cancel" id="gds-code-cancel">Annuler</button>
          <button class="gds-modal-btn gds-modal-btn-submit" id="gds-code-save">Sauvegarder</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const editor = document.getElementById('gds-code-editor');
    const status = document.getElementById('gds-code-status');

    // Tab support in textarea
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = editor.selectionStart;
        editor.value = editor.value.substring(0, s) + '  ' + editor.value.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = s + 2;
      }
    });

    // Show line count
    function updateStatus() {
      const lines = editor.value.split('\n').length;
      const size = new Blob([editor.value]).size;
      status.textContent = lines + ' lignes | ' + (size / 1024).toFixed(1) + ' KB';
    }
    editor.addEventListener('input', updateStatus);
    updateStatus();

    // Close
    const close = () => overlay.remove();
    document.getElementById('gds-code-close').addEventListener('click', close);
    document.getElementById('gds-code-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Save
    document.getElementById('gds-code-save').addEventListener('click', async () => {
      const saveBtn = document.getElementById('gds-code-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Sauvegarde...';

      try {
        const res = await Auth.apiFetch('/api/pages/' + currentSlug + '/section/' + encodeURIComponent(file), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editor.value })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Erreur');
        }

        close();
        showToast('Code sauvegarde !', 'success');
        setTimeout(() => window.location.reload(), 500);
      } catch (err) {
        showToast('Erreur: ' + err.message, 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Sauvegarder';
      }
    });

    // Ctrl+S shortcut inside the modal
    editor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        document.getElementById('gds-code-save').click();
      }
    });

    // Focus editor
    editor.focus();
  }

  function openDeleteModal(file, wrapper) {
    // Remove existing modal
    const existing = document.getElementById('gds-delete-modal');
    if (existing) existing.remove();

    // Get a preview of the section content
    const firstHeading = wrapper.querySelector('h1, h2, h3, h4');
    const sectionLabel = firstHeading ? firstHeading.textContent.trim().substring(0, 60) : file;

    const overlay = document.createElement('div');
    overlay.id = 'gds-delete-modal';
    overlay.className = 'gds-modal-overlay';
    overlay.innerHTML = `
      <div class="gds-modal" style="max-width:440px;">
        <div class="gds-modal-header">
          <h3>Supprimer le bloc</h3>
          <button class="gds-modal-close" id="gds-delete-close">&times;</button>
        </div>
        <div class="gds-modal-body" style="text-align:center;padding:24px 20px;">
          <div style="width:48px;height:48px;margin:0 auto 16px;background:rgba(248,81,73,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f85149" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </div>
          <p style="color:#e6edf3;font-size:15px;margin:0 0 8px;font-weight:600;">Etes-vous sur de vouloir supprimer ce bloc ?</p>
          <p style="color:#8b949e;font-size:13px;margin:0 0 4px;">${escapeHtml(sectionLabel)}</p>
          <p style="color:#f85149;font-size:12px;margin:0;"><strong>Cette action est irreversible.</strong></p>
        </div>
        <div class="gds-modal-footer" style="justify-content:center;gap:12px;">
          <button class="gds-modal-btn gds-modal-btn-cancel" id="gds-delete-cancel">Annuler</button>
          <button class="gds-modal-btn" id="gds-delete-confirm" style="background:#da3633;border-color:#f8514933;color:#fff;">Supprimer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Close handlers
    const close = () => overlay.remove();
    document.getElementById('gds-delete-close').addEventListener('click', close);
    document.getElementById('gds-delete-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Confirm delete
    document.getElementById('gds-delete-confirm').addEventListener('click', async () => {
      const confirmBtn = document.getElementById('gds-delete-confirm');
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Suppression...';

      try {
        const res = await Auth.apiFetch('/api/pages/' + currentSlug + '/delete-section', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: file })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Erreur');
        }

        close();
        showToast('Bloc supprime !', 'success');
        // Reload page to reflect changes
        setTimeout(() => window.location.reload(), 500);
      } catch (err) {
        showToast('Erreur: ' + err.message, 'error');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Supprimer';
      }
    });
  }

  function getPluginHtml(pluginId) {
    const plugins = {
      'google-reviews': `<section style="padding:60px 20px;background:#f8f9fa;">
  <div style="max-width:1300px;margin:0 auto;text-align:center;">
    <h2 style="font-size:36px;font-weight:900;font-style:italic;margin-bottom:8px;" data-gds-edit="plugin-avis:0:h2" data-gds-section="plugin-avis" data-gds-tag="H2">Ce que disent nos clients</h2>
    <p style="color:#666;margin-bottom:30px;" data-gds-edit="plugin-avis:0:p" data-gds-section="plugin-avis" data-gds-tag="P">4.8/5 sur Google - Plus de 1000 avis</p>
    <div style="background:#fff;border-radius:12px;padding:30px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <p style="color:#999;">Les avis Google seront charges ici automatiquement.</p>
    </div>
  </div>
</section>`,
      'contact-form': `<section style="padding:60px 20px;background:#fff;">
  <div style="max-width:600px;margin:0 auto;">
    <h2 style="font-size:36px;font-weight:900;font-style:italic;text-align:center;margin-bottom:30px;" data-gds-edit="plugin-contact:0:h2" data-gds-section="plugin-contact" data-gds-tag="H2">Contactez-nous</h2>
    <form style="display:flex;flex-direction:column;gap:16px;">
      <input type="text" placeholder="Votre nom" style="padding:14px 18px;border:1px solid #ddd;border-radius:8px;font-size:15px;">
      <input type="email" placeholder="Votre email" style="padding:14px 18px;border:1px solid #ddd;border-radius:8px;font-size:15px;">
      <textarea placeholder="Votre message" rows="5" style="padding:14px 18px;border:1px solid #ddd;border-radius:8px;font-size:15px;resize:vertical;"></textarea>
      <button type="submit" style="padding:14px;background:linear-gradient(135deg,#E51981,#ff3fac);color:#fff;border:none;border-radius:25px;font-size:16px;font-weight:700;cursor:pointer;">Envoyer</button>
    </form>
  </div>
</section>`,
      'map': `<section style="padding:0;">
  <div style="width:100%;height:400px;background:#e0e0e0;display:flex;align-items:center;justify-content:center;">
    <p style="color:#999;" data-gds-edit="plugin-map:0:p" data-gds-section="plugin-map" data-gds-tag="P">Carte Google Maps — Integrez votre iframe ici</p>
  </div>
</section>`,
      'cta': `<section style="padding:80px 20px;background:linear-gradient(135deg,#2d0535,#1a0a22);text-align:center;">
  <h2 style="font-size:42px;font-weight:900;font-style:italic;color:#fff;margin-bottom:12px;" data-gds-edit="plugin-cta:0:h2" data-gds-section="plugin-cta" data-gds-tag="H2">Pret a vous lancer ?</h2>
  <p style="font-size:18px;color:rgba(255,255,255,0.7);margin-bottom:30px;" data-gds-edit="plugin-cta:0:p" data-gds-section="plugin-cta" data-gds-tag="P">Recevez votre devis personnalise en quelques minutes.</p>
  <a href="/reservation/" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#E51981,#ff3fac);color:#fff;border-radius:30px;font-weight:700;font-size:18px;text-decoration:none;">Obtenir un devis gratuit</a>
</section>`
    };
    return plugins[pluginId] || '<section><p>Plugin non disponible</p></section>';
  }

  // ===== WARN BEFORE LEAVING =====
  window.addEventListener('beforeunload', (e) => {
    if (Object.keys(changes).length > 0 || seoData._modified) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ===== EMBEDDED MODE: direct init without admin bar =====
  function initEmbedded() {
    document.body.classList.add('gds-admin-mode');
    try { autoTagEditableElements(); } catch (e) { console.error('[GDS] autoTagEditableElements error:', e); }
    try { initEditableElements(); } catch (e) { console.error('[GDS] initEditableElements error:', e); }
    try { initEditableImages(); } catch (e) { console.error('[GDS] initEditableImages error:', e); }
    try { initPlaceholderImages(); } catch (e) { console.error('[GDS] initPlaceholderImages error:', e); }
    try { initBlockInserters(); } catch (e) { console.error('[GDS] initBlockInserters error:', e); }
    try { initMurGallery(); } catch (e) { console.error('[GDS] initMurGallery error:', e); }
    console.log('[GDS Admin] Embedded mode — slug:', currentSlug);
  }

  // ===== INIT =====
  function startup() {
    if (isEmbedded) {
      initEmbedded();
    } else {
      buildAdminBar();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startup);
  } else {
    startup();
  }
})();
