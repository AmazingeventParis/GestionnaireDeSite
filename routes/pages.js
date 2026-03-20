const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');

const PREVIEWS_DIR = path.join(__dirname, '..', 'previews');
const SHARED_DIR = path.join(PREVIEWS_DIR, '_shared');
const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'site');
const BUILD_SCRIPT = path.join(__dirname, '..', 'scripts', 'build.js');

/**
 * Scan a directory for HTML section files and return metadata.
 * Files are expected to follow the pattern: section-name.html
 */
function scanSections(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.html'));
  return files.map(f => {
    const stat = fs.statSync(path.join(dirPath, f));
    return {
      file: f,
      name: f.replace('.html', '').replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()),
      lastModified: stat.mtime.toISOString()
    };
  });
}

/**
 * Determine page status by comparing preview and published timestamps.
 */
function getPageStatus(previewDir, publicDir) {
  if (!fs.existsSync(publicDir)) return 'draft';

  const previewFiles = fs.existsSync(previewDir)
    ? fs.readdirSync(previewDir).filter(f => f.endsWith('.html'))
    : [];
  const publicFiles = fs.existsSync(publicDir)
    ? fs.readdirSync(publicDir).filter(f => f.endsWith('.html'))
    : [];

  if (publicFiles.length === 0) return 'draft';

  // Check if preview is newer than published
  let latestPreview = 0;
  let latestPublic = 0;

  for (const f of previewFiles) {
    const mtime = fs.statSync(path.join(previewDir, f)).mtimeMs;
    if (mtime > latestPreview) latestPreview = mtime;
  }

  for (const f of publicFiles) {
    const fullPath = path.join(publicDir, f);
    if (fs.existsSync(fullPath)) {
      const mtime = fs.statSync(fullPath).mtimeMs;
      if (mtime > latestPublic) latestPublic = mtime;
    }
  }

  return latestPreview > latestPublic ? 'modified' : 'published';
}

/**
 * Get the directory path for a page slug within previews/.
 * 'home' maps to previews/ root, others map to previews/<slug>/
 */
function getPreviewDir(slug) {
  if (slug === 'home') return PREVIEWS_DIR;
  return path.join(PREVIEWS_DIR, slug);
}

function getPublicDir(slug) {
  if (slug === 'home') return PUBLIC_DIR;
  return path.join(PUBLIC_DIR, slug);
}

// ==================== ROUTES ====================

/**
 * GET / — List all pages
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    if (!fs.existsSync(PREVIEWS_DIR)) {
      fs.mkdirSync(PREVIEWS_DIR, { recursive: true });
    }

    const pages = [];

    // Scan root (home page)
    const homeFiles = fs.readdirSync(PREVIEWS_DIR).filter(f => f.endsWith('.html'));
    if (homeFiles.length > 0) {
      const sections = scanSections(PREVIEWS_DIR);
      const latestModified = sections.reduce((max, s) =>
        new Date(s.lastModified) > new Date(max) ? s.lastModified : max,
        sections[0]?.lastModified || new Date().toISOString()
      );
      pages.push({
        slug: 'home',
        name: 'Accueil',
        sections: sections.map(s => s.name),
        lastModified: latestModified,
        status: getPageStatus(PREVIEWS_DIR, PUBLIC_DIR)
      });
    }

    // Scan subdirectories
    const entries = fs.readdirSync(PREVIEWS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('_')) continue; // Skip _shared and other internal dirs
      const slug = entry.name;
      const previewDir = path.join(PREVIEWS_DIR, slug);
      const sections = scanSections(previewDir);

      if (sections.length === 0) continue;

      const latestModified = sections.reduce((max, s) =>
        new Date(s.lastModified) > new Date(max) ? s.lastModified : max,
        sections[0]?.lastModified || new Date().toISOString()
      );

      pages.push({
        slug,
        name: slug.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()),
        sections: sections.map(s => s.name),
        lastModified: latestModified,
        status: getPageStatus(previewDir, getPublicDir(slug))
      });
    }

    res.json({ pages });
  } catch (err) {
    console.error('[Pages] List error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la recuperation des pages' });
  }
});

/**
 * GET /:slug — Get page details (sections, SEO data)
 */
