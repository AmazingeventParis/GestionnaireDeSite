const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');

const CONFIG_PATH = path.join(__dirname, '..', 'site-config.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ROBOTS_PATH = path.join(PUBLIC_DIR, 'robots.txt');
const PREVIEWS_DIR = path.join(__dirname, '..', 'previews');

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

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
 * GET /sitemap — Auto-generate sitemap XML from published pages
 */
router.get('/sitemap', async (req, res) => {
  try {
    const config = readConfig();
    const domain = config.deploy?.domain || 'https://example.com';
    const baseDomain = domain.startsWith('http') ? domain : 'https://' + domain;

    const pages = [];

    // Scan public/site/ for index.html files (published pages)
    const siteDir = path.join(PUBLIC_DIR, 'site');
    if (fs.existsSync(siteDir)) {
      scanForPages(siteDir, siteDir, pages);
    }

    // Also check public/ root for index.html
    const rootIndex = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(rootIndex)) {
      const stat = fs.statSync(rootIndex);
      pages.push({ loc: '/', lastmod: stat.mtime.toISOString().split('T')[0] });
    }

    // Build XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (const page of pages) {
      xml += '  <url>\n';
      xml += `    <loc>${baseDomain}${page.loc}</loc>\n`;
      xml += `    <lastmod>${page.lastmod}</lastmod>\n`;
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.8</priority>\n';
      xml += '  </url>\n';
    }

    xml += '</urlset>';

    res.setHeader('Content-Type', 'application/xml');
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

module.exports = router;
