const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');

const { getActiveSite } = require('../middleware/activeSite');
const _DEFAULT_CONFIG = path.join(__dirname, '..', 'site-config.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ROBOTS_PATH = path.join(PUBLIC_DIR, 'robots.txt');
const _DEFAULT_PD = path.join(__dirname, '..', 'previews');

function readConfig() {
  const p = getActiveSite().configPath || _DEFAULT_CONFIG;
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeConfig(config) {
  const p = getActiveSite().configPath || _DEFAULT_CONFIG;
  fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf-8');
}

function getPD() { return getActiveSite().previewsDir || _DEFAULT_PD; }

// ==================== ROUTES ====================

/**
 * GET /global — Return SEO config
 */
router.get('/global', verifyToken, async (req, res) => {
  try {
    const config = readConfig();
    res.json({ seo: config.seo || {} });
  } catch (err) {
    console.error('[SEO] Get global error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la recuperation des parametres SEO' });
  }
});

/**
 * PUT /global — Update SEO config (admin only)
 */
router.put('/global', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { seo } = req.body;
    if (!seo || typeof seo !== 'object') {
      return res.status(400).json({ error: 'Donnees SEO invalides' });
    }

    const config = readConfig();
    const oldSeo = config.seo || {};

    config.seo = {
      titleTemplate: seo.titleTemplate || '%page% | Mon Site',
      defaultDescription: seo.defaultDescription || '',
      noindex: !!seo.noindex,
      ogImageDefault: seo.ogImageDefault || '',
      gtmId: seo.gtmId || '',
      searchConsoleId: seo.searchConsoleId || ''
    };

    writeConfig(config);

    await logAudit({
      userId: req.user.id,
      action: 'seo_global_update',
      entityType: 'seo',
      entityId: 'global',
      details: { previous: oldSeo, updated: config.seo },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, seo: config.seo });
  } catch (err) {
    console.error('[SEO] Update global error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la mise a jour des parametres SEO' });
  }
});

/**
 * GET /scripts — Return global scripts/injection config
 */
router.get('/scripts', verifyToken, async (req, res) => {
  try {
    const config = readConfig();
    const scripts = config.scripts || {};
    const seo = config.seo || {};
    res.json({
      gtmId: seo.gtmId || '',
      headCustom: scripts.headCustom || '',
      bodyStartCustom: scripts.bodyStartCustom || '',
      bodyEndCustom: scripts.bodyEndCustom || '',
      cookieConsent: scripts.cookieConsent || { enabled: false, text: '' },
      chatWidget: scripts.chatWidget || '',
      metaAuthor: seo.metaAuthor || '',
      themeColor: seo.themeColor || '#E51981',
      favicon: config.identity?.favicon || ''
    });
  } catch (err) {
    console.error('[SEO] Get scripts error:', err.message);
    res.status(500).json({ error: 'Erreur' });
  }
});

/**
 * PUT /scripts — Update global scripts/injection config (admin only)
 */
router.put('/scripts', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { gtmId, headCustom, bodyStartCustom, bodyEndCustom, cookieConsent, chatWidget, metaAuthor, themeColor } = req.body;
    const config = readConfig();

    if (!config.scripts) config.scripts = {};
    if (!config.seo) config.seo = {};

    if (gtmId !== undefined) config.seo.gtmId = gtmId;
    if (metaAuthor !== undefined) config.seo.metaAuthor = metaAuthor;
    if (themeColor !== undefined) config.seo.themeColor = themeColor;
    if (headCustom !== undefined) config.scripts.headCustom = headCustom;
    if (bodyStartCustom !== undefined) config.scripts.bodyStartCustom = bodyStartCustom;
    if (bodyEndCustom !== undefined) config.scripts.bodyEndCustom = bodyEndCustom;
    if (cookieConsent !== undefined) config.scripts.cookieConsent = cookieConsent;
    if (chatWidget !== undefined) config.scripts.chatWidget = chatWidget;

    writeConfig(config);

    await logAudit({
      userId: req.user.id,
      action: 'scripts_update',
      entityType: 'seo',
      entityId: 'scripts',
      details: { gtmId: config.seo.gtmId, cookieConsentEnabled: config.scripts.cookieConsent?.enabled },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[SEO] Update scripts error:', err.message);
    res.status(500).json({ error: 'Erreur' });
  }
});

/**
 * GET /sitemap — Auto-generate sitemap XML from published pages
 */