router.get('/:slug', verifyToken, async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const previewDir = getPreviewDir(slug);

    if (!fs.existsSync(previewDir)) {
      return res.status(404).json({ error: 'Page non trouvee' });
    }

    const sections = scanSections(previewDir);
    const publicDir = getPublicDir(slug);
    const status = getPageStatus(previewDir, publicDir);

    // Try to read SEO data from a seo.json file in the page directory
    let seo = { title: '', description: '', ogTitle: '', ogDescription: '' };
    const seoPath = slug === 'home'
      ? path.join(PREVIEWS_DIR, 'seo-home.json')
      : path.join(previewDir, 'seo.json');
    if (fs.existsSync(seoPath)) {
      try {
        seo = JSON.parse(fs.readFileSync(seoPath, 'utf-8'));
      } catch (e) {
        // Invalid JSON, use defaults
      }
    }

    // Read section contents
    const sectionDetails = sections.map(s => {
      const content = fs.readFileSync(path.join(previewDir, s.file), 'utf-8');
      return {
        file: s.file,
        name: s.name,
        content,
        lastModified: s.lastModified
      };
    });

    res.json({
      slug,
      name: slug === 'home' ? 'Accueil' : slug.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()),
      sections: sectionDetails,
      seo,
      status
    });
  } catch (err) {
    console.error('[Pages] Get error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la recuperation de la page' });
  }
});

/**
 * POST /:slug/save — Save content changes and SEO data
 * Body: { changes: [{id, text, tag, tagChanged}], seo: {title, description, ogTitle, ogDescription} }
 * RBAC: editor + admin
 */
router.post('/:slug/save', verifyToken, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const previewDir = getPreviewDir(slug);
    const { changes, seo } = req.body;

    if (!fs.existsSync(previewDir)) {
      return res.status(404).json({ error: 'Page non trouvee' });
    }

    // Apply text changes
    // Change ID format: "sectionFile:index:tag" (e.g., "hero.html:0:h1")
    if (changes && Array.isArray(changes)) {
      for (const change of changes) {
        if (!change.id || change.text === undefined) continue;

        const parts = change.id.split(':');
        if (parts.length < 3) continue;

        const sectionFile = parts[0];
        const index = parseInt(parts[1], 10);
        const tag = parts[2];
        const filePath = path.join(previewDir, sectionFile);

        if (!fs.existsSync(filePath)) continue;

        let html = fs.readFileSync(filePath, 'utf-8');

        // Find and replace the nth occurrence of the tag
        const newTag = change.tagChanged ? change.tag : tag;
        const regex = new RegExp(`(<${tag}[^>]*>)(.*?)(<\\/${tag}>)`, 'gis');
        let matchCount = 0;

        html = html.replace(regex, (match, open, content, close) => {
          if (matchCount === index) {
            matchCount++;
            if (change.tagChanged && newTag !== tag) {
              // Tag was changed (e.g., h2 -> h3)
              return `<${newTag}${open.slice(tag.length + 1)}${change.text}</${newTag}>`;
            }
            return `${open}${change.text}${close}`;
          }
          matchCount++;
          return match;
        });

        fs.writeFileSync(filePath, html, 'utf-8');
      }
    }

    // Save SEO data
    if (seo) {
      const seoPath = slug === 'home'
        ? path.join(PREVIEWS_DIR, 'seo-home.json')
        : path.join(previewDir, 'seo.json');
      fs.writeFileSync(seoPath, JSON.stringify(seo, null, 2), 'utf-8');
    }

    await logAudit({
      userId: req.user.id,
      action: 'page_save',
      entityType: 'page',
      entityId: slug,
      details: {
        changesCount: changes ? changes.length : 0,
        seoUpdated: !!seo
      },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Page sauvegardee' });
  } catch (err) {
    console.error('[Pages] Save error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde' });
  }
});

