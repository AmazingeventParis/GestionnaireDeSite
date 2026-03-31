const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');

const PREVIEWS_DIR = path.join(__dirname, '..', 'previews');
const SHARED_DIR = path.join(PREVIEWS_DIR, '_shared');
const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'site');
const BUILD_SCRIPT = path.join(__dirname, '..', 'scripts', 'build.js');

/**
 * Scope CSS selectors by prefixing with #scopeId.
 * Handles @media, @keyframes, :root, and nested blocks correctly.
 */
function scopeCSS(css, scopeId) {
  const result = [];
  let i = 0;
  const len = css.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(css[i])) { result.push(css[i]); i++; }
    if (i >= len) break;

    // Find the next selector or at-rule
    const start = i;
    let braceDepth = 0;
    let selector = '';

    // Read until we hit an opening brace at depth 0
    while (i < len && css[i] !== '{') {
      selector += css[i];
      i++;
    }
    if (i >= len) { result.push(selector); break; }

    selector = selector.trim();
    // Clean up broken selectors: if selector contains a line that ends with -
    // followed by another selector on the next line, keep only the last valid selector
    if (selector.includes('\n')) {
      const lines = selector.split('\n').map(l => l.trim()).filter(l => l);
      // If a line ends with - (orphan), remove it
      const cleaned = lines.filter(l => !(/^[.#][\w-]*-$/.test(l)));
      selector = cleaned.join(', ');
    }
    // Read the block content (matching braces)
    let block = '';
    braceDepth = 1;
    i++; // skip opening {
    while (i < len && braceDepth > 0) {
      if (css[i] === '{') braceDepth++;
      if (css[i] === '}') braceDepth--;
      if (braceDepth > 0) block += css[i];
      i++;
    }

    // Decide how to handle this block
    if (selector.startsWith('@keyframes') || selector.startsWith('@-webkit-keyframes')) {
      // Don't scope keyframes
      result.push(`${selector}{${block}}`);
    } else if (selector.startsWith('@media') || selector.startsWith('@supports')) {
      // Recursively scope inside @media
      result.push(`${selector}{${scopeCSS(block, scopeId)}}`);
    } else if (selector === ':root') {
      // Keep :root as-is
      result.push(`:root{${block}}`);
    } else if (!selector) {
      // Empty selector, skip
    } else {
      // Regular selector — scope it
      const scoped = selector.split(',').map(s => {
        s = s.trim();
        if (!s) return s;
        // Skip broken/orphan selectors (ending with - or containing only a fragment)
        if (/^[.#][\w-]*-$/.test(s)) return '';
        return `#${scopeId} ${s}`;
      }).filter(s => s).join(', ');
      if (scoped) result.push(`${scoped}{${block}}`);
    }
  }

  return result.join('\n');
}

/**
 * Scan a directory for HTML section files and return metadata.
 * Files are expected to follow the pattern: section-name.html
 */
function scanSections(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.html')).sort((a, b) => {
    const na = parseInt(a.match(/^(\d+)/)?.[1] || '0');
    const nb = parseInt(b.match(/^(\d+)/)?.[1] || '0');
    return na - nb;
  });
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
// ===== Folder management (page categorization) =====
const FOLDERS_PATH = path.join(PREVIEWS_DIR, '_folders.json');

function readFolders() {
  if (!fs.existsSync(FOLDERS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(FOLDERS_PATH, 'utf-8')); } catch(e) { return {}; }
}

function writeFolders(folders) {
  fs.writeFileSync(FOLDERS_PATH, JSON.stringify(folders, null, 2), 'utf-8');
}

router.get('/folders', verifyToken, (req, res) => {
  res.json({ folders: readFolders() });
});

router.put('/folders', verifyToken, requireRole('admin'), (req, res) => {
  const { folders } = req.body;
  if (!folders || typeof folders !== 'object') {
    return res.status(400).json({ error: 'Objet folders requis' });
  }
  writeFolders(folders);
  res.json({ success: true });
});

/**
 * POST /fix-villes-urls — Batch update all pages in the "Villes" folder
 * Sets urlPath to location-photobooth/{slug} if not already set
 */
router.post('/fix-villes-urls', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const folders = readFolders();
    const updated = [];

    for (const [slug, folder] of Object.entries(folders)) {
      if (folder !== 'Villes') continue;
      const previewDir = path.join(PREVIEWS_DIR, slug);
      if (!fs.existsSync(previewDir)) continue;

      const seoPath = path.join(previewDir, 'seo.json');
      let seo = {};
      if (fs.existsSync(seoPath)) {
        try { seo = JSON.parse(fs.readFileSync(seoPath, 'utf-8')); } catch(e) {}
      }

      // Extract city name from slug (remove common prefixes)
      const city = slug
        .replace(/^location-photobooth-/, '')
        .replace(/^photobooth-/, '')
        .replace(/^borne-photo-/, '');
      const newUrlPath = 'location-photobooth/' + city;

      if (seo.urlPath === newUrlPath) continue; // Already set

      const oldUrlPath = seo.urlPath || slug;
      seo.urlPath = newUrlPath;
      fs.writeFileSync(seoPath, JSON.stringify(seo, null, 2), 'utf-8');

      // Create 301 redirect from old URL
      if (oldUrlPath !== newUrlPath) {
        try {
          const supabase = require('../lib/supabase');
          const { data: existing } = await supabase
            .from('site_manager_redirections')
            .select('id')
            .eq('source_path', '/' + oldUrlPath + '/')
            .maybeSingle();
          if (existing) {
            await supabase
              .from('site_manager_redirections')
              .update({ target_path: '/' + newUrlPath + '/', status_code: 301, is_active: true })
              .eq('id', existing.id);
          } else {
            await supabase
              .from('site_manager_redirections')
              .insert({
                source_path: '/' + oldUrlPath + '/',
                target_path: '/' + newUrlPath + '/',
                status_code: 301,
                is_active: true,
                hit_count: 0,
                created_by: req.user.id
              });
          }
        } catch(e) { console.error('[Pages] Redirect for', slug, e.message); }
      }

      updated.push({ slug, oldUrl: '/' + oldUrlPath + '/', newUrl: '/' + newUrlPath + '/' });
    }

    await logAudit({
      userId: req.user.id,
      action: 'batch_fix_villes_urls',
      entityType: 'page',
      entityId: 'villes',
      details: { count: updated.length, updated },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, updated, count: updated.length });
  } catch (err) {
    console.error('[Pages] Fix villes URLs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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
        urlPath: '/',
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
      if (entry.name.startsWith('.')) continue; // Skip .history and other hidden dirs
      const slug = entry.name;
      const previewDir = path.join(PREVIEWS_DIR, slug);
      const sections = scanSections(previewDir);

      if (sections.length === 0) continue;

      const latestModified = sections.reduce((max, s) =>
        new Date(s.lastModified) > new Date(max) ? s.lastModified : max,
        sections[0]?.lastModified || new Date().toISOString()
      );

      // Read urlPath from seo.json
      let pageSeo = {};
      const pageSeoPath = path.join(previewDir, 'seo.json');
      if (fs.existsSync(pageSeoPath)) {
        try { pageSeo = JSON.parse(fs.readFileSync(pageSeoPath, 'utf-8')); } catch(e) {}
      }

      pages.push({
        slug,
        name: pageSeo.title || slug.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()),
        urlPath: pageSeo.urlPath ? '/' + pageSeo.urlPath.replace(/^\//, '') : '/' + slug,
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
 * POST /create — Create a new page with a default hero section
 * Body: { slug: "my-page", name: "Ma page" }
 * RBAC: admin only
 */
router.post('/create', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { slug, name, urlPath } = req.body;
    if (!slug || !slug.match(/^[a-z0-9-]+$/)) {
      return res.status(400).json({ error: 'Slug invalide (lettres minuscules, chiffres et tirets uniquement)' });
    }

    const pageDir = path.join(PREVIEWS_DIR, slug);
    if (fs.existsSync(pageDir)) {
      return res.status(409).json({ error: 'Cette page existe deja' });
    }

    fs.mkdirSync(pageDir, { recursive: true });

    // Create a default hero section with proper SEO structure
    const pageName = name || slug.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
    const heroHtml = `<style>
.new-page-hero {
  background: linear-gradient(135deg, #2d0535 0%, #1a0a22 100%);
  color: #fff;
  padding: 120px 40px 80px;
  text-align: center;
  font-family: 'Raleway', sans-serif;
}
.new-page-hero h1 {
  font-size: 50px;
  font-weight: 900;
  font-style: italic;
  line-height: 1.1;
  margin: 0 0 16px;
}
.new-page-hero h1 .accent {
  background: linear-gradient(135deg, #E51981, #ff6eb4);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.new-page-hero p {
  font-size: 18px;
  color: rgba(255,255,255,0.7);
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
}
.new-page-hero .hero-cta {
  display: inline-block;
  margin-top: 24px;
  padding: 14px 36px;
  background: linear-gradient(135deg, #E51981, #ff3fac);
  color: #fff;
  font-family: 'Raleway', sans-serif;
  font-size: 15px;
  font-weight: 700;
  border-radius: 50px;
  text-decoration: none;
  box-shadow: 0 6px 24px rgba(229,25,129,0.35);
  transition: all 0.3s ease;
}
.new-page-hero .hero-cta:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 32px rgba(229,25,129,0.5);
}
@media (max-width: 768px) {
  .new-page-hero { padding: 80px 20px 60px; }
  .new-page-hero h1 { font-size: 32px; }
  .new-page-hero p { font-size: 16px; }
}
</style>
<section class="new-page-hero" aria-label="${pageName}">
  <h1>${pageName}</h1>
  <p>Description de la page. Cliquez pour modifier.</p>
  <a href="/reservation/" class="hero-cta">Obtenir un devis gratuit</a>
</section>
`;
    fs.writeFileSync(path.join(pageDir, '01-hero.html'), heroHtml, 'utf-8');

    // Create comprehensive SEO config
    const cleanName = pageName.replace(/&amp;/g, '&');
    const seoData = {
      title: `${cleanName} | Shootnbox - Location Photobooth`,
      description: `${cleanName} - Shootnbox, specialiste de la location de photobooth et borne photo pour vos evenements.`,
      ogTitle: `${cleanName} - Shootnbox`,
      ogDescription: `${cleanName} - Decouvrez nos solutions de location de photobooth pour mariages, entreprises et evenements.`,
      ogImage: '/site-images/logo/shootnbox-logo-new-1.webp',
      noindex: false,
      schemaType: 'WebPage',
      sitemap: {
        include: true,
        priority: '0.7',
        changefreq: 'monthly'
      }
    };
    if (urlPath) {
      seoData.urlPath = urlPath.replace(/^\/+|\/+$/g, '').toLowerCase();
    }
    fs.writeFileSync(path.join(pageDir, 'seo.json'), JSON.stringify(seoData, null, 2), 'utf-8');

    await logAudit({
      userId: req.user.id,
      action: 'page_create',
      entityType: 'page',
      entityId: slug,
      details: { name: pageName },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({ success: true, slug, name: pageName });
  } catch (err) {
    console.error('[Pages] Create error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la creation de la page' });
  }
});

/**
 * POST /:slug/duplicate — Duplicate a page with a new slug/name
 */
router.post('/:slug/duplicate', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const sourceSlug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const { newSlug, newName } = req.body;

    if (!newSlug || !newSlug.match(/^[a-z0-9-]+$/)) {
      return res.status(400).json({ error: 'Slug invalide (lettres minuscules, chiffres et tirets uniquement)' });
    }

    const sourceDir = path.join(PREVIEWS_DIR, sourceSlug);
    if (!fs.existsSync(sourceDir)) {
      return res.status(404).json({ error: 'Page source introuvable' });
    }

    const destDir = path.join(PREVIEWS_DIR, newSlug);
    if (fs.existsSync(destDir)) {
      return res.status(409).json({ error: 'Une page avec ce slug existe deja' });
    }

    // Copy the entire directory
    fs.mkdirSync(destDir, { recursive: true });
    const files = fs.readdirSync(sourceDir);
    for (const file of files) {
      const srcFile = path.join(sourceDir, file);
      const destFile = path.join(destDir, file);
      const stat = fs.statSync(srcFile);
      if (stat.isFile()) {
        fs.copyFileSync(srcFile, destFile);
      } else if (stat.isDirectory() && file !== '.history') {
        // Copy subdirectories (except history)
        fs.cpSync(srcFile, destFile, { recursive: true });
      }
    }

    // Update SEO title if seo.json exists
    const seoPath = path.join(destDir, 'seo.json');
    if (fs.existsSync(seoPath)) {
      try {
        const seo = JSON.parse(fs.readFileSync(seoPath, 'utf-8'));
        seo.title = newName || newSlug;
        fs.writeFileSync(seoPath, JSON.stringify(seo, null, 2), 'utf-8');
      } catch (_) {}
    }

    await logAudit({
      userId: req.user.id,
      action: 'page_duplicate',
      entityType: 'page',
      entityId: newSlug,
      details: { source: sourceSlug, name: newName || newSlug },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({ success: true, slug: newSlug, name: newName || newSlug });
  } catch (err) {
    console.error('[Pages] Duplicate error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la duplication de la page' });
  }
});

/**
 * DELETE /:slug — Delete an entire page (preview + published)
 * RBAC: admin only
 */
router.delete('/:slug', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');

    if (slug === 'home') {
      return res.status(400).json({ error: 'Impossible de supprimer la page d\'accueil' });
    }

    const previewDir = path.join(PREVIEWS_DIR, slug);
    const publicDir = path.join(PUBLIC_DIR, slug);

    if (!fs.existsSync(previewDir)) {
      return res.status(404).json({ error: 'Page non trouvee' });
    }

    // Remove preview directory
    fs.rmSync(previewDir, { recursive: true, force: true });

    // Remove published directory if exists
    if (fs.existsSync(publicDir)) {
      fs.rmSync(publicDir, { recursive: true, force: true });
    }

    await logAudit({
      userId: req.user.id,
      action: 'page_delete',
      entityType: 'page',
      entityId: slug,
      details: {},
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Page supprimee' });
  } catch (err) {
    console.error('[Pages] Delete page error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la suppression de la page' });
  }
});

/**
 * POST /:slug/rename — Rename a page (slug + name)
 * Updates: directories, seo.json, build.js config, redirections (301), sitemap, scheduled publishes
 * RBAC: admin only
 */
router.post('/:slug/rename', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const oldSlug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const { newSlug, newName } = req.body;

    if (!newSlug || !newSlug.match(/^[a-z0-9-]+$/)) {
      return res.status(400).json({ error: 'Slug invalide (lettres minuscules, chiffres et tirets uniquement)' });
    }

    if (oldSlug === 'home') {
      return res.status(400).json({ error: 'Impossible de renommer la page d\'accueil' });
    }

    // No-op check removed — always allow rename even if only name changes

    const oldPreviewDir = path.join(PREVIEWS_DIR, oldSlug);
    if (!fs.existsSync(oldPreviewDir)) {
      return res.status(404).json({ error: 'Page non trouvee' });
    }

    const slugChanged = oldSlug !== newSlug;

    if (slugChanged) {
      const newPreviewDir = path.join(PREVIEWS_DIR, newSlug);
      if (fs.existsSync(newPreviewDir)) {
        return res.status(409).json({ error: 'Une page avec ce slug existe deja' });
      }

      // 1. Rename preview directory
      fs.renameSync(oldPreviewDir, newPreviewDir);

      // 2. Rename published directory if exists
      const oldPublicDir = path.join(PUBLIC_DIR, oldSlug);
      const newPublicDir = path.join(PUBLIC_DIR, newSlug);
      if (fs.existsSync(oldPublicDir)) {
        fs.renameSync(oldPublicDir, newPublicDir);
      }

      // 3. Clean up old CSS/JS files from public/site/
      const oldCss = path.join(PUBLIC_DIR, `styles-${oldSlug}.css`);
      const oldJs = path.join(PUBLIC_DIR, `scripts-${oldSlug}.js`);
      if (fs.existsSync(oldCss)) fs.unlinkSync(oldCss);
      if (fs.existsSync(oldJs)) fs.unlinkSync(oldJs);

      // 4. Update build.js — replace old slug references with new slug
      const buildPath = path.join(__dirname, '..', 'scripts', 'build.js');
      if (fs.existsSync(buildPath)) {
        let buildContent = fs.readFileSync(buildPath, 'utf-8');
        // Replace slug in page config
        buildContent = buildContent.replace(
          new RegExp(`slug:\\s*'${oldSlug}'`, 'g'),
          `slug: '${newSlug}'`
        );
        // Replace output path
        buildContent = buildContent.replace(
          new RegExp(`public/site/${oldSlug}/`, 'g'),
          `public/site/${newSlug}/`
        );
        // Replace ogUrl
        buildContent = buildContent.replace(
          new RegExp(`/${oldSlug}/`, 'g'),
          `/${newSlug}/`
        );
        // Replace previewDir path
        buildContent = buildContent.replace(
          new RegExp(`'${oldSlug}'\\)`, 'g'),
          `'${newSlug}')`
        );
        fs.writeFileSync(buildPath, buildContent, 'utf-8');
      }

      // 5. Create 301 redirect from old URL to new URL
      try {
        const supabase = require('../lib/supabase');
        const oldPath = `/${oldSlug}/`;
        const newPath = `/${newSlug}/`;

        // Check if redirect already exists for this source
        const { data: existing } = await supabase
          .from('site_manager_redirections')
          .select('id')
          .eq('source_path', oldPath)
          .maybeSingle();

        if (existing) {
          // Update existing redirect
          await supabase
            .from('site_manager_redirections')
            .update({ target_path: newPath, status_code: 301, is_active: true })
            .eq('id', existing.id);
        } else {
          // Create new redirect
          await supabase
            .from('site_manager_redirections')
            .insert({
              source_path: oldPath,
              target_path: newPath,
              status_code: 301,
              is_active: true,
              hit_count: 0,
              created_by: req.user.id
            });
        }

        // Also redirect without trailing slash
        const { data: existingNoSlash } = await supabase
          .from('site_manager_redirections')
          .select('id')
          .eq('source_path', `/${oldSlug}`)
          .maybeSingle();

        if (existingNoSlash) {
          await supabase
            .from('site_manager_redirections')
            .update({ target_path: newPath, status_code: 301, is_active: true })
            .eq('id', existingNoSlash.id);
        } else {
          await supabase
            .from('site_manager_redirections')
            .insert({
              source_path: `/${oldSlug}`,
              target_path: newPath,
              status_code: 301,
              is_active: true,
              hit_count: 0,
              created_by: req.user.id
            });
        }
      } catch (dbErr) {
        console.error('[Pages] Redirect creation warning:', dbErr.message);
        // Non-blocking: page is renamed even if redirect fails
      }

      // 6. Update scheduled publishes in DB
      try {
        const supabase = require('../lib/supabase');
        await supabase
          .from('site_manager_scheduled_publishes')
          .update({ page_slug: newSlug })
          .eq('page_slug', oldSlug)
          .eq('status', 'pending');
      } catch (dbErr) {
        console.error('[Pages] Scheduled publish update warning:', dbErr.message);
      }
    }

    // 7. Update SEO title/name in seo.json (create if missing)
    const targetDir = path.join(PREVIEWS_DIR, slugChanged ? newSlug : oldSlug);
    if (newName) {
      const seoPath = path.join(targetDir, 'seo.json');
      let seo = {};
      if (fs.existsSync(seoPath)) {
        try { seo = JSON.parse(fs.readFileSync(seoPath, 'utf-8')); } catch (_) {}
      }
      seo.title = newName;
      if (!seo.ogTitle || seo.ogTitle === seo.title) seo.ogTitle = newName;
      fs.writeFileSync(seoPath, JSON.stringify(seo, null, 2), 'utf-8');
      console.log('[Pages] Rename: updated seo.json title to', newName, 'at', seoPath);
    }

    // 8. Regenerate sitemap
    try {
      execSync(`node -e "
        const http = require('http');
        http.get('http://localhost:${process.env.PORT || 3000}/api/seo/sitemap', () => {});
      "`);
    } catch (_) {}

    await logAudit({
      userId: req.user.id,
      action: 'page_rename',
      entityType: 'page',
      entityId: newSlug,
      details: { oldSlug, newSlug, newName, slugChanged, redirect301: slugChanged },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      oldSlug,
      newSlug,
      newName: newName || newSlug,
      redirect301: slugChanged
    });
  } catch (err) {
    console.error('[Pages] Rename error:', err.message);
    res.status(500).json({ error: 'Erreur lors du renommage: ' + err.message });
  }
});

/**
 * POST /:slug/url — Change the public URL path of a page
 * Body: { urlPath: "location-photobooth/paris" }
 * Creates 301 redirect from old URL to new URL
 * RBAC: admin only
 */
router.post('/:slug/url', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    let { urlPath } = req.body;

    if (!urlPath || typeof urlPath !== 'string') {
      return res.status(400).json({ error: 'urlPath requis' });
    }

    // Normalize: remove leading/trailing slashes, validate chars
    urlPath = urlPath.replace(/^\/+|\/+$/g, '').toLowerCase();
    if (!urlPath.match(/^[a-z0-9][a-z0-9\/-]*[a-z0-9]$/) && urlPath.length > 1) {
      return res.status(400).json({ error: 'URL invalide (lettres minuscules, chiffres, tirets et slashes)' });
    }

    const previewDir = slug === 'home' ? PREVIEWS_DIR : path.join(PREVIEWS_DIR, slug);
    if (!fs.existsSync(previewDir)) {
      return res.status(404).json({ error: 'Page non trouvee' });
    }

    // Read current seo.json
    const seoPath = slug === 'home'
      ? path.join(PREVIEWS_DIR, 'seo-home.json')
      : path.join(previewDir, 'seo.json');

    let seo = {};
    if (fs.existsSync(seoPath)) {
      try { seo = JSON.parse(fs.readFileSync(seoPath, 'utf-8')); } catch(e) {}
    }

    const oldUrlPath = seo.urlPath || (slug === 'home' ? '' : slug);
    seo.urlPath = urlPath;
    fs.writeFileSync(seoPath, JSON.stringify(seo, null, 2), 'utf-8');

    // Create 301 redirect if URL changed
    if (oldUrlPath && oldUrlPath !== urlPath) {
      try {
        const supabase = require('../lib/supabase');
        const oldPath = '/' + oldUrlPath + '/';
        const newPath = '/' + urlPath + '/';

        const { data: existing } = await supabase
          .from('site_manager_redirections')
          .select('id')
          .eq('source_path', oldPath)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('site_manager_redirections')
            .update({ target_path: newPath, status_code: 301, is_active: true })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('site_manager_redirections')
            .insert({
              source_path: oldPath,
              target_path: newPath,
              status_code: 301,
              is_active: true,
              hit_count: 0,
              created_by: req.user.id
            });
        }
      } catch (dbErr) {
        console.error('[Pages] URL redirect warning:', dbErr.message);
      }
    }

    // Update build.js if page has an entry there
    const buildPath = path.join(__dirname, '..', 'scripts', 'build.js');
    if (fs.existsSync(buildPath) && oldUrlPath !== urlPath) {
      let buildContent = fs.readFileSync(buildPath, 'utf-8');
      // Update output path
      if (oldUrlPath && oldUrlPath !== 'home') {
        const oldOutput = `public/site/${oldUrlPath.replace(/\//g, '/')}/`;
        const newOutput = `public/site/${urlPath}/`;
        buildContent = buildContent.replace(
          new RegExp(oldOutput.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          newOutput
        );
        // Update ogUrl
        buildContent = buildContent.replace(
          new RegExp(`/${oldUrlPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'g'),
          `/${urlPath}/`
        );
      }
      fs.writeFileSync(buildPath, buildContent, 'utf-8');
    }

    await logAudit({
      userId: req.user.id,
      action: 'page_url_change',
      entityType: 'page',
      entityId: slug,
      details: { oldUrlPath: '/' + oldUrlPath, newUrlPath: '/' + urlPath },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      urlPath: '/' + urlPath,
      redirect301: oldUrlPath !== urlPath && !!oldUrlPath
    });
  } catch (err) {
    console.error('[Pages] URL change error:', err.message);
    res.status(500).json({ error: 'Erreur lors du changement d\'URL' });
  }
});

/**
 * POST /:slug/import-content — Import all sections from a source page into target page
 * Body: { sourceSlug, replace: true|false }
 * replace=true removes existing sections first, replace=false appends after existing ones
 * RBAC: admin only
 */
router.post('/:slug/import-content', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const targetSlug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const { sourceSlug, replace } = req.body;

    if (!sourceSlug) {
      return res.status(400).json({ error: 'sourceSlug requis' });
    }

    const sourceDir = path.join(PREVIEWS_DIR, sourceSlug.replace(/[^a-z0-9-]/gi, ''));
    const targetDir = path.join(PREVIEWS_DIR, targetSlug);

    if (!fs.existsSync(sourceDir)) {
      return res.status(404).json({ error: 'Page source introuvable' });
    }
    if (!fs.existsSync(targetDir)) {
      return res.status(404).json({ error: 'Page cible introuvable' });
    }

    // Get source sections (exclude header/footer)
    const sourceSections = scanSections(sourceDir).filter(s => {
      const n = s.file.toLowerCase();
      return !n.includes('header') && !n.includes('footer');
    });

    if (sourceSections.length === 0) {
      return res.status(400).json({ error: 'La page source n\'a aucune section a importer' });
    }

    // If replace mode, remove existing HTML sections from target
    if (replace) {
      const existingFiles = fs.readdirSync(targetDir).filter(f => f.endsWith('.html'));
      for (const f of existingFiles) {
        fs.unlinkSync(path.join(targetDir, f));
      }
    }

    // Determine starting number for new sections
    let startNum = 1;
    if (!replace) {
      const existingFiles = fs.readdirSync(targetDir).filter(f => f.endsWith('.html'));
      for (const f of existingFiles) {
        const num = parseInt(f.match(/^(\d+)/)?.[1] || '0');
        if (num >= startNum) startNum = num + 1;
      }
    }

    // Copy each source section with renumbered filenames
    const imported = [];
    for (let i = 0; i < sourceSections.length; i++) {
      const src = sourceSections[i];
      const srcNum = parseInt(src.file.match(/^(\d+)/)?.[1] || '0');
      const suffix = src.file.replace(/^\d+-?/, '');
      const newNum = String((startNum + i) * 10).padStart(2, '0');
      const newFile = newNum + '-' + suffix;

      fs.copyFileSync(path.join(sourceDir, src.file), path.join(targetDir, newFile));
      imported.push(newFile);
    }

    // Copy spacing data
    const sourceSpacingPath = path.join(sourceDir, '.spacing.json');
    if (fs.existsSync(sourceSpacingPath)) {
      let sourceSpacing = {};
      try { sourceSpacing = JSON.parse(fs.readFileSync(sourceSpacingPath, 'utf-8')); } catch(e) {}

      let targetSpacing = {};
      const targetSpacingPath = path.join(targetDir, '.spacing.json');
      if (!replace && fs.existsSync(targetSpacingPath)) {
        try { targetSpacing = JSON.parse(fs.readFileSync(targetSpacingPath, 'utf-8')); } catch(e) {}
      }

      // Map source spacing to new filenames
      for (let i = 0; i < sourceSections.length; i++) {
        const oldFile = sourceSections[i].file;
        if (sourceSpacing[oldFile]) {
          const suffix = oldFile.replace(/^\d+-?/, '');
          const newNum = String((startNum + i) * 10).padStart(2, '0');
          targetSpacing[newNum + '-' + suffix] = sourceSpacing[oldFile];
        }
      }

      fs.writeFileSync(path.join(targetDir, '.spacing.json'), JSON.stringify(targetSpacing, null, 2), 'utf-8');
    }

    await logAudit({
      userId: req.user.id,
      action: 'page_import_content',
      entityType: 'page',
      entityId: targetSlug,
      details: { source: sourceSlug, sections: imported, replace: !!replace },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, imported: imported, count: imported.length });
  } catch (err) {
    console.error('[Pages] Import content error:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'import du contenu' });
  }
});

/**
 * GET /:slug/content — Return assembled page content (all sections in order, no header/footer)
 */
router.get('/:slug/content', verifyToken, async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const previewDir = getPreviewDir(slug);

    if (!fs.existsSync(previewDir)) {
      return res.status(404).json({ error: 'Page non trouvee' });
    }

    const sections = scanSections(previewDir);

    // Load spacing
    let spacingData = {};
    const spacingPath = path.join(previewDir, '.spacing.json');
    if (fs.existsSync(spacingPath)) {
      try { spacingData = JSON.parse(fs.readFileSync(spacingPath, 'utf-8')); } catch(e) {}
    }

    // Assemble sections (skip header/footer files)
    const blocks = [];
    for (const section of sections) {
      const nameLower = section.file.toLowerCase();
      if (nameLower.includes('header') || nameLower.includes('footer')) continue;

      const content = fs.readFileSync(path.join(previewDir, section.file), 'utf-8');
      const spacing = spacingData[section.file] || 0;

      blocks.push({
        file: section.file,
        name: section.name,
        spacing: spacing,
        html: content
      });
    }

    res.json({ slug, blocks });
  } catch (err) {
    console.error('[Pages] Content error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la lecture du contenu' });
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
    let seo = {
      title: '', description: '', ogTitle: '', ogDescription: '',
      ogImage: '', canonical: '', robots: 'index, follow',
      customHeadScripts: '', customHeadCSS: '',
      schema: { type: '', customJsonLd: '', breadcrumbs: [], hasFaq: false },
      sitemap: { include: true, priority: '0.8', changefreq: 'monthly' },
      performance: { preloadImages: [], preconnect: [] }
    };
    const seoPath = slug === 'home'
      ? path.join(PREVIEWS_DIR, 'seo-home.json')
      : path.join(previewDir, 'seo.json');
    if (fs.existsSync(seoPath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(seoPath, 'utf-8'));
        seo = { ...seo, ...saved, schema: { ...seo.schema, ...(saved.schema || {}) }, sitemap: { ...seo.sitemap, ...(saved.sitemap || {}) }, performance: { ...seo.performance, ...(saved.performance || {}) } };
      } catch (e) { /* ignore */ }
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

    // Create history snapshot before applying changes
    try {
      const historyDir = path.join(previewDir, '.history');
      if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

      const snapshot = { timestamp: new Date().toISOString(), userId: req.user.id };
      // Capture current sections
      snapshot.sections = {};
      const sectionFiles = fs.readdirSync(previewDir).filter(f => f.endsWith('.html'));
      for (const f of sectionFiles) {
        snapshot.sections[f] = fs.readFileSync(path.join(previewDir, f), 'utf-8');
      }
      // Capture current SEO
      const currentSeoPath = slug === 'home' ? path.join(PREVIEWS_DIR, 'seo-home.json') : path.join(previewDir, 'seo.json');
      if (fs.existsSync(currentSeoPath)) {
        try { snapshot.seo = JSON.parse(fs.readFileSync(currentSeoPath, 'utf-8')); } catch(e) {}
      }

      const snapshotFile = Date.now() + '.json';
      fs.writeFileSync(path.join(historyDir, snapshotFile), JSON.stringify(snapshot), 'utf-8');

      // Prune: keep only last 30 snapshots
      const snapshots = fs.readdirSync(historyDir).filter(f => f.endsWith('.json')).sort();
      while (snapshots.length > 30) {
        fs.unlinkSync(path.join(historyDir, snapshots.shift()));
      }
    } catch (histErr) {
      console.error('[Pages] History snapshot error:', histErr.message);
    }

    // Apply text changes
    // Change ID format: "sectionFile:index:tag" (e.g., "hero.html:0:h1")
    if (changes && Array.isArray(changes)) {
      for (const change of changes) {
        if (!change.id || change.text === undefined) continue;

        const parts = change.id.split(':');
        if (parts.length < 3) continue;

        const sectionName = parts[0];
        const index = parseInt(parts[1], 10);
        const tag = parts[2];

        // Find the actual file matching the section name (e.g., "section" → "20-section.html")
        let filePath = path.join(previewDir, sectionName);
        if (!fs.existsSync(filePath)) {
          // Try with .html extension
          filePath = path.join(previewDir, sectionName + '.html');
        }
        if (!fs.existsSync(filePath)) {
          // Scan directory for a file matching the pattern *-{sectionName}.html
          const allFiles = fs.readdirSync(previewDir).filter(f => f.endsWith('.html'));
          const match = allFiles.find(f => {
            const name = f.replace(/^\d+-/, '').replace('.html', '');
            return name === sectionName;
          });
          if (match) filePath = path.join(previewDir, match);
        }
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

    // Save SEO data with validation (Point 8) — Guardian 1: Save
    const seoWarnings = [];
    if (seo) {
      const seoErrors = validateSeoData(seo);
      if (seoErrors.length > 0) {
        return res.status(400).json({ error: 'Donnees SEO invalides', details: seoErrors });
      }
      const seoPath = slug === 'home'
        ? path.join(PREVIEWS_DIR, 'seo-home.json')
        : path.join(previewDir, 'seo.json');
      let existing = {};
      if (fs.existsSync(seoPath)) {
        try { existing = JSON.parse(fs.readFileSync(seoPath, 'utf-8')); } catch {}
      }
      const merged = { ...existing, ...seo, lastModifiedAt: new Date().toISOString() };
      if (req.user) merged.lastModifiedBy = req.user.username || req.user.email || 'admin';
      fs.writeFileSync(seoPath, JSON.stringify(merged, null, 2), 'utf-8');

      // Guardian 1: Coherence checks after save
      if (merged.title && merged.title.length > 60) seoWarnings.push(`Title trop long (${merged.title.length}/60 chars)`);
      if (merged.title && merged.title.length < 20) seoWarnings.push(`Title trop court (${merged.title.length} chars)`);
      if (merged.description && merged.description.length > 160) seoWarnings.push(`Description trop longue (${merged.description.length}/160 chars)`);
      if (!merged.description || merged.description.length < 20) seoWarnings.push('Description SEO manquante ou trop courte');
      if (!merged.ogTitle) seoWarnings.push('OG Title manquant');
      if (!merged.ogDescription) seoWarnings.push('OG Description manquante');
      if (!merged.ogImage) seoWarnings.push('OG Image manquante');
      if (!merged.schemaType) seoWarnings.push('Type de schema JSON-LD non defini');
    }

    // Guardian 1: Content checks
    const htmlFiles = fs.readdirSync(previewDir).filter(f => f.endsWith('.html'));
    let allContent = '';
    for (const f of htmlFiles) allContent += fs.readFileSync(path.join(previewDir, f), 'utf-8');
    const h1Count = (allContent.match(/<h1[\s>]/gi) || []).length;
    if (h1Count === 0) seoWarnings.push('CRITIQUE : Aucun H1 dans la page — Google ne pourra pas identifier le sujet principal');
    if (h1Count > 1) seoWarnings.push(`${h1Count} balises H1 detectees — il doit y en avoir exactement 1`);
    const imgs = allContent.match(/<img\s[^>]*>/gi) || [];
    const noAlt = imgs.filter(i => !i.includes('alt=')).length;
    if (noAlt > 0) seoWarnings.push(`${noAlt} image(s) sans attribut alt`);
    const textContent = allContent.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = textContent.split(/\s+/).filter(w => w.length > 1).length;
    if (wordCount < 100) seoWarnings.push(`Contenu tres faible (${wordCount} mots) — risque de page "thin content"`);

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

    res.json({ success: true, message: 'Page sauvegardee', seoWarnings });
  } catch (err) {
    console.error('[Pages] Save error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde' });
  }
});

/**
 * POST /:slug/add-section — Add a new section to a page
 * Body: { html: "<section>...</section>", position: 3 }
 * RBAC: admin only
 */
router.post('/:slug/add-section', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const previewDir = getPreviewDir(slug);

    if (!fs.existsSync(previewDir)) {
      return res.status(404).json({ error: 'Page non trouvee' });
    }

    let { html, position } = req.body;
    if (!html || typeof html !== 'string') {
      return res.status(400).json({ error: 'Le champ "html" est requis' });
    }

    // Clean document wrappers if pasted as full HTML document
    html = html.replace(/<!DOCTYPE[^>]*>/gi, '');
    html = html.replace(/<\/?html[^>]*>/gi, '');
    html = html.replace(/<head>[\s\S]*?<\/head>/gi, (match) => {
      const styles = match.match(/<style[\s\S]*?<\/style>/gi) || [];
      return styles.join('\n');
    });
    html = html.replace(/<\/?body[^>]*>/gi, '');
    // Strip dangerous wildcard resets with !important on margin/padding
    html = html.replace(/([\w.-]*\s*\*\s*,\s*[\w.-]*\s*\*::before\s*,\s*[\w.-]*\s*\*::after\s*\{)([^}]*)(\})/gi, (match, sel, rules, close) => {
      const cleaned = rules
        .replace(/margin\s*:\s*0\s*!important\s*;?/gi, '')
        .replace(/padding\s*:\s*0\s*!important\s*;?/gi, '')
        .trim();
      return cleaned ? sel + ' ' + cleaned + ' ' + close : '';
    });

    // Get existing section files (sorted numerically by prefix)
    const existingFiles = fs.readdirSync(previewDir)
      .filter(f => f.endsWith('.html'))
      .sort((a, b) => {
        const na = parseInt(a.match(/^(\d+)/)?.[1] || '0');
        const nb = parseInt(b.match(/^(\d+)/)?.[1] || '0');
        return na - nb;
      });

    // Determine the new file name based on position
    // Find the highest number prefix
    let maxNum = 0;
    existingFiles.forEach(f => {
      const match = f.match(/^(\d+)-/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    });

    // Renumber files to insert at the right position
    // Position 0 = before first section, position N = after Nth section
    const pos = Math.min(Math.max(0, position || 0), existingFiles.length);

    // Renumber all files with gaps of 10 to allow insertion
    const renumberPlan = [];
    let newNum = 10;
    for (let i = 0; i < existingFiles.length; i++) {
      if (i === pos) {
        // This is where the new section goes
        renumberPlan.push({ file: null, num: newNum, isNew: true });
        newNum += 10;
      }
      renumberPlan.push({ file: existingFiles[i], num: newNum, isNew: false });
      newNum += 10;
    }
    // If position is at the end
    if (pos >= existingFiles.length) {
      renumberPlan.push({ file: null, num: newNum, isNew: true });
    }

    // Execute renaming safely: first rename to temp names, then to final names
    // This prevents overwriting when names overlap (e.g., 20→30 while 30 still exists)
    let newFileName = '';
    const tempSuffix = '.__gds_temp__';

    // Step 1: rename existing files to temp names
    for (const item of renumberPlan) {
      if (!item.isNew && item.file) {
        const numStr = String(item.num).padStart(2, '0');
        const finalName = numStr + '-' + item.file.replace(/^\d+-/, '');
        if (finalName !== item.file) {
          const tempName = item.file + tempSuffix;
          fs.renameSync(path.join(previewDir, item.file), path.join(previewDir, tempName));
          item._tempName = tempName;
          item._finalName = finalName;
        }
      }
    }

    // Step 2: rename temp files to final names + create new file
    for (const item of renumberPlan) {
      const numStr = String(item.num).padStart(2, '0');
      if (item.isNew) {
        newFileName = numStr + '-section.html';
        fs.writeFileSync(path.join(previewDir, newFileName), html, 'utf-8');
      } else if (item._tempName) {
        fs.renameSync(path.join(previewDir, item._tempName), path.join(previewDir, item._finalName));
      }
    }

    await logAudit({
      userId: req.user.id,
      action: 'section_add',
      entityType: 'page',
      entityId: slug,
      details: { file: newFileName, position: pos, size: html.length },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({ success: true, file: newFileName, position: pos });
  } catch (err) {
    console.error('[Pages] Add section error:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'ajout de la section' });
  }
});

/**
 * DELETE /:slug/delete-section — Remove a section from a page
 * Body: { file: "20-section.html" }
 * RBAC: admin only
 */
router.delete('/:slug/delete-section', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const previewDir = getPreviewDir(slug);

    if (!fs.existsSync(previewDir)) {
      return res.status(404).json({ error: 'Page non trouvee' });
    }

    const { file } = req.body;
    if (!file || typeof file !== 'string') {
      return res.status(400).json({ error: 'Le champ "file" est requis' });
    }

    // Security: prevent path traversal
    const sanitizedFile = path.basename(file);
    if (!sanitizedFile.endsWith('.html')) {
      return res.status(400).json({ error: 'Fichier invalide' });
    }

    const filePath = path.join(previewDir, sanitizedFile);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Section non trouvee' });
    }

    // Don't allow deleting the last section
    const remainingFiles = fs.readdirSync(previewDir)
      .filter(f => f.endsWith('.html') && !f.includes('header') && !f.includes('footer'));
    if (remainingFiles.length <= 1) {
      return res.status(400).json({ error: 'Impossible de supprimer la derniere section' });
    }

    // Read content before deleting (for audit)
    const content = fs.readFileSync(filePath, 'utf-8');
    const contentSize = content.length;

    // Delete the file
    fs.unlinkSync(filePath);

    await logAudit({
      userId: req.user.id,
      action: 'section_delete',
      entityType: 'page',
      entityId: slug,
      details: { file: sanitizedFile, size: contentSize },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Section supprimee', file: sanitizedFile });
  } catch (err) {
    console.error('[Pages] Delete section error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la suppression de la section' });
  }
});

/**
 * GET /:slug/section/:file — Get the raw HTML content of a section
 */
router.get('/:slug/section/:file', verifyToken, async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const file = path.basename(req.params.file);
    if (!file.endsWith('.html')) {
      return res.status(400).json({ error: 'Fichier invalide' });
    }

    const previewDir = getPreviewDir(slug);
    const filePath = path.join(previewDir, file);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Section non trouvee' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ file, content });
  } catch (err) {
    console.error('[Pages] Get section error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la lecture de la section' });
  }
});

/**
 * POST /:slug/spacing — Save spacing between sections
 * Body: { file: "30-section.html", spacing: 40 }
 */
router.post('/:slug/spacing', verifyToken, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const { file, spacing } = req.body;
    if (!file || spacing === undefined) {
      return res.status(400).json({ error: 'file et spacing requis' });
    }

    const previewDir = getPreviewDir(slug);
    const spacingPath = path.join(previewDir, '.spacing.json');

    let spacingData = {};
    if (fs.existsSync(spacingPath)) {
      try { spacingData = JSON.parse(fs.readFileSync(spacingPath, 'utf-8')); } catch(e) {}
    }

    spacingData[file] = parseInt(spacing) || 0;
    fs.writeFileSync(spacingPath, JSON.stringify(spacingData, null, 2), 'utf-8');

    res.json({ success: true });
  } catch (err) {
    console.error('[Pages] Spacing error:', err.message);
    res.status(500).json({ error: 'Erreur' });
  }
});

/**
 * PUT /:slug/section/:file — Update the raw HTML content of a section
 * Body: { content: "<style>...</style><section>...</section>" }
 * RBAC: admin + editor
 */
router.put('/:slug/section/:file', verifyToken, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const file = path.basename(req.params.file);
    if (!file.endsWith('.html')) {
      return res.status(400).json({ error: 'Fichier invalide' });
    }

    let { content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Le champ "content" est requis' });
    }

    const previewDir = getPreviewDir(slug);
    const filePath = path.join(previewDir, file);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Section non trouvee' });
    }

    // Clean document wrappers if pasted as full HTML document
    content = content.replace(/<!DOCTYPE[^>]*>/gi, '');
    content = content.replace(/<\/?html[^>]*>/gi, '');
    content = content.replace(/<head>[\s\S]*?<\/head>/gi, (match) => {
      // Extract only <style> blocks from <head>, discard the rest
      const styles = match.match(/<style[\s\S]*?<\/style>/gi) || [];
      return styles.join('\n');
    });
    content = content.replace(/<\/?body[^>]*>/gi, '');
    // Strip dangerous wildcard resets with !important on margin/padding
    content = content.replace(/([\w.-]*\s*\*\s*,\s*[\w.-]*\s*\*::before\s*,\s*[\w.-]*\s*\*::after\s*\{)([^}]*)(\})/gi, (match, sel, rules, close) => {
      const cleaned = rules
        .replace(/margin\s*:\s*0\s*!important\s*;?/gi, '')
        .replace(/padding\s*:\s*0\s*!important\s*;?/gi, '')
        .trim();
      return cleaned ? sel + ' ' + cleaned + ' ' + close : '';
    });
    // Clean editor contamination before saving
    // Remove scoped CSS prefixes (#gds-s-xxx) that leaked from preview rendering
    content = content.replace(/#gds-s-\w+\s+/g, '');
    // Remove admin UI elements
    content = content.replace(/<div class="gds-tag-select">[\s\S]*?<\/div>/g, '');
    content = content.replace(/<div class="gds-ph-overlay">[\s\S]*?<\/div>/g, '');
    content = content.replace(/<div class="gds-section-actions">[\s\S]*?<\/div>/g, '');
    // Remove admin attributes
    content = content.replace(/\s*data-gds-edit="[^"]*"/g, '');
    content = content.replace(/\s*data-gds-section="[^"]*"/g, '');
    content = content.replace(/\s*data-gds-tag="[^"]*"/g, '');
    content = content.replace(/\s*data-gds-orig-tag="[^"]*"/g, '');
    content = content.replace(/\s*data-gds-img="[^"]*"/g, '');
    content = content.replace(/\s*tabindex="0"/g, '');
    content = content.replace(/\s*contenteditable="[^"]*"/g, '');

    fs.writeFileSync(filePath, content, 'utf-8');

    await logAudit({
      userId: req.user.id,
      action: 'section_code_update',
      entityType: 'page',
      entityId: slug,
      details: { file, size: content.length },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, file, size: content.length });
  } catch (err) {
    console.error('[Pages] Update section error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la mise a jour de la section' });
  }
});

/**
 * GET /:slug/history — List snapshots
 */
router.get('/:slug/history', verifyToken, async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const previewDir = getPreviewDir(slug);
    const historyDir = path.join(previewDir, '.history');

    if (!fs.existsSync(historyDir)) {
      return res.json({ history: [] });
    }

    const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json')).sort().reverse();
    const history = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(historyDir, f), 'utf-8'));
        return {
          id: f.replace('.json', ''),
          timestamp: data.timestamp,
          userId: data.userId,
          sectionsCount: Object.keys(data.sections || {}).length
        };
      } catch(e) { return null; }
    }).filter(Boolean);

    res.json({ history });
  } catch (err) {
    console.error('[Pages] History list error:', err.message);
    res.status(500).json({ error: 'Erreur' });
  }
});

/**
 * POST /:slug/history/:id/restore — Restore a snapshot
 * RBAC: admin only
 */
router.post('/:slug/history/:id/restore', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const snapshotId = req.params.id.replace(/[^0-9]/g, '');
    const previewDir = getPreviewDir(slug);
    const historyDir = path.join(previewDir, '.history');
    const snapshotPath = path.join(historyDir, snapshotId + '.json');

    if (!fs.existsSync(snapshotPath)) {
      return res.status(404).json({ error: 'Snapshot non trouve' });
    }

    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));

    // Create a snapshot of current state before restoring
    const currentSnapshot = { timestamp: new Date().toISOString(), userId: req.user.id, sections: {} };
    const currentFiles = fs.readdirSync(previewDir).filter(f => f.endsWith('.html'));
    for (const f of currentFiles) {
      currentSnapshot.sections[f] = fs.readFileSync(path.join(previewDir, f), 'utf-8');
    }
    fs.writeFileSync(path.join(historyDir, Date.now() + '.json'), JSON.stringify(currentSnapshot), 'utf-8');

    // Restore sections
    if (snapshot.sections) {
      // Delete current sections (except header/footer)
      for (const f of currentFiles) {
        if (!f.includes('header') && !f.includes('footer')) {
          fs.unlinkSync(path.join(previewDir, f));
        }
      }
      // Write snapshot sections
      for (const [file, content] of Object.entries(snapshot.sections)) {
        fs.writeFileSync(path.join(previewDir, file), content, 'utf-8');
      }
    }

    // Restore SEO
    if (snapshot.seo) {
      const seoPath = slug === 'home' ? path.join(PREVIEWS_DIR, 'seo-home.json') : path.join(previewDir, 'seo.json');
      fs.writeFileSync(seoPath, JSON.stringify(snapshot.seo, null, 2), 'utf-8');
    }

    await logAudit({
      userId: req.user.id,
      action: 'page_restore',
      entityType: 'page',
      entityId: slug,
      details: { snapshotId, timestamp: snapshot.timestamp },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Page restauree', restoredFrom: snapshot.timestamp });
  } catch (err) {
    console.error('[Pages] Restore error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la restauration' });
  }
});

/**
 * POST /:slug/publish — Build and publish the site
 * RBAC: admin only
 */
/**
 * GET /:slug/seo-audit — Run SEO validation on a page
 */
/**
 * Validate seo.json data — returns array of error strings. Empty = valid.
 */
function validateSeoData(data) {
  const errors = [];
  if (data.title !== undefined) {
    if (typeof data.title !== 'string') errors.push('Title doit etre une chaine');
    else if (data.title.length > 70) errors.push(`Title trop long (${data.title.length}/70 chars)`);
    else if (data.title.length > 0 && data.title.length < 10) errors.push(`Title trop court (${data.title.length} chars, min 10)`);
  }
  if (data.description !== undefined && typeof data.description === 'string') {
    if (data.description.length > 170) errors.push(`Description trop longue (${data.description.length}/170 chars)`);
  }
  if (data.ogImage && typeof data.ogImage === 'string' && !data.ogImage.startsWith('/') && !data.ogImage.startsWith('http')) {
    errors.push('OG Image doit commencer par / ou http');
  }
  if (data.schemaType && !['WebPage','Service','Product','FAQPage','Article','BlogPosting','LocalBusiness'].includes(data.schemaType)) {
    errors.push(`Schema type "${data.schemaType}" invalide`);
  }
  if (data.sitemap?.priority) {
    const p = parseFloat(data.sitemap.priority);
    if (isNaN(p) || p < 0 || p > 1) errors.push('Sitemap priority doit etre entre 0 et 1');
  }
  return errors;
}

/**
 * Validate editorial status transition
 */
const VALID_TRANSITIONS = {
  'draft': ['review'],
  'review': ['draft', 'validated'],
  'validated': ['published', 'draft'],
  'published': ['archived', 'draft'],
  'archived': ['draft']
};

router.get('/:slug/seo-audit', verifyToken, async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const previewDir = getPreviewDir(slug);
    if (!fs.existsSync(previewDir)) return res.status(404).json({ error: 'Page non trouvee' });

    // Read all section files
    const files = fs.readdirSync(previewDir).filter(f => f.endsWith('.html')).sort();
    let allHtml = '';
    for (const f of files) {
      allHtml += fs.readFileSync(path.join(previewDir, f), 'utf-8') + '\n';
    }

    // Read seo.json
    const seoPath = path.join(previewDir, 'seo.json');
    let seoData = {};
    if (fs.existsSync(seoPath)) {
      try { seoData = JSON.parse(fs.readFileSync(seoPath, 'utf-8')); } catch (e) {}
    }

    // ── Extract data ──
    const imgs = allHtml.match(/<img\s[^>]*>/gi) || [];
    const noAlt = imgs.filter(i => !i.includes('alt=')).length;
    const emptyAlt = imgs.filter(i => { const m = i.match(/alt=""/); return m && !i.includes('role="presentation"'); }).length;
    const noDims = imgs.filter(i => !i.includes('width=')).length;
    const h1s = (allHtml.match(/<h1[\s>]/gi) || []);
    const headings = [];
    const hRe = /<h([1-6])[\s>]/gi;
    let hm;
    while ((hm = hRe.exec(allHtml)) !== null) headings.push(parseInt(hm[1]));
    let hierOk = true;
    for (let i = 1; i < headings.length; i++) { if (headings[i] > headings[i-1] + 1) { hierOk = false; break; } }
    const textOnly = allHtml.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = textOnly.split(/\s+/).filter(w => w.length > 1).length;
    const intLinksOut = (allHtml.match(/<a\s[^>]*href="\/[^"]*"/gi) || []).length;
    const hiddenRules = (allHtml.match(/display:\s*none/gi) || []).length;
    const hasSemantic = /<section[\s>]/i.test(allHtml) || /<article[\s>]/i.test(allHtml);
    const hasAria = /aria-label/i.test(allHtml);

    // ── Categorized checks (Point 3) ──
    const categories = {
      indexation: { weight: 30, checks: [], score: 100 },
      contenu:    { weight: 25, checks: [], score: 100 },
      performance:{ weight: 20, checks: [], score: 100 },
      social:     { weight: 15, checks: [], score: 100 },
      accessibilite: { weight: 10, checks: [], score: 100 }
    };

    function addCheck(cat, rule, pass, detail, severity) {
      categories[cat].checks.push({ rule, pass, detail, severity, category: cat });
    }

    // INDEXATION
    addCheck('indexation', 'Title SEO', !!(seoData.title && seoData.title.length >= 20), seoData.title ? `${seoData.title.length} chars` : 'Manquant', 'error');
    addCheck('indexation', 'Meta description', !!(seoData.description && seoData.description.length >= 50), seoData.description ? `${seoData.description.length} chars` : 'Manquante', 'error');
    addCheck('indexation', 'Schema JSON-LD', !!seoData.schemaType, seoData.schemaType || 'Non defini', 'error');
    addCheck('indexation', 'Sitemap', seoData.sitemap?.include !== false && !seoData.noindex, seoData.noindex ? 'Page noindex' : 'Incluse', 'warning');
    addCheck('indexation', 'Canonical coherent', !seoData.urlPath || seoData.urlPath === slug, seoData.urlPath ? `urlPath: ${seoData.urlPath}` : 'OK (slug par defaut)', 'warning');

    // CONTENU
    addCheck('contenu', 'H1 unique', h1s.length === 1, h1s.length === 0 ? 'Aucun H1' : h1s.length > 1 ? `${h1s.length} H1` : 'OK', 'error');
    addCheck('contenu', 'Hierarchie headings', hierOk, hierOk ? 'OK' : 'Niveaux sautes', 'warning');
    addCheck('contenu', 'Contenu texte', wordCount >= 300, `${wordCount} mots`, 'warning');
    addCheck('contenu', 'Liens internes sortants', intLinksOut >= 3, `${intLinksOut} liens`, 'warning');
    addCheck('contenu', 'Contenu cache', hiddenRules <= 3, `${hiddenRules} display:none`, hiddenRules > 5 ? 'warning' : 'info');

    // PERFORMANCE
    addCheck('performance', 'Dimensions images', noDims === 0, noDims > 0 ? `${noDims} sans dimensions` : `${imgs.length} OK`, 'warning');
    addCheck('performance', 'Images total', imgs.length <= 30, `${imgs.length} images`, imgs.length > 30 ? 'warning' : 'info');

    // SOCIAL
    addCheck('social', 'OG Title', !!seoData.ogTitle, seoData.ogTitle ? 'OK' : 'Manquant', 'warning');
    addCheck('social', 'OG Description', !!seoData.ogDescription, seoData.ogDescription ? 'OK' : 'Manquante', 'warning');
    addCheck('social', 'OG Image', !!seoData.ogImage, seoData.ogImage ? 'OK' : 'Manquante', 'warning');

    // ACCESSIBILITE
    addCheck('accessibilite', 'Alt images', noAlt === 0, noAlt > 0 ? `${noAlt} sans alt` : `${imgs.length} OK`, 'error');
    addCheck('accessibilite', 'HTML semantique', hasSemantic, hasSemantic ? 'OK' : 'Manquant', 'warning');
    addCheck('accessibilite', 'ARIA labels', hasAria, hasAria ? 'OK' : 'Aucun aria-label', 'info');

    // Calculate per-category scores
    for (const [key, cat] of Object.entries(categories)) {
      const errs = cat.checks.filter(c => !c.pass && c.severity === 'error').length;
      const warns = cat.checks.filter(c => !c.pass && c.severity === 'warning').length;
      cat.score = Math.max(0, 100 - (errs * 25) - (warns * 10));
    }

    // Global weighted score
    let totalWeight = 0, weightedSum = 0;
    for (const cat of Object.values(categories)) {
      weightedSum += cat.score * cat.weight;
      totalWeight += cat.weight;
    }
    const score = Math.round(weightedSum / totalWeight);

    // ── Internal link suggestions (Point 7) ──
    const suggestions = [];
    const foldersPath = path.join(PREVIEWS_DIR, '_folders.json');
    let folders = {};
    try { folders = JSON.parse(fs.readFileSync(foldersPath, 'utf-8')); } catch {}
    const myFolder = folders[slug];
    if (myFolder) {
      const related = Object.entries(folders)
        .filter(([s, f]) => f === myFolder && s !== slug)
        .map(([s]) => s)
        .slice(0, 5);
      if (related.length) suggestions.push({ type: 'related_category', pages: related, reason: `Meme categorie "${myFolder}"` });
    }
    // Suggest by slug prefix
    const prefix = slug.split('-').slice(0, 2).join('-');
    if (prefix.length > 3) {
      const similarPages = fs.readdirSync(PREVIEWS_DIR)
        .filter(d => d.startsWith(prefix) && d !== slug && d !== '_shared' && !d.startsWith('_'))
        .slice(0, 5);
      if (similarPages.length) suggestions.push({ type: 'similar_slug', pages: similarPages, reason: `Prefix commun "${prefix}"` });
    }

    // All checks flat
    const allChecks = [];
    for (const cat of Object.values(categories)) allChecks.push(...cat.checks);
    const errors = allChecks.filter(c => !c.pass && c.severity === 'error').length;
    const warnings = allChecks.filter(c => !c.pass && c.severity === 'warning').length;

    res.json({ slug, score, errors, warnings, categories, checks: allChecks, suggestions, seoData, wordCount });
  } catch (err) {
    console.error('[Pages] SEO audit error:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'audit SEO' });
  }
});

/**
 * POST /:slug/status — Change editorial status (Point 9)
 */
router.post('/:slug/status', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const previewDir = getPreviewDir(slug);
    if (!fs.existsSync(previewDir)) return res.status(404).json({ error: 'Page non trouvee' });

    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status requis' });
    if (!['draft', 'review', 'validated', 'published', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Status invalide' });
    }

    // Read current seo.json
    const seoPath = path.join(previewDir, 'seo.json');
    let seoData = {};
    if (fs.existsSync(seoPath)) {
      try { seoData = JSON.parse(fs.readFileSync(seoPath, 'utf-8')); } catch {}
    }

    const currentStatus = seoData.status || 'draft';
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Transition "${currentStatus}" → "${status}" non autorisee. Transitions possibles: ${allowed.join(', ')}` });
    }

    // Gate: review → validated requires SEO score >= 60
    if (currentStatus === 'review' && status === 'validated') {
      // Quick audit
      const files = fs.readdirSync(previewDir).filter(f => f.endsWith('.html')).sort();
      let allHtml = '';
      for (const f of files) allHtml += fs.readFileSync(path.join(previewDir, f), 'utf-8') + '\n';

      const h1Count = (allHtml.match(/<h1[\s>]/gi) || []).length;
      const hasTitle = seoData.title && seoData.title.length >= 20;
      const hasDesc = seoData.description && seoData.description.length >= 50;
      const hasSchema = !!seoData.schemaType;
      let quickScore = 100;
      if (h1Count !== 1) quickScore -= 25;
      if (!hasTitle) quickScore -= 25;
      if (!hasDesc) quickScore -= 25;
      if (!hasSchema) quickScore -= 15;

      if (quickScore < 60) {
        return res.status(400).json({
          error: `Score SEO insuffisant (${quickScore}/100) pour passer en "validated". Minimum requis: 60.`,
          details: {
            h1: h1Count === 1 ? 'OK' : `${h1Count} H1 (besoin de 1)`,
            title: hasTitle ? 'OK' : 'Manquant ou < 20 chars',
            description: hasDesc ? 'OK' : 'Manquante ou < 50 chars',
            schema: hasSchema ? 'OK' : 'Schema type manquant'
          }
        });
      }
    }

    // Auto-actions on status change
    if (status === 'archived') {
      seoData.noindex = true;
      if (seoData.sitemap) seoData.sitemap.include = false;
    }
    if (status === 'draft' && currentStatus === 'archived') {
      seoData.noindex = false;
      if (seoData.sitemap) seoData.sitemap.include = true;
    }

    seoData.status = status;
    seoData.lastModifiedBy = req.user.username || req.user.email || 'admin';
    seoData.lastModifiedAt = new Date().toISOString();

    fs.writeFileSync(seoPath, JSON.stringify(seoData, null, 2), 'utf-8');

    await logAudit({
      userId: req.user.id,
      action: 'page_status_change',
      entityType: 'page',
      entityId: slug,
      details: { from: currentStatus, to: status },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, status, previousStatus: currentStatus });
  } catch (err) {
    console.error('[Pages] Status change error:', err.message);
    res.status(500).json({ error: 'Erreur lors du changement de statut' });
  }
});

