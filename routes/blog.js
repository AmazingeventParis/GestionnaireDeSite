const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');

const PREVIEWS_DIR = path.join(__dirname, '..', 'previews');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
// Store blog index in previews/ which has a persistent Docker volume (gds-previews)
const BLOG_INDEX = path.join(PREVIEWS_DIR, '_blog-index.json');

console.log('[Blog] Index path:', BLOG_INDEX);

// ── Helpers ──────────────────────────────────────────────

const DEFAULT_CATEGORIES = ['Mariage', 'Entreprise', 'Anniversaire', 'Conseils'];

function readIndex() {
  try {
    const data = JSON.parse(fs.readFileSync(BLOG_INDEX, 'utf-8'));
    if (!data.categories || !data.categories.length) data.categories = [...DEFAULT_CATEGORIES];
    return data;
  } catch {
    return { articles: [], categories: [...DEFAULT_CATEGORIES] };
  }
}

function writeIndex(data) {
  fs.writeFileSync(BLOG_INDEX, JSON.stringify(data, null, 2), 'utf-8');
}

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

function estimateReadTimeHTML(html) {
  const text = (html || '').replace(/<[^>]+>/g, '');
  const words = text.split(/\s+/).filter(w => w).length;
  return Math.max(1, Math.round(words / 230));
}