/**
 * POST /:slug/publish — Build and publish the site
 * RBAC: admin only
 */
router.post('/:slug/publish', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const previewDir = getPreviewDir(slug);

    if (!fs.existsSync(previewDir)) {
      return res.status(404).json({ error: 'Page non trouvee' });
    }

    // Run the build script
    let buildOutput = '';
    try {
      buildOutput = execSync(`node ${BUILD_SCRIPT}`, {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf-8',
        timeout: 30000
      });
    } catch (buildErr) {
      console.error('[Pages] Build error:', buildErr.message);
      return res.status(500).json({
        error: 'Erreur lors du build',
        details: buildErr.stderr || buildErr.message
      });
    }

    await logAudit({
      userId: req.user.id,
      action: 'page_publish',
      entityType: 'page',
      entityId: slug,
      details: { buildOutput: buildOutput.slice(0, 500) },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Page publiee avec succes', buildOutput });
  } catch (err) {
    console.error('[Pages] Publish error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la publication' });
  }
});

/**
 * GET /:slug/preview — Serve the current draft HTML
 */
router.get('/:slug/preview', verifyToken, async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const previewDir = getPreviewDir(slug);

    if (!fs.existsSync(previewDir)) {
      return res.status(404).json({ error: 'Page non trouvee' });
    }

    // Read site config for template assembly
    const configPath = path.join(__dirname, '..', 'site-config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    // Assemble the page: shared header + page sections + shared footer
    const sections = scanSections(previewDir);
    let bodyContent = '';

    // Inject shared header
    const sharedHeaderPath = path.join(SHARED_DIR, 'header.html');
    if (fs.existsSync(sharedHeaderPath)) {
      bodyContent += fs.readFileSync(sharedHeaderPath, 'utf-8') + '\n';
    }
    bodyContent += '<main class="snb-page-content">\n';

    // Page-specific sections (skip any header/footer files that might remain)
    for (const section of sections) {
      const nameLower = section.file.toLowerCase();
      if (nameLower.includes('header') || nameLower.includes('footer')) continue;
      const content = fs.readFileSync(path.join(previewDir, section.file), 'utf-8');
      bodyContent += content + '\n';
    }

    bodyContent += '</main>\n';

    // Inject shared footer
    const sharedFooterPath = path.join(SHARED_DIR, 'footer.html');
    if (fs.existsSync(sharedFooterPath)) {
      bodyContent += fs.readFileSync(sharedFooterPath, 'utf-8') + '\n';
    }

    // Read SEO data
    let seo = { title: config.identity?.name || 'Preview', description: '' };
    const seoPath = slug === 'home'
      ? path.join(PREVIEWS_DIR, 'seo-home.json')
      : path.join(previewDir, 'seo.json');
    if (fs.existsSync(seoPath)) {
      try {
        seo = { ...seo, ...JSON.parse(fs.readFileSync(seoPath, 'utf-8')) };
      } catch (e) { /* ignore */ }
    }

    const fontMain = config.typography?.fontMain || 'Raleway';
    const fontHeadings = config.typography?.fontHeadings || 'Raleway';

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${seo.title || config.identity?.name || 'Preview'}</title>
  <meta name="description" content="${seo.description || ''}">
  <style>
    @font-face{font-family:'Raleway';font-style:normal;font-weight:400 900;font-display:swap;src:url(/fonts/raleway-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
    @font-face{font-family:'Raleway';font-style:normal;font-weight:400 900;font-display:swap;src:url(/fonts/raleway-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
    @font-face{font-family:'Raleway';font-style:italic;font-weight:900;font-display:swap;src:url(/fonts/raleway-900i-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
    @font-face{font-family:'Raleway';font-style:italic;font-weight:900;font-display:swap;src:url(/fonts/raleway-900i-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
    *,*::before,*::after{box-sizing:border-box}
    body{margin:0;padding:0;font-family:"Raleway",sans-serif;color:#333;line-height:1.6;background:#fff;overflow-x:hidden;-webkit-font-smoothing:antialiased}
    .snb-page-wrapper{overflow-x:hidden}
    a{text-decoration:none;color:inherit}
    img{max-width:100%;height:auto}
    ul{list-style:none;padding:0;margin:0}
    .snb-page-content{padding-top:72px}
    @media (max-width:850px){.snb-page-content{padding-top:60px}}
    :root {
      --color-primary: ${config.colors?.primary || '#E51981'};
      --color-secondary: ${config.colors?.secondary || '#0250FF'};
      --color-tertiary: ${config.colors?.tertiary || '#a855f7'};
      --color-accent1: ${config.colors?.accent1 || '#FF7A00'};
      --color-accent2: ${config.colors?.accent2 || '#16A34A'};
      --color-text-dark: ${config.colors?.textDark || '#1a0a22'};
      --color-text-light: ${config.colors?.textLight || '#ffffff'};
      --color-bg-main: ${config.colors?.bgMain || '#ffffff'};
      --color-bg-alt: ${config.colors?.bgAlt || '#f8eaff'};
      --font-main: '${fontMain}', sans-serif;
      --font-headings: '${fontHeadings}', sans-serif;
      --max-width: ${config.layout?.maxWidth || '1340px'};
      --border-radius: ${config.layout?.borderRadius || '12px'};
      --cta-radius: ${config.cta?.borderRadius || '50px'};
    }
    h1, h2, h3, h4, h5, h6 { font-family: var(--font-headings); }
    .container { max-width: var(--max-width); margin: 0 auto; padding: 0 20px; }
  </style>
  ${config.scripts?.headCustom || ''}
</head>
<body>
<div class="snb-page-wrapper">
${bodyContent}
</div>
<script src="/js/site/scripts-${slug === 'home' ? 'home' : slug}.js" defer></script>
${config.scripts?.bodyEndCustom || ''}
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('[Pages] Preview error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la generation du preview' });
  }
});

// ==================== SHARED HEADER/FOOTER ====================

/**
 * GET /shared/:component — Get shared header or footer HTML
 */
router.get('/shared/:component', verifyToken, async (req, res) => {
  try {
    const component = req.params.component.replace(/[^a-z]/gi, '');
    if (component !== 'header' && component !== 'footer') {
      return res.status(400).json({ error: 'Composant invalide. Utiliser "header" ou "footer".' });
    }

    if (!fs.existsSync(SHARED_DIR)) {
      fs.mkdirSync(SHARED_DIR, { recursive: true });
    }

    const filePath = path.join(SHARED_DIR, component + '.html');
    const content = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf-8')
      : '';

    res.json({ component, content });
  } catch (err) {
    console.error('[Pages] Shared get error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * PUT /shared/:component — Save shared header or footer HTML
 * RBAC: admin only
 */
router.put('/shared/:component', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const component = req.params.component.replace(/[^a-z]/gi, '');
    if (component !== 'header' && component !== 'footer') {
      return res.status(400).json({ error: 'Composant invalide. Utiliser "header" ou "footer".' });
    }

    const { content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Le champ "content" est requis (string).' });
    }

    if (!fs.existsSync(SHARED_DIR)) {
      fs.mkdirSync(SHARED_DIR, { recursive: true });
    }

    const filePath = path.join(SHARED_DIR, component + '.html');
    fs.writeFileSync(filePath, content, 'utf-8');

    await logAudit({
      userId: req.user.id,
      action: 'shared_update',
      entityType: component,
      entityId: component,
      details: { size: content.length },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: `${component} mis a jour`, size: content.length });
  } catch (err) {
    console.error('[Pages] Shared save error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