router.get('/sitemap', async (req, res) => {
  try {
    const config = readConfig();
    const domain = config.deploy?.domain || 'https://example.com';
    const baseDomain = domain.startsWith('http') ? domain : 'https://' + domain;

    // Default page priorities and change frequencies
    const pageConfig = {
      '/': { priority: '1.0', changefreq: 'weekly' },
      '/location-photobooth/': { priority: '0.9', changefreq: 'monthly' },
      '/location-photobooth-entreprise/': { priority: '0.9', changefreq: 'monthly' },
    };

    const pages = [];

    // Scan public/site/ for index.html files (published pages)
    const siteDir = path.join(PUBLIC_DIR, 'site');
    if (fs.existsSync(siteDir)) {
      scanForPages(siteDir, siteDir, pages);
    }

    // Try to read per-page seo.json for sitemap config
    for (const page of pages) {
      const slug = page.loc === '/' ? 'home' : page.loc.replace(/^\/|\/$/g, '');
      const seoPath = slug === 'home'
        ? path.join(getPD(), 'seo-home.json')
        : path.join(getPD(), slug, 'seo.json');
      if (fs.existsSync(seoPath)) {
        try {
          const seoData = JSON.parse(fs.readFileSync(seoPath, 'utf-8'));
          if (seoData.sitemap) {
            if (seoData.sitemap.include === false) { page.exclude = true; continue; }
            if (seoData.sitemap.priority) page.priority = seoData.sitemap.priority;
            if (seoData.sitemap.changefreq) page.changefreq = seoData.sitemap.changefreq;
          }
        } catch(e) {}
      }
    }
    // Filter excluded pages
    const includedPages = pages.filter(p => !p.exclude);

    // Build XML with proper priorities
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (const page of includedPages) {
      const cfg = pageConfig[page.loc] || { priority: '0.7', changefreq: 'monthly' };
      xml += '  <url>\n';
      xml += `    <loc>${baseDomain}${page.loc}</loc>\n`;
      xml += `    <lastmod>${page.lastmod}</lastmod>\n`;
      xml += `    <changefreq>${page.changefreq || cfg.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority || cfg.priority}</priority>\n`;
      xml += '  </url>\n';
    }

    xml += '</urlset>';

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('[SEO] Sitemap error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la generation du sitemap' });
  }
});

/**
 * GET /robots — Return robots.txt content
 */
router.get('/robots', verifyToken, async (req, res) => {
  try {
    if (fs.existsSync(ROBOTS_PATH)) {
      const content = fs.readFileSync(ROBOTS_PATH, 'utf-8');
      res.json({ content });
    } else {
      const defaultContent = 'User-agent: *\nAllow: /\n\nSitemap: /api/seo/sitemap';
      res.json({ content: defaultContent });
    }
  } catch (err) {
    console.error('[SEO] Robots get error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la recuperation du robots.txt' });
  }
});

/**
 * PUT /robots — Write robots.txt (admin only)
 */
router.put('/robots', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { content } = req.body;
    if (content === undefined || typeof content !== 'string') {
      return res.status(400).json({ error: 'Contenu invalide' });
    }

    fs.writeFileSync(ROBOTS_PATH, content, 'utf-8');

    await logAudit({
      userId: req.user.id,
      action: 'seo_robots_update',
      entityType: 'seo',
      entityId: 'robots.txt',
      details: { length: content.length },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'robots.txt mis a jour' });
  } catch (err) {
    console.error('[SEO] Robots update error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la mise a jour du robots.txt' });
  }
});

/**
 * POST /generate-sitemap — Generate and write sitemap.xml to public/site/
 */
router.post('/generate-sitemap', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const config = readConfig();
    const domain = config.deploy?.domain || 'https://example.com';
    const baseDomain = domain.startsWith('http') ? domain : 'https://' + domain;

    const pageConfig = {
      '/': { priority: '1.0', changefreq: 'weekly' },
      '/location-photobooth/': { priority: '0.9', changefreq: 'monthly' },
      '/location-photobooth-entreprise/': { priority: '0.9', changefreq: 'monthly' },
    };

    const pages = [];
    const siteDir = path.join(PUBLIC_DIR, 'site');
    if (fs.existsSync(siteDir)) {
      scanForPages(siteDir, siteDir, pages);
    }

    // Try to read per-page seo.json for sitemap config
    for (const page of pages) {
      const slug = page.loc === '/' ? 'home' : page.loc.replace(/^\/|\/$/g, '');
      const seoPath = slug === 'home'
        ? path.join(getPD(), 'seo-home.json')
        : path.join(getPD(), slug, 'seo.json');
      if (fs.existsSync(seoPath)) {
        try {
          const seoData = JSON.parse(fs.readFileSync(seoPath, 'utf-8'));
          if (seoData.sitemap) {
            if (seoData.sitemap.include === false) { page.exclude = true; continue; }
            if (seoData.sitemap.priority) page.priority = seoData.sitemap.priority;
            if (seoData.sitemap.changefreq) page.changefreq = seoData.sitemap.changefreq;
          }
        } catch(e) {}
      }
    }
    // Filter excluded pages
    const includedPages = pages.filter(p => !p.exclude);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (const page of includedPages) {
      const cfg = pageConfig[page.loc] || { priority: '0.7', changefreq: 'monthly' };
      xml += '  <url>\n';
      xml += `    <loc>${baseDomain}${page.loc}</loc>\n`;
      xml += `    <lastmod>${page.lastmod}</lastmod>\n`;
      xml += `    <changefreq>${page.changefreq || cfg.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority || cfg.priority}</priority>\n`;
      xml += '  </url>\n';
    }

    xml += '</urlset>';

    const sitemapPath = path.join(PUBLIC_DIR, 'site', 'sitemap.xml');
    fs.writeFileSync(sitemapPath, xml, 'utf-8');

    await logAudit({
      userId: req.user.id,
      action: 'sitemap_generate',
      entityType: 'seo',
      entityId: 'sitemap',
      details: { pages: includedPages.length },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, pages: pages.length, path: '/site/sitemap.xml' });
  } catch (err) {
    console.error('[SEO] Generate sitemap error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la generation du sitemap' });
  }
});

