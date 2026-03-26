const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');

const PREVIEWS_DIR = path.join(__dirname, '..', 'previews');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const DATA_DIR = path.join(__dirname, '..', 'data');
const BLOG_INDEX = path.join(DATA_DIR, 'blog-index.json');

// ── Helpers ──────────────────────────────────────────────

function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(BLOG_INDEX, 'utf-8'));
  } catch { return { articles: [] }; }
}

function writeIndex(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(BLOG_INDEX, JSON.stringify(data, null, 2), 'utf-8');
}

const CATEGORIES = {
  mariage:      { class: 'cat-mariage',      emoji: '\ud83d\udc8d', label: 'Mariage',      link: '/blog/mariage/' },
  entreprise:   { class: 'cat-entreprise',    emoji: '\ud83c\udfe2', label: 'Entreprise',   link: '/blog/entreprise/' },
  anniversaire: { class: 'cat-anniversaire',  emoji: '\ud83c\udf82', label: 'Anniversaire', link: '/blog/anniversaire/' },
  conseils:     { class: 'cat-conseils',      emoji: '\ud83d\udca1', label: 'Conseils',     link: '/blog/conseils/' }
};

const AUTHORS = {
  mathilde: { name: 'Mathilde S\u00e9hault', initials: 'M', role: 'Experte \u00e9v\u00e9nementiel & animation de soir\u00e9e' },
  elise:    { name: '\u00c9lise Durant',      initials: '\u00c9', role: 'Sp\u00e9cialiste photobooth & exp\u00e9rience client' }
};

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatDateFR(dateStr) {
  const d = new Date(dateStr);
  const months = ['janvier','f\u00e9vrier','mars','avril','mai','juin','juillet','ao\u00fbt','septembre','octobre','novembre','d\u00e9cembre'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function estimateReadTime(blocks) {
  let words = 0;
  for (const b of blocks) {
    if (b.content) words += b.content.replace(/<[^>]+>/g, '').split(/\s+/).length;
    if (b.items) {
      for (const item of b.items) words += item.replace(/<[^>]+>/g, '').split(/\s+/).length;
    }
    if (b.rows) {
      for (const row of b.rows) {
        for (const cell of row) words += cell.replace(/<[^>]+>/g, '').split(/\s+/).length;
      }
    }
  }
  return Math.max(1, Math.round(words / 230));
}

// Build body HTML from structured blocks
function buildBodyHTML(blocks) {
  let html = '';
  for (const block of blocks) {
    switch (block.type) {
      case 'intro':
        html += `\n    <p class="snb-article-intro">${block.content}</p>\n`;
        break;
      case 'h2':
        html += `\n    <h2 id="${block.id || slugify(block.text)}">${block.text}</h2>\n`;
        break;
      case 'h3':
        html += `\n    <h3 id="${block.id || slugify(block.text)}">${block.text}</h3>\n`;
        break;
      case 'h4':
        html += `\n    <h4>${block.text}</h4>\n`;
        break;
      case 'paragraph':
        html += `\n    <p>${block.content}</p>\n`;
        break;
      case 'list':
        html += '\n    <ul>\n';
        for (const item of block.items) {
          html += `      <li>${item}</li>\n`;
        }
        html += '    </ul>\n';
        break;
      case 'ordered-list':
        html += '\n    <ol>\n';
        for (const item of block.items) {
          html += `      <li>${item}</li>\n`;
        }
        html += '    </ol>\n';
        break;
      case 'image':
        html += `\n    <div class="snb-img-wrap">\n      <img src="${block.src}" alt="${block.alt || ''}" loading="lazy" width="820" height="460">\n`;
        if (block.caption) html += `      <p class="snb-img-caption">${block.caption}</p>\n`;
        html += '    </div>\n';
        break;
      case 'conseil': {
        const variant = block.variant ? ' v-' + block.variant : '';
        const icon = block.icon || '\ud83d\udca1';
        const label = block.label || 'Le conseil Shootnbox';
        html += `\n    <div class="snb-conseil${variant}">\n      <div class="snb-conseil-icon">${icon}</div>\n      <div class="snb-conseil-body">\n        <span class="snb-conseil-label">${label}</span>\n        <p class="snb-conseil-text">${block.content}</p>\n      </div>\n    </div>\n`;
        break;
      }
      case 'highlight':
        html += `\n    <div class="snb-highlight">\n      <p>${block.content}</p>\n    </div>\n`;
        break;
      case 'table': {
        const tableClass = block.variant ? ' t-' + block.variant : '';
        html += `\n    <div class="snb-table-wrap${tableClass}">\n      <table>\n        <thead><tr>\n`;
        for (const h of block.headers) html += `          <th>${h}</th>\n`;
        html += '        </tr></thead>\n        <tbody>\n';
        for (const row of block.rows) {
          html += '          <tr>\n';
          for (const cell of row) html += `            <td>${cell}</td>\n`;
          html += '          </tr>\n';
        }
        html += '        </tbody>\n      </table>\n    </div>\n';
        break;
      }
      case 'cta-product': {
        html += `\n    <div class="snb-cta-card">\n`;
        if (block.badge) html += `      <div class="snb-cta-card-badge">${block.badge}</div>\n`;
        if (block.image) html += `      <div class="snb-cta-card-img"><img src="${block.image}" alt="${block.imageAlt || ''}" loading="lazy"></div>\n`;
        html += `      <div class="snb-cta-card-content">\n`;
        if (block.label) html += `        <span class="snb-cta-card-label">${block.label}</span>\n`;
        html += `        <div class="snb-cta-card-title">${block.title}</div>\n`;
        if (block.desc) html += `        <p class="snb-cta-card-desc">${block.desc}</p>\n`;
        html += `        <a href="${block.link || 'https://shootnbox.fr/reservation/'}" class="snb-cta-card-btn">\n          ${block.btnText || 'R\u00e9server'}\n          <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>\n        </a>\n`;
        html += `      </div>\n    </div>\n`;
        break;
      }
      case 'faq':
        html += `\n    <h4>${block.question}</h4>\n    <p>${block.answer}</p>\n`;
        break;
      default:
        break;
    }
  }
  return html;
}

// Build TOC from blocks
function buildTOC(blocks) {
  let html = '';
  for (const block of blocks) {
    if (block.type === 'h2') {
      const id = block.id || slugify(block.text);
      const text = block.text.replace(/<[^>]+>/g, '');
      html += `        <li><a href="#${id}">${text}</a></li>\n`;
    } else if (block.type === 'h3') {
      const id = block.id || slugify(block.text);
      const text = block.text.replace(/<[^>]+>/g, '');
      html += `        <li class="h3-item"><a href="#${id}">${text}</a></li>\n`;
    }
  }
  return html;
}

// Build tags HTML
function buildTagsHTML(tags) {
  return tags.map(t => {
    const tag = t.startsWith('#') ? t : '#' + t;
    return `<a href="#" class="snb-tag">${tag}</a>`;
  }).join('\n      ');
}

// Build related articles HTML (bottom grid)
function buildRelatedHTML(currentSlug, index) {
  const others = index.articles
    .filter(a => a.slug !== currentSlug && a.status !== 'draft')
    .slice(0, 3);
  if (!others.length) return '';
  return others.map(a => {
    const cat = CATEGORIES[a.category] || CATEGORIES.conseils;
    return `
    <a href="/blog/${a.slug}/" class="snb-related-card">
      <div class="snb-related-card-img">
        <img src="${a.heroImage || '/site-images/blog-default.webp'}" alt="${a.title}" loading="lazy">
      </div>
      <div class="snb-related-card-body">
        <div class="snb-related-card-cat">${cat.emoji} ${cat.label}</div>
        <div class="snb-related-card-title">${a.title}</div>
        <div class="snb-related-card-meta">
          <span>${a.authorName}</span>&middot;<span>${formatDateFR(a.date)}</span>
        </div>
      </div>
    </a>`;
  }).join('\n');
}

// Build sidebar related HTML
function buildSidebarRelatedHTML(currentSlug, index) {
  const others = index.articles
    .filter(a => a.slug !== currentSlug && a.status !== 'draft')
    .slice(0, 3);
  if (!others.length) return '';
  return others.map(a => `
        <li>
          <a href="/blog/${a.slug}/">
            <div class="sr-link-thumb">
              <img src="${a.heroImage || '/site-images/blog-default.webp'}" alt="" loading="lazy">
            </div>
            <span class="sr-link-title">${a.title}</span>
          </a>
        </li>`).join('\n');
}

// Generate full article HTML from template + data
function generateArticleHTML(article, index) {
  const tpl = fs.readFileSync(path.join(TEMPLATES_DIR, 'blog-article.html'), 'utf-8');
  const cat = CATEGORIES[article.category] || CATEGORIES.conseils;
  const author = AUTHORS[article.author] || AUTHORS.mathilde;
  const bodyHTML = buildBodyHTML(article.blocks || []);
  const tocHTML = buildTOC(article.blocks || []);
  const tagsHTML = buildTagsHTML(article.tags || []);
  const relatedHTML = buildRelatedHTML(article.slug, index);
  const sidebarRelatedHTML = buildSidebarRelatedHTML(article.slug, index);
  const readTime = article.readTime || estimateReadTime(article.blocks || []);

  const replacements = {
    '{{TITLE}}': article.title,
    '{{META_DESCRIPTION}}': article.metaDescription || '',
    '{{CATEGORY}}': cat.label,
    '{{CATEGORY_CLASS}}': cat.class,
    '{{CATEGORY_EMOJI}}': cat.emoji,
    '{{DATE}}': formatDateFR(article.date),
    '{{READ_TIME}}': String(readTime),
    '{{AUTHOR_NAME}}': author.name,
    '{{AUTHOR_INITIALS}}': author.initials,
    '{{AUTHOR_ROLE}}': author.role,
    '{{HERO_IMAGE}}': article.heroImage || '/site-images/blog-default.webp',
    '{{HERO_ALT}}': article.heroAlt || article.title,
    '{{TITLE_HTML}}': article.titleHTML || article.title,
    '{{BODY_CONTENT}}': bodyHTML,
    '{{TAGS_HTML}}': tagsHTML,
    '{{TOC_HTML}}': tocHTML,
    '{{BREADCRUMB_CAT_LINK}}': cat.link,
    '{{BREADCRUMB_CAT_NAME}}': cat.label,
    '{{BREADCRUMB_TITLE}}': article.title,
    '{{SIDEBAR_CTA_LABEL}}': article.sidebarCta?.label || 'Location photobooth',
    '{{SIDEBAR_CTA_TITLE}}': article.sidebarCta?.title || 'Animation <span>Mariage</span>',
    '{{SIDEBAR_CTA_PRICE}}': article.sidebarCta?.price || '299\u20ac',
    '{{SIDEBAR_CTA_PERIOD}}': article.sidebarCta?.period || 'par \u00e9v\u00e9nement \u2014 livraison incluse',
    '{{SIDEBAR_CTA_LINK}}': article.sidebarCta?.link || 'https://shootnbox.fr/reservation/',
    '{{CTA_FOOTER_BADGE}}': article.ctaFooter?.badge || '\ud83d\udcf8 Shootnbox',
    '{{CTA_FOOTER_TITLE}}': article.ctaFooter?.title || 'Pr\u00eat \u00e0 <span>immortaliser votre \u00e9v\u00e9nement</span> ?',
    '{{CTA_FOOTER_DESC}}': article.ctaFooter?.desc || 'Obtenez un devis personnalis\u00e9 en 2 minutes. Livraison \u00e0 domicile, tirages illimit\u00e9s, assistance 7j/7.',
    '{{CTA_FOOTER_LINK}}': article.ctaFooter?.link || 'https://shootnbox.fr/reservation/',
    '{{CTA_FOOTER_BTN}}': article.ctaFooter?.btn || 'Estimer mon tarif',
    '{{RELATED_HTML}}': relatedHTML,
    '{{SIDEBAR_RELATED_HTML}}': sidebarRelatedHTML
  };

  let html = tpl;
  for (const [key, val] of Object.entries(replacements)) {
    html = html.split(key).join(val);
  }
  return html;
}

// ── API Routes ───────────────────────────────────────────

/**
 * GET / — List all blog articles
 */
router.get('/', verifyToken, (req, res) => {
  const index = readIndex();
  res.json(index.articles.map(a => ({
    slug: a.slug,
    title: a.title,
    category: a.category,
    author: a.author,
    authorName: (AUTHORS[a.author] || AUTHORS.mathilde).name,
    date: a.date,
    status: a.status || 'draft',
    heroImage: a.heroImage,
    tags: a.tags
  })));
});

/**
 * GET /categories — List available categories
 */
router.get('/categories', verifyToken, (req, res) => {
  res.json(CATEGORIES);
});

/**
 * GET /authors — List available authors
 */
router.get('/authors', verifyToken, (req, res) => {
  res.json(AUTHORS);
});

/**
 * GET /:slug — Get full article data
 */
router.get('/:slug', verifyToken, (req, res) => {
  const index = readIndex();
  const article = index.articles.find(a => a.slug === req.params.slug);
  if (!article) return res.status(404).json({ error: 'Article non trouv\u00e9' });
  res.json(article);
});

/**
 * POST /create — Create a new blog article
 */
router.post('/create', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { title, titleHTML, metaDescription, category, author, date, heroImage, heroAlt, tags, blocks, sidebarCta, ctaFooter } = req.body;

    if (!title) return res.status(400).json({ error: 'Titre requis' });

    const slug = 'blog-' + slugify(title);
    const pageDir = path.join(PREVIEWS_DIR, slug);

    if (fs.existsSync(pageDir)) {
      return res.status(409).json({ error: 'Un article avec ce slug existe d\u00e9j\u00e0' });
    }

    // Build article data
    const article = {
      slug,
      title,
      titleHTML: titleHTML || title,
      metaDescription: metaDescription || '',
      category: category || 'conseils',
      author: author || 'mathilde',
      authorName: (AUTHORS[author] || AUTHORS.mathilde).name,
      date: date || new Date().toISOString().split('T')[0],
      heroImage: heroImage || '',
      heroAlt: heroAlt || title,
      tags: tags || [],
      blocks: blocks || [],
      sidebarCta: sidebarCta || {},
      ctaFooter: ctaFooter || {},
      status: 'draft',
      createdAt: new Date().toISOString()
    };

    article.readTime = estimateReadTime(article.blocks);

    // Save to index
    const index = readIndex();
    index.articles.push(article);
    writeIndex(index);

    // Create page directory + section file
    fs.mkdirSync(pageDir, { recursive: true });
    const html = generateArticleHTML(article, index);
    fs.writeFileSync(path.join(pageDir, '10-blog-article.html'), html, 'utf-8');

    // Create seo.json
    const seoData = {
      title: article.title + ' \u2014 Blog Shootnbox',
      description: article.metaDescription,
      ogTitle: article.title,
      ogDescription: article.metaDescription,
      urlPath: 'blog/' + slug.replace('blog-', '')
    };
    fs.writeFileSync(path.join(pageDir, 'seo.json'), JSON.stringify(seoData, null, 2), 'utf-8');

    await logAudit({
      userId: req.user.id,
      action: 'blog_create',
      entityType: 'blog',
      entityId: slug,
      details: { title: article.title, category: article.category }
    });

    res.status(201).json({ success: true, slug, article });
  } catch (err) {
    console.error('[Blog] Create error:', err);
    res.status(500).json({ error: 'Erreur lors de la cr\u00e9ation de l\'article' });
  }
});

