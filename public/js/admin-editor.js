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
      // Init editable elements
      initEditableElements();
      // Init editable images
      initEditableImages();
      // Init mur gallery manager
      initMurGallery();
    } catch (err) {
      showToast('Erreur de chargement', 'error');
    }
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
        // Parent frame asks us to save
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
    initEditableElements();
    initEditableImages();
    initMurGallery();
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