router.post('/:slug/publish', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const previewDir = getPreviewDir(slug);
    const forcePublish = req.query.force === 'true' || req.body.force === true;

    if (!fs.existsSync(previewDir)) {
      return res.status(404).json({ error: 'Page non trouvee' });
    }

    // ── Guardian 2: Pre-publish SEO audit ──
    const seoPath = slug === 'home' ? path.join(PREVIEWS_DIR, 'seo-home.json') : path.join(previewDir, 'seo.json');
    let seoData = {};
    if (fs.existsSync(seoPath)) {
      try { seoData = JSON.parse(fs.readFileSync(seoPath, 'utf-8')); } catch {}
    }

    const htmlFiles = fs.readdirSync(previewDir).filter(f => f.endsWith('.html'));
    let allContent = '';
    for (const f of htmlFiles) allContent += fs.readFileSync(path.join(previewDir, f), 'utf-8');

    const publishErrors = [];
    const publishWarnings = [];

    // Critical errors (block publish unless forced)
    const h1Count = (allContent.match(/<h1[\s>]/gi) || []).length;
    if (h1Count === 0) publishErrors.push('Aucun H1 dans la page');
    if (h1Count > 1) publishErrors.push(`${h1Count} balises H1 (1 seule autorisee)`);
    if (!seoData.title || seoData.title.length < 10) publishErrors.push('Title SEO manquant ou trop court');
    if (!seoData.description || seoData.description.length < 20) publishErrors.push('Meta description manquante ou trop courte');

    // Warnings (shown but don't block)
    if (seoData.title && seoData.title.length > 60) publishWarnings.push(`Title trop long (${seoData.title.length}/60)`);
    if (seoData.description && seoData.description.length > 160) publishWarnings.push(`Description trop longue (${seoData.description.length}/160)`);
    if (!seoData.ogTitle) publishWarnings.push('OG Title manquant');
    if (!seoData.ogImage) publishWarnings.push('OG Image manquante');
    if (!seoData.schemaType) publishWarnings.push('Schema JSON-LD non defini');
    const imgs = allContent.match(/<img\s[^>]*>/gi) || [];
    const noAlt = imgs.filter(i => !i.includes('alt=')).length;
    if (noAlt > 0) publishWarnings.push(`${noAlt} image(s) sans alt`);
    const textOnly = allContent.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = textOnly.split(/\s+/).filter(w => w.length > 1).length;
    if (wordCount < 300) publishWarnings.push(`Contenu faible (${wordCount} mots, recommande 300+)`);

    // Block if critical errors and not forced
    if (publishErrors.length > 0 && !forcePublish) {
      return res.status(409).json({
        error: 'Publication bloquee — erreurs SEO critiques',
        publishErrors,
        publishWarnings,
        message: 'Corrigez les erreurs ou utilisez "Publier quand meme" pour ignorer.',
        canForce: true
      });
    }

    // Run the build script
    let buildOutput = '';
    try {
      buildOutput = execSync(`node ${BUILD_SCRIPT}`, {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf-8',
        timeout: 60000
      });
    } catch (buildErr) {
      console.error('[Pages] Build error:', buildErr.message);
      // Extract useful info from build output
      const stderr = buildErr.stderr || '';
      const stdout = buildErr.stdout || '';
      const buildReport = (stdout + stderr).split('\n').filter(l => l.includes('ERROR') || l.includes('WARN') || l.includes('SCORE')).join('\n');
      return res.status(500).json({
        error: 'Le build a echoue',
        details: buildReport || buildErr.message,
        buildOutput: (stdout + stderr).slice(-2000)
      });
    }

    // Extract SEO score from build output
    const scoreMatch = buildOutput.match(/SEO SCORE: (\d+)\/100/g) || [];
    const buildWarnings = (buildOutput.match(/SEO WARN: .+/g) || []).map(w => w.replace('SEO WARN: ', ''));

    await logAudit({
      userId: req.user.id,
      action: 'page_publish',
      entityType: 'page',
      entityId: slug,
      details: {
        forced: forcePublish,
        errorsIgnored: publishErrors.length,
        warningsCount: publishWarnings.length
      },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: forcePublish && publishErrors.length ? 'Page publiee avec warnings ignores' : 'Page publiee avec succes',
      publishErrors: forcePublish ? publishErrors : [],
      publishWarnings,
      buildWarnings,
      seoScores: scoreMatch,
      buildOutput: buildOutput.slice(-1500)
    });
  } catch (err) {
    console.error('[Pages] Publish error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la publication: ' + err.message });
  }
});