/**
 * PUT /:slug — Update an existing blog article
 */
router.put('/:slug', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const index = readIndex();
    const idx = index.articles.findIndex(a => a.slug === req.params.slug);
    if (idx === -1) return res.status(404).json({ error: 'Article non trouv\u00e9' });

    const article = index.articles[idx];
    const fields = ['title', 'titleHTML', 'metaDescription', 'category', 'author', 'date', 'heroImage', 'heroAlt', 'tags', 'blocks', 'sidebarCta', 'ctaFooter', 'status'];

    for (const f of fields) {
      if (req.body[f] !== undefined) article[f] = req.body[f];
    }

    article.authorName = (AUTHORS[article.author] || AUTHORS.mathilde).name;
    article.readTime = estimateReadTime(article.blocks || []);
    article.updatedAt = new Date().toISOString();

    index.articles[idx] = article;
    writeIndex(index);

    // Regenerate HTML
    const pageDir = path.join(PREVIEWS_DIR, article.slug);
    if (!fs.existsSync(pageDir)) fs.mkdirSync(pageDir, { recursive: true });
    const html = generateArticleHTML(article, index);
    fs.writeFileSync(path.join(pageDir, '10-blog-article.html'), html, 'utf-8');

    // Update seo.json
    const seoData = {
      title: article.title + ' \u2014 Blog Shootnbox',
      description: article.metaDescription,
      ogTitle: article.title,
      ogDescription: article.metaDescription,
      urlPath: 'blog/' + article.slug.replace('blog-', '')
    };
    fs.writeFileSync(path.join(pageDir, 'seo.json'), JSON.stringify(seoData, null, 2), 'utf-8');

    await logAudit({
      userId: req.user.id,
      action: 'blog_update',
      entityType: 'blog',
      entityId: article.slug,
      details: { title: article.title }
    });

    res.json({ success: true, article });
  } catch (err) {
    console.error('[Blog] Update error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise \u00e0 jour' });
  }
});

