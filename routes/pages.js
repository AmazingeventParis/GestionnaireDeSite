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
        return `#${scopeId} ${s}`;
      }).join(', ');
      result.push(`${scoped}{${block}}`);
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
 * POST /create — Create a new page with a default hero section
 * Body: { slug: "my-page", name: "Ma page" }
 * RBAC: admin only
 */
router.post('/create', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { slug, name } = req.body;
    if (!slug || !slug.match(/^[a-z0-9-]+$/)) {
      return res.status(400).json({ error: 'Slug invalide (lettres minuscules, chiffres et tirets uniquement)' });
    }

    const pageDir = path.join(PREVIEWS_DIR, slug);
    if (fs.existsSync(pageDir)) {
      return res.status(409).json({ error: 'Cette page existe deja' });
    }

    fs.mkdirSync(pageDir, { recursive: true });

    // Create a default hero section
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
.new-page-hero p {
  font-size: 18px;
  color: rgba(255,255,255,0.7);
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
}
@media (max-width: 768px) {
  .new-page-hero { padding: 80px 20px 60px; }
  .new-page-hero h1 { font-size: 32px; }
  .new-page-hero p { font-size: 16px; }
}
</style>
<section class="new-page-hero">
  <h1 data-gds-edit="${slug}:0:h1" data-gds-section="${slug}" data-gds-tag="H1">${pageName}</h1>
  <p data-gds-edit="${slug}:0:p" data-gds-section="${slug}" data-gds-tag="P">Description de la page. Cliquez pour modifier.</p>
</section>
`;
    fs.writeFileSync(path.join(pageDir, '01-hero.html'), heroHtml, 'utf-8');

    // Create default SEO
    const seoData = { title: pageName, description: '', ogTitle: '', ogDescription: '' };
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

    const { html, position } = req.body;
    if (!html || typeof html !== 'string') {
      return res.status(400).json({ error: 'Le champ "html" est requis' });
    }

    // Get existing section files (sorted)
    const existingFiles = fs.readdirSync(previewDir)
      .filter(f => f.endsWith('.html'))
      .sort();

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

    // Execute renaming and create new file
    let newFileName = '';
    for (const item of renumberPlan) {
      const numStr = String(item.num).padStart(2, '0');
      if (item.isNew) {
        newFileName = numStr + '-section.html';
        fs.writeFileSync(path.join(previewDir, newFileName), html, 'utf-8');
      } else {
        const newName = numStr + '-' + item.file.replace(/^\d+-/, '');
        if (newName !== item.file) {
          fs.renameSync(path.join(previewDir, item.file), path.join(previewDir, newName));
        }
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

    const { content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Le champ "content" est requis' });
    }

    const previewDir = getPreviewDir(slug);
    const filePath = path.join(previewDir, file);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Section non trouvee' });
    }

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
 * Query: ?edit=1 to inject inline editor scripts
 */
router.get('/:slug/preview', verifyToken, async (req, res) => {
  try {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const editMode = req.query.edit === '1';
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
    let sectionScripts = '';
    let sectionStyles = '';
    for (const section of sections) {
      const nameLower = section.file.toLowerCase();
      if (nameLower.includes('header') || nameLower.includes('footer')) continue;
      let content = fs.readFileSync(path.join(previewDir, section.file), 'utf-8');

      // Check if this is a standalone HTML doc (has <body>) or a fragment
      const isStandalone = /<body[^>]*>/i.test(content);

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
        // Strip CSS comments before scoping
        allCSS = allCSS.replace(/\/\*[\s\S]*?\*\//g, '');

        const scopeId = 'gds-s-' + section.file.replace(/[^a-z0-9]/gi, '');
        if (allCSS.trim()) {
          allCSS = scopeCSS(allCSS, scopeId);
        }

        bodyContent += `<div class="gds-section-wrapper" id="${scopeId}" data-gds-file="${section.file}" style="position:relative;">\n`;
        if (allCSS.trim()) bodyContent += `<style>${allCSS}</style>\n`;
        bodyContent += `${content}\n</div>\n`;
      } else {
        // Fragment HTML: keep <style> inline as-is, just extract scripts
        content = content.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (match, js) => {
          if (js.trim()) sectionScripts += `<script>${js}</script>\n`;
          return '';
        });

        bodyContent += `<div class="gds-section-wrapper" data-gds-file="${section.file}" style="position:relative;">\n${content}\n</div>\n`;
      }
    }

    bodyContent += '</main>\n';

    // Auto-tag editable elements server-side (more reliable than client-side)
    if (editMode) {
      try {
        const cheerio = require('cheerio');
        const $ = cheerio.load(bodyContent, { decodeEntities: false });
        let autoIdx = 0;

        $('.gds-section-wrapper').each((wi, wrapper) => {
          const $wrapper = $(wrapper);
          const file = $wrapper.attr('data-gds-file') || 'custom';
          const sectionName = file.replace(/^\d+-/, '').replace('.html', '');
          let sectionIdx = 0;

          $wrapper.find('h1, h2, h3, h4, p').each((i, el) => {
            const $el = $(el);
            // Skip if already tagged
            if ($el.attr('data-gds-edit')) return;
            // Skip if inside an element with onclick (FAQ, accordions)
            if ($el.closest('[onclick]').length) return;
            // Skip if empty
            const text = $el.text().trim();
            if (!text || text.length < 2) return;
            // Skip if inside admin UI
            if ($el.closest('.gds-section-actions, .gds-block-inserter').length) return;

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
  <link rel="stylesheet" href="/css/styles-${slug === 'home' ? 'home' : slug}.css">
  ${config.scripts?.headCustom || ''}
</head>
<body>
<div class="snb-page-wrapper">
${bodyContent}
</div>
<script src="/js/site/scripts-${slug === 'home' ? 'home' : slug}.js" defer></script>
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
    body{margin:0;padding:0;font-family:"${fontMain}",sans-serif;color:#333;line-height:1.6;background:#fff;overflow-x:hidden;-webkit-font-smoothing:antialiased}
    .snb-page-wrapper{overflow-x:hidden}
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