/**
 * GET /:slug/preview — Serve the current draft HTML
 * Query: ?edit=1 to inject inline editor scripts
 */
router.get('/:slug/preview', optionalAuth, async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const editMode = req.query.edit === '1' && req.user;
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

    // Inject blog CSS globally (not scoped) for blog pages
    if (slug.startsWith('blog-')) {
      const blogCssPath = path.join(__dirname, '..', 'public', 'css', 'blog-styles.css');
      if (fs.existsSync(blogCssPath)) {
        bodyContent += `<style>${fs.readFileSync(blogCssPath, 'utf-8')}</style>\n`;
      }
    }

    // Inject shared page background (halos, glows, transitions) if enabled
    if (config.sections?.background?.enabled !== false) {
      const bgPath = path.join(SHARED_DIR, 'page-background.html');
      if (fs.existsSync(bgPath)) {
        let bgHtml = fs.readFileSync(bgPath, 'utf-8');
        // Apply custom gradient from config if defined
        if (config.sections?.background?.gradient) {
          bgHtml = bgHtml.replace(/linear-gradient\(180deg[\s\S]*?\);\s*\n\}/m,
            config.sections.background.gradient + ';\n}');
        }
        // Hide glows if disabled
        if (config.sections?.background?.glows === false) {
          bgHtml = bgHtml.replace(/<div class="bg-glow[^>]*><\/div>/g, '');
        }
        // Hide pictos if disabled
        if (config.sections?.background?.pictos === false) {
          bgHtml = bgHtml.replace(/<svg class="bg-picto[\s\S]*?<\/svg>/g, '');
        }
        bodyContent += bgHtml + '\n';
      }
    }

    // Load spacing config
    let spacingData = {};
    const spacingPath = path.join(previewDir, '.spacing.json');
    if (fs.existsSync(spacingPath)) {
      try { spacingData = JSON.parse(fs.readFileSync(spacingPath, 'utf-8')); } catch(e) {}
    }

    // Page-specific sections (skip any header/footer files that might remain)
    let sectionScripts = '';
    let sectionStyles = '';
    for (const section of sections) {
      const nameLower = section.file.toLowerCase();
      if (nameLower.includes('header') || nameLower.includes('footer')) continue;
      let content = fs.readFileSync(path.join(previewDir, section.file), 'utf-8');

      // Check if this is a standalone section (has <body>, or has <style> with class-based rules)
      // Sections with their own <style> need CSS scoping even if <body> was stripped
      const isStandalone = /<body[^>]*>/i.test(content) || (/<style[^>]*>/i.test(content) && /\.[a-zA-Z][\w-]*\s*[\{,]/i.test(content));

      if (isStandalone) {
        // Standalone HTML doc: extract body, collect head+inline CSS, scope it
        const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        let headCSS = '';

        const headMatch = content.match(/<head[^>]*>([\s\S]*)<\/head>/i);
        if (headMatch) {
          const headStyles = headMatch[1].match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
          if (headStyles) {
            headCSS = headStyles.map(s => {
              const m = s.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
              return m ? m[1] : '';
            }).join('\n');
          }
        }
        content = bodyMatch ? bodyMatch[1].trim() : content;

        // Extract scripts
        content = content.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (match, js) => {
          if (js.trim()) sectionScripts += `<script>${js}</script>\n`;
          return '';
        });

        // Collect inline <style> from body
        let inlineCSS = '';
        content = content.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (match, css) => {
          inlineCSS += css + '\n';
          return '';
        });

        // Combine, clean, and scope CSS
        let allCSS = (headCSS + '\n' + inlineCSS).trim();
        allCSS = allCSS.replace(/body\s*\{[^}]*\}/gi, '');
        allCSS = allCSS.replace(/html\s*\{[^}]*\}/gi, '');
        allCSS = allCSS.replace(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{[^}]*\}/gi, '');
        // Strip scoped wildcard resets that use !important on margin/padding (breaks layout)
        // e.g. .snb-steps *, .snb-steps *::before, .snb-steps *::after { margin:0!important; padding:0!important; }
        allCSS = allCSS.replace(/[^{}]*\*\s*,\s*[^{}]*\*::before\s*,\s*[^{}]*\*::after\s*\{[^}]*\}/gi, (match) => {
          if (/margin\s*:\s*0\s*!important/i.test(match) || /padding\s*:\s*0\s*!important/i.test(match)) {
            // Keep only box-sizing from the rule, strip margin/padding !important
            const inner = match.match(/\{([^}]*)\}/);
            if (!inner) return '';
            const cleaned = inner[1]
              .replace(/margin\s*:\s*0\s*!important\s*;?/gi, '')
              .replace(/padding\s*:\s*0\s*!important\s*;?/gi, '')
              .trim();
            if (!cleaned) return '';
            const selector = match.match(/^([^{]*)\{/);
            return selector ? selector[1] + '{ ' + cleaned + ' }' : '';
          }
          return match;
        });
        // Strip CSS comments before scoping
        allCSS = allCSS.replace(/\/\*[\s\S]*?\*\//g, '');
        // Strip @import rules (no braces, breaks the scope parser)
        allCSS = allCSS.replace(/@import\s+[^;]+;/gi, '');

        const scopeId = 'gds-s-' + section.file.replace(/[^a-z0-9]/gi, '');

        // Auto-fix: if a section rule has max-width:1300px, move it to the wrapper
        // so the section content is constrained without needing a manual inner div
        let wrapperMaxWidth = '';
        allCSS = allCSS.replace(/(\.[a-zA-Z][\w-]*section[^{]*\{[^}]*?)max-width:\s*(1[23]\d{2}px)\s*;([^}]*?)margin:\s*0 auto\s*;/gi, (match, before, mw, after) => {
          wrapperMaxWidth = mw;
          return before + after;
        });

        if (allCSS.trim()) {
          allCSS = scopeCSS(allCSS, scopeId);
        }

        // Apply max-width to the wrapper div itself
        const wrapperStyle = wrapperMaxWidth
          ? `position:relative;max-width:${wrapperMaxWidth};margin:0 auto;`
          : 'position:relative;';

        // Neutralize inherited styles from site header/footer on same class names inside sections
        allCSS += `\n#${scopeId} .snb-header{position:static!important;top:auto!important;left:auto!important;width:auto!important;z-index:auto!important;background:none!important;backdrop-filter:none!important;border-bottom:none!important;}`;
        // Fix blog article layout — media query scoping breaks multi-rule @media blocks
        // Re-enforce desktop 2-column layout + sidebar sticky, mobile 1-column + sidebar hidden
        allCSS += `\n#${scopeId} .snb-article-layout{display:grid!important;grid-template-columns:1fr 280px!important;gap:48px!important;align-items:start!important;}`;
        allCSS += `\n#${scopeId} .snb-sidebar{position:sticky!important;top:100px!important;align-self:start!important;display:flex!important;flex-direction:column!important;gap:24px!important;}`;
        allCSS += `\n@media(max-width:1100px){#${scopeId} .snb-article-layout{grid-template-columns:1fr 240px!important;gap:36px!important;}}`;
        allCSS += `\n@media(max-width:850px){#${scopeId} .snb-article-layout{grid-template-columns:1fr!important;gap:0!important;}#${scopeId} .snb-sidebar{position:static!important;display:none!important;}}`;

        const sectionSpacing = spacingData[section.file] ? `margin-top:${spacingData[section.file]}px;` : '';
        bodyContent += `<div class="gds-section-wrapper" id="${scopeId}" data-gds-file="${section.file}" style="${wrapperStyle}${sectionSpacing}">\n`;
        if (allCSS.trim()) bodyContent += `<style>${allCSS}</style>\n`;
        bodyContent += `${content}\n</div>\n`;
      } else {
        // Fragment HTML: keep <style> inline as-is, just extract scripts
        content = content.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (match, js) => {
          if (js.trim()) sectionScripts += `<script>${js}</script>\n`;
          return '';
        });

        const fragSpacing = spacingData[section.file] ? `margin-top:${spacingData[section.file]}px;` : '';
        bodyContent += `<div class="gds-section-wrapper" data-gds-file="${section.file}" style="position:relative;${fragSpacing}">\n${content}\n</div>\n`;
      }
    }

    // ── Blog sidebar injection: wrap content sections in 2-column layout ──
    if (slug.startsWith('blog-')) {
      try {
        // Read all section HTML to build TOC from H2/H3
        const allSectionHtml = sections
          .filter(s => !s.file.includes('hero') && !s.file.includes('related'))
          .map(s => { try { return fs.readFileSync(path.join(previewDir, s.file), 'utf-8'); } catch { return ''; } })
          .join('\n');

        // Build TOC from H2 only (not H3) — sidebar sommaire
        const tocHtml = [];
        const seenTitles = new Set();
        // Match H2 with id
        const hRe = /<h2\s[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h2>/gi;
        let hm;
        while ((hm = hRe.exec(allSectionHtml)) !== null) {
          const id = hm[1];
          const text = hm[2].replace(/<[^>]+>/g, '').trim();
          if (!text || seenTitles.has(text)) continue;
          seenTitles.add(text);
          tocHtml.push(`<li><a href="#${id}">${text}</a></li>`);
        }
        // Also match H2 without id (auto-generate id)
        const hReNoId = /<h2(?:\s[^>]*)?>(?!.*id=)([\s\S]*?)<\/h2>/gi;
        while ((hm = hReNoId.exec(allSectionHtml)) !== null) {
          const text = hm[1].replace(/<[^>]+>/g, '').trim();
          if (!text || seenTitles.has(text)) continue;
          seenTitles.add(text);
          const autoId = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          tocHtml.push(`<li><a href="#${autoId}">${text}</a></li>`);
        }

        // Build sidebar related articles from blog index
        let sidebarRelated = '';
        const blogIndexPath = path.join(PREVIEWS_DIR, '_blog-index.json');
        if (fs.existsSync(blogIndexPath)) {
          try {
            const blogIdx = JSON.parse(fs.readFileSync(blogIndexPath, 'utf-8'));
            const others = (blogIdx.articles || [])
              .filter(a => a.slug !== slug && a.status !== 'draft')
              .slice(0, 3);
            sidebarRelated = others.map(a =>
              `<li><a href="/blog/${a.slug}/"><div class="sr-link-thumb"><img src="${a.heroImage || '/site-images/blog-default.webp'}" alt="" loading="lazy"></div><span class="sr-link-title">${a.title}</span></a></li>`
            ).join('\n');
          } catch {}
        }

        const sidebarHtml = `<aside class="snb-sidebar" style="position:sticky;top:100px;align-self:start;display:flex;flex-direction:column;gap:24px;grid-column:2;grid-row:1/-1;">
  <nav class="snb-toc" aria-label="Sommaire"><div class="snb-toc-title">Sommaire</div><ul>${tocHtml.join('\n')}</ul></nav>
  <div class="snb-sidebar-cta"><span class="sc-label">Location photobooth</span><div class="sc-title">Animation <span>Mariage</span></div><div class="sc-price">299&euro;</div><div class="sc-period">par &eacute;v&eacute;nement &mdash; livraison incluse</div><a href="https://shootnbox.fr/reservation/" class="sc-btn">Obtenir mon devis</a></div>
  <div class="snb-sidebar-related"><div class="sr-title">A lire aussi</div><ul>${sidebarRelated}</ul></div>
</aside>`;

        // Wrap body sections in 2-column grid layout with sidebar
        const firstBodySection = sections.find(s => !s.file.includes('hero') && !s.file.includes('related'));
        const relatedSection = sections.find(s => s.file.includes('related'));

        if (firstBodySection) {
          const openTag = `<div class="snb-article-layout" style="max-width:1300px;margin:0 auto;padding:0 24px 80px;display:grid;grid-template-columns:1fr 280px;gap:48px;align-items:start;"><div class="snb-article-body-col" style="grid-column:1;min-width:0;">`;
          const closeTag = `</div><!-- /snb-article-body-col -->\n${sidebarHtml}\n</div><!-- /snb-article-layout -->`;

          bodyContent = bodyContent.replace(
            new RegExp(`(<div[^>]*data-gds-file="${firstBodySection.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}")`),
            openTag + '\n$1'
          );

          if (relatedSection) {
            bodyContent = bodyContent.replace(
              new RegExp(`(<div[^>]*data-gds-file="${relatedSection.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}")`),
              closeTag + '\n$1'
            );
          } else {
            bodyContent = bodyContent.replace('</main>', closeTag + '\n</main>');
          }
        }

        // Responsive
        bodyContent = bodyContent.replace('</main>',
          `<style>@media(max-width:850px){.snb-article-layout{grid-template-columns:1fr!important;gap:0!important;}.snb-sidebar{display:none!important;}}</style>\n</main>`);
      } catch (e) {
        console.error('[Pages] Blog sidebar injection error:', e.message);
      }
    }

    bodyContent += '</main>\n';

    // Apply standardized hero height + background enforcement to hero sections
    // 1. Add min-height on hero wrapper
    bodyContent = bodyContent.replace(/(data-gds-file="[^"]*hero[^"]*"[^>]*style="[^"]*)(">)/gi, (match, before, end) => {
      if (before.includes('--hero-height')) return match;
      return before + 'min-height:var(--hero-height);' + end;
    });
    // 2. Override hardcoded min-height values inside hero section CSS with the variable
    bodyContent = bodyContent.replace(/(<div[^>]*data-gds-file="[^"]*hero[^"]*"[^>]*>[\s\S]*?)(<\/div>\s*<div class="gds-section-wrapper")/gi, (match, heroContent, nextSection) => {
      // Replace hardcoded min-height in style blocks within hero sections
      const fixed = heroContent.replace(/(min-height:\s*)\d{2,4}px/gi, '$1var(--hero-height)');
      return fixed + nextSection;
    });
    // 3. Also fix the last hero if it's the last section (no next wrapper)
    bodyContent = bodyContent.replace(/(<div[^>]*data-gds-file="[^"]*hero[^"]*"[^>]*>[\s\S]*?)(<\/div>\s*<\/main>)/gi, (match, heroContent, mainClose) => {
      const fixed = heroContent.replace(/(min-height:\s*)\d{2,4}px/gi, '$1var(--hero-height)');
      return fixed + mainClose;
    });

    // Auto-tag editable elements server-side (more reliable than client-side)
    if (editMode) {
      try {
        const cheerio = require('cheerio');
        const $ = cheerio.load(bodyContent, { decodeEntities: false });
        let autoIdx = 0;

        // Tag editables in section wrappers AND in injected layout wrappers
        const editableSelector = 'h1, h2, h3, h4, h5, h6, p, [class*="snb-h"], [class*="snb-title"], [class*="snb-subtitle"], [class*="snb-body"], [class*="snb-intro"], [class*="snb-desc"], [class*="heading"], [class*="title"]:not(title), li, blockquote, figcaption, .snb-conseil-text, .snb-highlight p, dt, dd';

        $('.gds-section-wrapper, .snb-article-layout .gds-section-wrapper').each((wi, wrapper) => {
          const $wrapper = $(wrapper);
          const file = $wrapper.attr('data-gds-file') || $wrapper.closest('[data-gds-file]').attr('data-gds-file') || 'custom';
          const sectionName = file.replace(/^\d+-/, '').replace('.html', '');
          let sectionIdx = 0;

          $wrapper.find(editableSelector).each((i, el) => {
            const $el = $(el);
            // Skip if already tagged
            if ($el.attr('data-gds-edit')) return;
            // Skip if inside an element with onclick (FAQ, accordions)
            if ($el.closest('[onclick]').length) return;
            // Skip if empty
            const text = $el.text().trim();
            if (!text || text.length < 2) return;
            // Skip if inside admin UI, sidebar, nav, or scripts
            if ($el.closest('.gds-section-actions, .gds-block-inserter, .snb-sidebar, .snb-toc, .snb-breadcrumb, nav, script, style').length) return;
            // Skip tiny elements (icons, badges) — must have meaningful text
            if (text.length < 5 && !['h1','h2','h3','h4','h5','h6'].includes(el.tagName.toLowerCase())) return;

            const tag = el.tagName.toLowerCase();
            $el.attr('data-gds-edit', `${sectionName}:${sectionIdx}:${tag}`);
            $el.attr('data-gds-section', sectionName);
            $el.attr('data-gds-tag', tag.toUpperCase());
            sectionIdx++;
            autoIdx++;
          });
        });

        // Also auto-tag images without data-gds-img
        let imgIdx = 0;
        $('.gds-section-wrapper').each((wi, wrapper) => {
          const $wrapper = $(wrapper);
          const file = $wrapper.attr('data-gds-file') || 'custom';
          const sectionName = file.replace(/^\d+-/, '').replace('.html', '');

          $wrapper.find('img, video').each((i, el) => {
            const $el = $(el);
            if ($el.attr('data-gds-img')) return;
            const src = $el.attr('src');
            if (!src) return;
            // Skip logos, header/nav images, data URIs
            if (src.includes('/logo/') || src.startsWith('data:')) return;
            if ($el.closest('.snb-header, .snb-nav, nav, header').length) return;
            $el.attr('data-gds-img', `${sectionName}:${imgIdx}:${src}`);
            imgIdx++;
            autoIdx++;
          });
        });

        if (autoIdx > 0) {
          // $.html() wraps in <html><head><body>, $('body').html() loses <style> tags
          // Solution: get full output and strip the cheerio wrappers
          let out = $.html();
          out = out.replace(/^<html><head>/, '').replace(/<\/head><body>/, '').replace(/<\/body><\/html>$/, '');
          bodyContent = out;
          console.log(`[Pages] Preview: auto-tagged ${autoIdx} editable elements`);
        }
      } catch (e) {
        console.error('[Pages] Auto-tag error:', e.message);
      }
    }

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
    body{margin:0;padding:0;font-family:"Raleway",sans-serif;color:#333;line-height:1.6;background:${config.colors?.bgAlt || '#f8eaff'};overflow-x:clip;-webkit-font-smoothing:antialiased}
    .snb-page-wrapper{overflow-x:clip}
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
      --hero-height: ${config.sections?.hero?.height?.desktop || '520px'};
      --hero-padding: ${config.sections?.hero?.padding?.desktop || '40px 40px 50px'};
      --hero-title-size: ${config.sections?.hero?.titleSize?.desktop || '52px'};
      --hero-subtitle-size: ${config.sections?.hero?.subtitleSize?.desktop || '17px'};
      --section-padding: ${config.sections?.standard?.padding?.desktop || '80px 24px'};
      --section-title-size: ${config.sections?.standard?.titleSize?.desktop || '44px'};
      --section-max-width: ${config.sections?.standard?.maxWidth || '1300px'};
      --compact-padding: ${config.sections?.compact?.padding?.desktop || '48px 24px'};
      --compact-title-size: ${config.sections?.compact?.titleSize?.desktop || '36px'};
      --cta-section-padding: ${config.sections?.cta?.padding?.desktop || '60px 24px'};
      --cta-section-title-size: ${config.sections?.cta?.titleSize?.desktop || '40px'};
      --cta-section-max-width: ${config.sections?.cta?.maxWidth || '860px'};
    }
    @media (max-width:1024px) {
      :root {
        --hero-height: ${config.sections?.hero?.height?.tablet || '420px'};
        --hero-padding: ${config.sections?.hero?.padding?.tablet || '40px 20px 50px'};
        --hero-title-size: ${config.sections?.hero?.titleSize?.tablet || '40px'};
        --section-padding: ${config.sections?.standard?.padding?.tablet || '60px 20px'};
        --section-title-size: ${config.sections?.standard?.titleSize?.tablet || '36px'};
        --compact-padding: ${config.sections?.compact?.padding?.tablet || '36px 20px'};
        --cta-section-padding: ${config.sections?.cta?.padding?.tablet || '48px 20px'};
      }
    }
    @media (max-width:600px) {
      :root {
        --hero-height: ${config.sections?.hero?.height?.mobile || '360px'};
        --hero-padding: ${config.sections?.hero?.padding?.mobile || '30px 16px 40px'};
        --hero-title-size: ${config.sections?.hero?.titleSize?.mobile || '32px'};
        --hero-subtitle-size: ${config.sections?.hero?.subtitleSize?.mobile || '15px'};
        --section-padding: ${config.sections?.standard?.padding?.mobile || '48px 16px'};
        --section-title-size: ${config.sections?.standard?.titleSize?.mobile || '28px'};
        --compact-padding: ${config.sections?.compact?.padding?.mobile || '28px 16px'};
        --compact-title-size: ${config.sections?.compact?.titleSize?.mobile || '24px'};
        --cta-section-padding: ${config.sections?.cta?.padding?.mobile || '40px 16px'};
        --cta-section-title-size: ${config.sections?.cta?.titleSize?.mobile || '26px'};
      }
    }
    h1, h2, h3, h4, h5, h6 { font-family: var(--font-headings); }
    .container { max-width: var(--max-width); margin: 0 auto; padding: 0 20px; }
  </style>
  <link rel="stylesheet" href="/css/styles-${slug === 'home' ? 'home' : slug}.css">
  ${config.scripts?.headCustom || ''}