// Build TOC from raw HTML (extract h2/h3 with their ids)
function buildTOCFromHTML(html) {
  const re = /<(h[23])\s[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  let toc = '';
  while ((match = re.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const id = match[2];
    const text = match[3].replace(/<[^>]+>/g, '').trim();
    if (tag === 'h2') {
      toc += `        <li><a href="#${id}">${text}</a></li>\n`;
    } else {
      toc += `        <li class="h3-item"><a href="#${id}">${text}</a></li>\n`;
    }
  }
  return toc;
}

// Build tags HTML
function buildTagsHTML(tags) {
  return (tags || []).map(t => {
    const tag = t.startsWith('#') ? t : '#' + t;
    return `<a href="#" class="snb-tag">${tag}</a>`;
  }).join('\n      ');
}

// Resolve category display info from category name
function categoryInfo(catName) {
  const slug = slugify(catName || 'blog');
  // Default emoji/class mappings for known categories
  const known = {
    mariage:      { class: 'cat-mariage',      emoji: '\ud83d\udc8d' },
    entreprise:   { class: 'cat-entreprise',    emoji: '\ud83c\udfe2' },
    anniversaire: { class: 'cat-anniversaire',  emoji: '\ud83c\udf82' },
    conseils:     { class: 'cat-conseils',      emoji: '\ud83d\udca1' }
  };
  const k = known[slug];
  return {
    label: catName || 'Blog',
    class: k ? k.class : 'cat-' + slug,
    emoji: k ? k.emoji : '\ud83d\udcdd',
    link: '/blog/' + slug + '/'
  };
}

// Build related articles HTML (bottom grid)
function buildRelatedHTML(currentSlug, index) {
  const others = index.articles
    .filter(a => a.slug !== currentSlug && a.status !== 'draft')
    .slice(0, 3);
  if (!others.length) return '';
  return others.map(a => {
    const cat = categoryInfo(a.category);
    return `
    <a href="/blog/${a.slug}/" class="snb-related-card">
      <div class="snb-related-card-img">
        <img src="${a.heroImage || '/site-images/blog-default.webp'}" alt="${a.title}" loading="lazy">
      </div>
      <div class="snb-related-card-body">
        <div class="snb-related-card-cat">${cat.emoji} ${cat.label}</div>
        <div class="snb-related-card-title">${a.title}</div>
        <div class="snb-related-card-meta">
          <span>${a.authorName || a.author}</span>&middot;<span>${formatDateFR(a.date)}</span>
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
function generateArticleFiles(article, index) {
  const tpl = fs.readFileSync(path.join(TEMPLATES_DIR, 'blog-article.html'), 'utf-8');
  const cat = categoryInfo(article.category);
  const author = AUTHORS[article.author] || AUTHORS.mathilde;
  const bodyHTML = article.bodyHTML || '';
  const tocHTML = buildTOCFromHTML(bodyHTML);
  const tagsHTML = buildTagsHTML(article.tags || []);
  const relatedHTML = buildRelatedHTML(article.slug, index);
  const sidebarRelatedHTML = buildSidebarRelatedHTML(article.slug, index);
  const readTime = article.readTime || estimateReadTimeHTML(bodyHTML);

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
    '{{HERO_IMAGE}}': article.heroImage || '',
    '{{HERO_ALT}}': article.heroAlt || article.title,
    '{{TITLE_HTML}}': article.titleHTML || article.title,
    '{{BODY_CONTENT}}': bodyHTML,
    '{{TAGS_HTML}}': tagsHTML,
    '{{TOC_HTML}}': tocHTML,
    '{{BREADCRUMB_CAT_LINK}}': cat.link,
    '{{BREADCRUMB_CAT_NAME}}': cat.label,
    '{{BREADCRUMB_TITLE}}': article.title,
    '{{RELATED_HTML}}': relatedHTML,
    '{{SIDEBAR_RELATED_HTML}}': sidebarRelatedHTML
  };

  let fullHtml = tpl;
  for (const [key, val] of Object.entries(replacements)) {
    fullHtml = fullHtml.split(key).join(val);
  }

  // Split into 3 files: hero, content, sidebar+footer

  // Extract CSS (everything in <style>)
  let css = '';
  fullHtml = fullHtml.replace(/<style>([\s\S]*?)<\/style>/i, (m, c) => { css = c; return ''; });

  // Extract script
  let script = '';
  fullHtml = fullHtml.replace(/<script>([\s\S]*?)<\/script>/i, (m, c) => { script = c; return ''; });

  // Split HTML at the layout div
  const heroEnd = fullHtml.indexOf('<div class="snb-article-layout">');
  const sidebarStart = fullHtml.indexOf('<aside class="snb-sidebar">');
  const sidebarEnd = fullHtml.indexOf('</aside>');
  const layoutEnd = fullHtml.indexOf('</div>', sidebarEnd + 8); // close snb-article-layout
  const relatedStart = fullHtml.indexOf('<section class="snb-related-section">');

  const heroHTML = fullHtml.substring(0, heroEnd).trim();
  const bodyContentHTML = fullHtml.substring(heroEnd, sidebarStart).trim();
  const sidebarHTML = fullHtml.substring(sidebarStart, sidebarEnd + 8).trim();
  const afterLayout = fullHtml.substring(layoutEnd + 6).trim(); // related section + rest

  // File 1: Hero (breadcrumb + meta + title + author + hero image placeholder)
  const heroImageSrc = article.heroImage || '';
  const heroImgTag = heroImageSrc
    ? `<img src="${heroImageSrc}" alt="${article.heroAlt || article.title}" loading="eager" fetchpriority="high" width="1300" height="488">`
    : `<img src="" alt="${article.heroAlt || article.title}" data-gds-placeholder loading="eager" fetchpriority="high" width="1300" height="488" style="width:100%;aspect-ratio:16/6;border:2px dashed rgba(150,150,150,0.3);border-radius:20px;background:#f0f0f0;">`;

  // Replace the img in hero with placeholder-aware version
  let heroFinal = heroHTML.replace(/<img\s+src="[^"]*"\s+alt="[^"]*"[^>]*>/, heroImgTag);

  const file1 = `<style>${css}</style>\n${heroFinal}`;

  // File 2: Article body content (editable — user adds blocs here)
  // Wrap in the article-layout opening + article body
  const file2 = bodyContentHTML
    ? bodyContentHTML + '\n  </article>'
    : `<div class="snb-article-layout">\n  <article class="snb-article-body">\n    <p class="snb-article-intro">Redigez votre introduction ici...</p>\n  </article>`;

  // File 3: Sidebar + related articles + script
  const file3 = `  ${sidebarHTML}\n</div>\n${afterLayout}\n<script>${script}</script>`;

  return { file1, file2, file3 };
}

// Backward compat wrapper
function generateArticleHTML(article, index) {
  const files = generateArticleFiles(article, index);
  return files.file1 + '\n' + files.file2 + '\n' + files.file3;
}

// Ensure category is tracked in index
function ensureCategory(index, catName) {
  if (!catName) return;
  if (!index.categories) index.categories = [];
  const lower = catName.toLowerCase().trim();
  if (!index.categories.find(c => c.toLowerCase() === lower)) {
    index.categories.push(catName.trim());
  }
}

// ── API Routes ───────────────────────────────────────────

/**
 * GET / — List all blog articles
 */
router.get('/', verifyToken, (req, res) => {
  const index = readIndex();
  res.json({
    articles: index.articles.map(a => ({
      slug: a.slug,
      title: a.title,
      category: a.category,
      author: a.author,
      authorName: (AUTHORS[a.author] || AUTHORS.mathilde).name,
      date: a.date,
      status: a.status || 'draft',
      heroImage: a.heroImage,
      tags: a.tags
    })),
    categories: index.categories || []
  });
});

/**
 * POST /categories — Add a new category
 */
router.post('/categories', verifyToken, requireRole('admin'), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  const index = readIndex();
  ensureCategory(index, name.trim());
  writeIndex(index);
  res.json({ success: true, categories: index.categories });
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
    const { title, titleHTML, metaDescription, category, author, date, scheduledTime, heroImage, heroAlt, tags, bodyHTML, status } = req.body;

    if (!title) return res.status(400).json({ error: 'Titre requis' });

    const slug = 'blog-' + slugify(title);
    const pageDir = path.join(PREVIEWS_DIR, slug);

    if (fs.existsSync(pageDir)) {
      return res.status(409).json({ error: 'Un article avec ce slug existe d\u00e9j\u00e0' });
    }

    const article = {
      slug,
      title,
      titleHTML: titleHTML || title,
      metaDescription: metaDescription || '',
      category: category || 'Blog',
      author: author || 'mathilde',
      authorName: (AUTHORS[author] || AUTHORS.mathilde).name,
      date: date || new Date().toISOString().split('T')[0],
      scheduledTime: scheduledTime || '',
      heroImage: heroImage || '',
      heroAlt: heroAlt || title,
      tags: tags || [],
      bodyHTML: bodyHTML || '',
      status: status || 'draft',
      createdAt: new Date().toISOString()
    };

    article.readTime = estimateReadTimeHTML(article.bodyHTML);

    const index = readIndex();
    ensureCategory(index, article.category);
    index.articles.push(article);
    writeIndex(index);

    // Create page directory + section files (3 separate files)
    fs.mkdirSync(pageDir, { recursive: true });
    const files = generateArticleFiles(article, index);
    fs.writeFileSync(path.join(pageDir, '10-blog-hero.html'), files.file1, 'utf-8');
    fs.writeFileSync(path.join(pageDir, '20-blog-body.html'), files.file2, 'utf-8');
    fs.writeFileSync(path.join(pageDir, '30-blog-sidebar.html'), files.file3, 'utf-8');

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
    const fields = ['title', 'titleHTML', 'metaDescription', 'category', 'author', 'date', 'scheduledTime', 'heroImage', 'heroAlt', 'tags', 'bodyHTML', 'status'];

    for (const f of fields) {
      if (req.body[f] !== undefined) article[f] = req.body[f];
    }

    article.authorName = (AUTHORS[article.author] || AUTHORS.mathilde).name;
    article.readTime = estimateReadTimeHTML(article.bodyHTML || '');
    article.updatedAt = new Date().toISOString();

    ensureCategory(index, article.category);
    index.articles[idx] = article;
    writeIndex(index);

    // Regenerate HTML (3 files)
    const pageDir = path.join(PREVIEWS_DIR, article.slug);
    if (!fs.existsSync(pageDir)) fs.mkdirSync(pageDir, { recursive: true });
    const files = generateArticleFiles(article, index);
    fs.writeFileSync(path.join(pageDir, '10-blog-hero.html'), files.file1, 'utf-8');
    // Only regenerate body if bodyHTML changed (don't overwrite user's manual edits from editor)
    if (req.body.bodyHTML !== undefined) {
      fs.writeFileSync(path.join(pageDir, '20-blog-body.html'), files.file2, 'utf-8');
    }
    fs.writeFileSync(path.join(pageDir, '30-blog-sidebar.html'), files.file3, 'utf-8');
    // Clean up old single-file if it exists
    const oldFile = path.join(pageDir, '10-blog-article.html');
    if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);

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

  const files = generateArticleFiles(article, index);
  fs.writeFileSync(path.join(pageDir, '10-blog-hero.html'), files.file1, 'utf-8');
  fs.writeFileSync(path.join(pageDir, '20-blog-body.html'), files.file2, 'utf-8');
  fs.writeFileSync(path.join(pageDir, '30-blog-sidebar.html'), files.file3, 'utf-8');
  // Clean up old single-file
  const oldFile = path.join(pageDir, '10-blog-article.html');
  if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);

  res.json({ success: true });
});

// ── Scheduler: auto-publish scheduled articles ──────────

function checkScheduledArticles() {
  try {
    const index = readIndex();
    const now = new Date();
    let changed = false;

    for (const article of index.articles) {
      if (article.status !== 'scheduled') continue;

      const schedDate = article.date || '';
      const schedTime = article.scheduledTime || '09:00';
      if (!schedDate) continue;

      const scheduled = new Date(schedDate + 'T' + schedTime + ':00');
      if (now >= scheduled) {
        article.status = 'published';
        article.publishedAt = now.toISOString();
        changed = true;
        console.log(`[Blog Scheduler] Auto-published: "${article.title}" (was scheduled for ${schedDate} ${schedTime})`);
      }
    }

    if (changed) {
      writeIndex(index);
    }
  } catch (err) {
    console.error('[Blog Scheduler] Error:', err.message);
  }
}

// Check every 60 seconds
setInterval(checkScheduledArticles, 60 * 1000);
// Also check on startup
setTimeout(checkScheduledArticles, 5000);
console.log('[Blog] Scheduler started — checking scheduled articles every 60s');

module.exports = router;