/**
 * Recursively scan for index.html files to build sitemap
 */
function scanForPages(dir, baseDir, pages) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanForPages(fullPath, baseDir, pages);
      } else if (entry.name === 'index.html') {
        const relativePath = path.relative(baseDir, dir).replace(/\\/g, '/');
        const loc = relativePath ? '/' + relativePath + '/' : '/';
        const stat = fs.statSync(fullPath);
        pages.push({ loc, lastmod: stat.mtime.toISOString().split('T')[0] });
      }
    }
  } catch (e) { /* skip unreadable */ }
}

/**
 * GET /feed — RSS 2.0 feed (public, no auth)
 */
router.get('/feed', (req, res) => {
  try {
    const config = readConfig();
    const domain = config.deploy?.domain || 'example.com';
    const baseDomain = domain.startsWith('http') ? domain : 'https://' + domain;

    // Read blog index
    const blogIndexPath = getActiveSite().blogIndexPath;
    let articles = [];
    if (fs.existsSync(blogIndexPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(blogIndexPath, 'utf-8'));
        articles = Array.isArray(raw) ? raw : (raw.articles || []);
      } catch (e) {
        console.error('[SEO] Error reading blog index:', e.message);
      }
    }

    // Filter only published articles
    const published = articles.filter(a => a.status === 'published');

    // Sort by date descending
    published.sort((a, b) => {
      const da = a.date ? new Date(a.date) : new Date(0);
      const db = b.date ? new Date(b.date) : new Date(0);
      return db - da;
    });

    // Helper: convert ISO date to RFC822
    function toRFC822(isoDate) {
      if (!isoDate) return new Date().toUTCString();
      // Handle YYYY-MM-DD format
      const d = new Date(isoDate + 'T09:00:00+00:00');
      if (isNaN(d.getTime())) return new Date().toUTCString();
      return d.toUTCString();
    }

    // Helper: escape XML entities
    function escapeXml(str) {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    }

    // Build RSS XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n';
    xml += '  <channel>\n';
    xml += '    <title>Shootnbox — Blog</title>\n';
    xml += `    <link>${baseDomain}/blog/</link>\n`;
    xml += `    <description>${escapeXml(config.seo?.defaultDescription || 'Blog Shootnbox')}</description>\n`;
    xml += '    <language>fr</language>\n';
    xml += `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n`;
    xml += `    <atom:link href="${baseDomain}/api/seo/feed" rel="self" type="application/rss+xml"/>\n`;

    for (const article of published) {
      const articleUrl = `${baseDomain}/blog/${article.slug}/`;
      xml += '    <item>\n';
      xml += `      <title>${escapeXml(article.title || article.slug)}</title>\n`;
      xml += `      <link>${articleUrl}</link>\n`;
      xml += `      <description>${escapeXml(article.metaDescription || '')}</description>\n`;
      xml += `      <pubDate>${toRFC822(article.date)}</pubDate>\n`;
      xml += `      <guid isPermaLink="true">${articleUrl}</guid>\n`;
      if (article.authorName) {
        xml += `      <author>${escapeXml(article.authorName)}</author>\n`;
      }
      if (article.category) {
        xml += `      <category>${escapeXml(article.category)}</category>\n`;
      }
      xml += '    </item>\n';
    }

    xml += '  </channel>\n';
    xml += '</rss>';

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('[SEO] RSS feed error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la generation du flux RSS' });
  }
});

module.exports = router;