</head>
<body>
<div class="snb-page-wrapper">
${bodyContent}
</div>
${fs.existsSync(path.join(PUBLIC_DIR, slug === 'home' ? 'scripts.js' : `scripts-${slug}.js`)) ? `<script src="/js/site/scripts-${slug === 'home' ? 'home' : slug}.js" defer></script>` : ''}
${sectionScripts}
${editMode ? `<link rel="stylesheet" href="/css/admin-editor.css">
<script>window.GDS_SLUG = '${slug}';</script>
<script src="/js/auth.js"></script>
<script src="/js/admin-editor.js" defer></script>` : ''}
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
 * GET /shared/:component/preview — Preview shared header or footer
 */
router.get('/shared/:component/preview', verifyToken, async (req, res) => {
  try {
    const component = req.params.component.replace(/[^a-z]/gi, '');
    if (component !== 'header' && component !== 'footer') {
      return res.status(400).json({ error: 'Composant invalide' });
    }

    const filePath = path.join(SHARED_DIR, component + '.html');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Composant non trouve' });
    }

    const configPath = path.join(__dirname, '..', 'site-config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const fontMain = config.typography?.fontMain || 'Raleway';

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${component === 'header' ? 'Header' : 'Footer'} — Preview</title>
  <style>
    @font-face{font-family:'Raleway';font-style:normal;font-weight:400 900;font-display:swap;src:url(/fonts/raleway-latin.woff2) format('woff2')}
    @font-face{font-family:'Raleway';font-style:italic;font-weight:900;font-display:swap;src:url(/fonts/raleway-900i-latin.woff2) format('woff2')}
    *,*::before,*::after{box-sizing:border-box}
    body{margin:0;padding:0;font-family:"${fontMain}",sans-serif;color:#333;line-height:1.6;background:#fff;overflow-x:clip;-webkit-font-smoothing:antialiased}
    .snb-page-wrapper{overflow-x:clip}
    a{text-decoration:none;color:inherit}
    img{max-width:100%;height:auto}
    ul{list-style:none;padding:0;margin:0}
    .snb-page-content{padding-top:72px}
    @media(max-width:850px){.snb-page-content{padding-top:60px}}
  </style>
</head>
<body>
<div class="snb-page-wrapper">
${content}
${component === 'header' ? '<main class="snb-page-content" style="min-height:60vh;display:flex;align-items:center;justify-content:center;"><p style="color:#8b949e;font-size:18px;">Contenu de la page...</p></main>' : ''}
</div>
<script src="/js/site/scripts-home.js" defer></script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('[Pages] Shared preview error:', err.message);
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