/**
 * DELETE /:slug — Delete a blog article
 */
router.delete('/:slug', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const index = readIndex();
    const idx = index.articles.findIndex(a => a.slug === req.params.slug);
    if (idx === -1) return res.status(404).json({ error: 'Article non trouv\u00e9' });

    const article = index.articles.splice(idx, 1)[0];
    writeIndex(index);

    // Remove page directory
    const pageDir = path.join(PREVIEWS_DIR, article.slug);
    if (fs.existsSync(pageDir)) {
      fs.rmSync(pageDir, { recursive: true, force: true });
    }

    await logAudit({
      userId: req.user.id,
      action: 'blog_delete',
      entityType: 'blog',
      entityId: article.slug,
      details: { title: article.title }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[Blog] Delete error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

/**
 * POST /:slug/regenerate — Regenerate HTML from stored data
 */
router.post('/:slug/regenerate', verifyToken, requireRole('admin'), (req, res) => {
  const index = readIndex();
  const article = index.articles.find(a => a.slug === req.params.slug);
  if (!article) return res.status(404).json({ error: 'Article non trouv\u00e9' });

  const pageDir = path.join(PREVIEWS_DIR, article.slug);
  if (!fs.existsSync(pageDir)) fs.mkdirSync(pageDir, { recursive: true });

  const html = generateArticleHTML(article, index);
  fs.writeFileSync(path.join(pageDir, '10-blog-article.html'), html, 'utf-8');

  res.json({ success: true });
});

module.exports = router;
