const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');
const { uploadLimiter } = require('../middleware/rateLimiter');

const { getActiveSite } = require('../middleware/activeSite');
// IMAGES_BASE: root of the static file server for /site-images/ — never changes
const IMAGES_BASE = path.join(__dirname, '..', 'public', 'site-images');
const _DEFAULT_PREVIEWS_DIR = path.join(__dirname, '..', 'previews');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const CONFIG_PATH = path.join(__dirname, '..', 'site-config.json');
const UPLOADS_TMP = path.join(__dirname, '..', 'uploads_tmp');

// Ensure base directories exist (site-specific dirs created lazily in handlers)
if (!fs.existsSync(IMAGES_BASE)) fs.mkdirSync(IMAGES_BASE, { recursive: true });
if (!fs.existsSync(UPLOADS_TMP)) fs.mkdirSync(UPLOADS_TMP, { recursive: true });

/** Images directory for the current request's active site. */
function getImagesDir() {
  const d = getActiveSite().imagesDir;
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

/** media-meta.json path for the current request's active site. */
function getMetaFile() { return path.join(getImagesDir(), 'media-meta.json'); }

// Multer config
const storage = multer.diskStorage({
  destination: UPLOADS_TMP,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  }
});

const ALLOWED_MIMETYPES = ['image/', 'video/mp4', 'video/webm', 'video/quicktime'];

const fileFilter = (req, file, cb) => {
  const allowed = ALLOWED_MIMETYPES.some(t => file.mimetype.startsWith(t));
  if (allowed) {
    cb(null, true);
  } else {
    cb(new Error('Format non accepte. Images (JPG, PNG, WebP, GIF) et videos (MP4, WebM) uniquement.'), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB (videos)

/**
 * Load media metadata sidecar file
 */
function loadMeta() {
  try {
    const f = getMetaFile();
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8'));
  } catch (e) { /* ignore */ }
  return {};
}

function saveMeta(meta) {
  fs.writeFileSync(getMetaFile(), JSON.stringify(meta, null, 2), 'utf-8');
}

/**
 * Recursively scan a directory for image files
 */
function scanImages(dir, baseDir, results) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanImages(fullPath, baseDir, results);
    } else if (/\.(jpg|jpeg|png|gif|webp|svg|avif|bmp|ico)$/i.test(entry.name)) {
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      const folder = path.dirname(relativePath) === '.' ? '' : path.dirname(relativePath);
      const stat = fs.statSync(fullPath);
      results.push({
        path: '/site-images/' + relativePath,
        name: entry.name,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        folder
      });
    }
  }
}

/**
 * Get image dimensions via sharp
 */
async function getImageDimensions(filePath) {
  try {
    const metadata = await sharp(filePath).metadata();
    return { width: metadata.width || 0, height: metadata.height || 0, format: metadata.format || '' };
  } catch (e) {
    return { width: 0, height: 0, format: '' };
  }
}

/**
 * Get resize width based on usage param
 */
function getResizeWidth(usage) {
  const map = { hero: 1920, card: 1200, thumb: 400 };
  return map[usage] || 1200; // Default: max 1200px wide for all uploads
}

/**
 * Read WebP quality from site-config or use default
 * Aggressive compression: 75 by default (good balance size/quality)
 */
function getWebpQuality() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return config.media?.webpQuality || 75;
  } catch (e) {
    return 75;
  }
}

// ==================== RESPONSIVE VARIANTS ====================

const RESPONSIVE_WIDTHS = [480, 768, 1280];
const RESPONSIVE_QUALITY = 80;
const RESPONSIVE_MIN_WIDTH = 600;
const VARIANT_PATTERN = /-(480|768|1280)w\.\w+$/i;

/**
 * Generate responsive WebP variants (480w, 768w, 1280w) for an uploaded image.
 * Skips variants where width >= source width. Non-blocking: errors are logged but don't break upload.
 * Returns array of generated variant info objects.
 */
async function generateResponsiveVariants(sourcePath, targetDir, baseName) {
  const variants = [];
  try {
    const metadata = await sharp(sourcePath).metadata();
    const sourceWidth = metadata.width || 0;

    if (sourceWidth < RESPONSIVE_MIN_WIDTH) return variants;

    for (const w of RESPONSIVE_WIDTHS) {
      if (w >= sourceWidth) continue;
      const variantName = `${baseName}-${w}w.webp`;
      const variantPath = path.join(targetDir, variantName);

      // Skip if already exists (unlikely on upload but safe)
      if (fs.existsSync(variantPath)) continue;

      try {
        await sharp(sourcePath)
          .resize(w, null, { withoutEnlargement: true })
          .webp({ quality: RESPONSIVE_QUALITY })
          .toFile(variantPath);

        const stat = fs.statSync(variantPath);
        variants.push({ name: variantName, width: w, size: stat.size });
      } catch (variantErr) {
        console.error(`[Media] Responsive variant ${w}w error:`, variantErr.message);
      }
    }
  } catch (err) {
    console.error('[Media] Responsive variants error:', err.message);
  }
  return variants;
}

// ==================== ROUTES ====================

/**
 * GET / — List all images
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const { folder, search, sort } = req.query;
    const results = [];
    const imgDir = getImagesDir();
    scanImages(imgDir, IMAGES_BASE, results);

    // Enrich with dimensions
    const meta = loadMeta();
    const enriched = await Promise.all(results.map(async (img) => {
      const fullPath = path.join(IMAGES_BASE, img.path.replace('/site-images/', ''));
      const dims = await getImageDimensions(fullPath);
      return {
        ...img,
        dimensions: { width: dims.width, height: dims.height },
        format: dims.format,
        alt: meta[img.name] || ''
      };
    }));

    // Filter by folder
    let filtered = enriched;
    if (folder) {
      filtered = filtered.filter(img => img.folder === folder);
    }

    // Search by name
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(img => img.name.toLowerCase().includes(q));
    }

    // Sort
    if (sort === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'size') {
      filtered.sort((a, b) => b.size - a.size);
    } else if (sort === 'oldest') {
      filtered.sort((a, b) => new Date(a.modified) - new Date(b.modified));
    } else {
      // Default: newest first
      filtered.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    }

    // Collect unique folders
    const folders = [...new Set(enriched.map(img => img.folder).filter(Boolean))].sort();

    res.json({ images: filtered, folders, total: filtered.length });
  } catch (err) {
    console.error('[Media] List error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la recuperation des medias' });
  }
});

/**
 * POST /upload — Upload one or multiple images
 */
router.post('/upload', verifyToken, requireRole('admin', 'editor'), uploadLimiter, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier envoye' });
    }

    const usage = req.query.usage || req.body.usage || null;
    const folder = req.query.folder || req.body.folder || '';
    const resizeWidth = getResizeWidth(usage);
    const quality = getWebpQuality();

    // Ensure target folder exists
    const targetDir = folder ? path.join(getImagesDir(), folder) : getImagesDir();
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    // Compute URL prefix relative to the static file server root
    const relDir = path.relative(IMAGES_BASE, targetDir).replace(/\\/g, '/');
    const urlPrefix = '/site-images/' + (relDir ? relDir + '/' : '');

    const uploaded = [];

    for (const file of req.files) {
      try {
        const baseName = path.basename(file.originalname, path.extname(file.originalname))
          .replace(/[^a-z0-9_-]/gi, '-')
          .toLowerCase();
        const isVideo = file.mimetype.startsWith('video/');

        if (isVideo) {
          // Videos: copy directly without processing
          const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
          const videoName = baseName + '-' + Date.now() + ext;
          const outputPath = path.join(targetDir, videoName);
          fs.copyFileSync(file.path, outputPath);
          const stat = fs.statSync(outputPath);

          uploaded.push({
            name: videoName,
            path: urlPrefix + videoName,
            size: stat.size,
            format: ext.replace('.', '')
          });

          fs.unlinkSync(file.path);
        } else {
          // Images: resize + convert to WebP
          // Detect animated GIFs to preserve animation (animated WebP)
          const isGif = file.mimetype === 'image/gif' || file.originalname.toLowerCase().endsWith('.gif');
          const webpName = baseName + '-' + Date.now() + '.webp';
          const outputPath = path.join(targetDir, webpName);

          let pipeline = sharp(file.path, isGif ? { animated: true } : {});

          if (resizeWidth && !isGif) {
            // Don't resize animated GIFs to avoid frame corruption
            pipeline = pipeline.resize(resizeWidth, null, { withoutEnlargement: true });
          }

          await pipeline.webp({ quality, loop: 0 }).toFile(outputPath);

          const metadata = await sharp(outputPath, { animated: isGif }).metadata();
          const stat = fs.statSync(outputPath);

          // Generate responsive variants (480w, 768w, 1280w) — skip for animated GIFs
          const variants = isGif ? [] : await generateResponsiveVariants(outputPath, targetDir, path.basename(webpName, '.webp'));

          uploaded.push({
            name: webpName,
            path: urlPrefix + webpName,
            size: stat.size,
            dimensions: { width: metadata.width, height: metadata.height },
            format: 'webp',
            variants: variants.map(v => ({
              name: v.name,
              path: urlPrefix + v.name,
              width: v.width,
              size: v.size
            }))
          });

          fs.unlinkSync(file.path);
        }
      } catch (fileErr) {
        console.error('[Media] Process file error:', fileErr.message);
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }
    }

    await logAudit({
      userId: req.user.id,
      action: 'media_upload',
      entityType: 'media',
      entityId: uploaded.map(u => u.name).join(', '),
      details: { count: uploaded.length, usage, folder },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, uploaded, count: uploaded.length });
  } catch (err) {
    console.error('[Media] Upload error:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'upload' });
  }
});

/**
 * PUT /:filename/alt — Update alt text for an image
 */
router.put('/:filename/alt', verifyToken, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { filename } = req.params;
    const { alt } = req.body;

    if (alt === undefined) {
      return res.status(400).json({ error: 'Texte alternatif requis' });
    }

    // Validate file exists somewhere in images dir
    let found = false;
    const results = [];
    scanImages(getImagesDir(), IMAGES_BASE, results);
    for (const img of results) {
      if (img.name === filename) {
        found = true;
        break;
      }
    }

    if (!found) {
      return res.status(404).json({ error: 'Image non trouvee' });
    }

    const meta = loadMeta();
    meta[filename] = alt;
    saveMeta(meta);

    await logAudit({
      userId: req.user.id,
      action: 'media_alt_update',
      entityType: 'media',
      entityId: filename,
      details: { alt },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, filename, alt });
  } catch (err) {
    console.error('[Media] Alt update error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la mise a jour du texte alternatif' });
  }
});

/**
 * PUT /:filename/rename — Rename an image (admin/editor)
 */
router.put('/:filename/rename', verifyToken, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { filename } = req.params;
    const { newName } = req.body;

    if (!newName || !newName.trim()) {
      return res.status(400).json({ error: 'Nouveau nom requis' });
    }

    // Sanitize new name (keep only safe chars, no extension — we preserve original ext)
    const sanitized = newName.trim().replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    if (!sanitized) {
      return res.status(400).json({ error: 'Nom invalide apres nettoyage' });
    }

    // Find file in images dir
    const results = [];
    scanImages(getImagesDir(), IMAGES_BASE, results);
    const img = results.find(i => i.name === filename);

    if (!img) {
      return res.status(404).json({ error: 'Image non trouvee' });
    }

    const ext = path.extname(filename);
    const oldBase = path.basename(filename, ext);
    const newFilename = sanitized + ext;

    // Check no collision
    if (newFilename === filename) {
      return res.json({ success: true, filename, newFilename: filename });
    }

    const folderDir = img.folder ? path.join(IMAGES_BASE, img.folder) : getImagesDir();
    const newPath = path.join(folderDir, newFilename);

    if (fs.existsSync(newPath)) {
      return res.status(409).json({ error: 'Un fichier avec ce nom existe deja' });
    }

    // Rename main file
    const oldPath = path.join(folderDir, filename);
    fs.renameSync(oldPath, newPath);

    // Rename responsive variants (-480w, -768w, -1280w)
    const renamedVariants = [];
    for (const w of RESPONSIVE_WIDTHS) {
      const oldVariant = `${oldBase}-${w}w${ext}`;
      const newVariant = `${sanitized}-${w}w${ext}`;
      const oldVarPath = path.join(folderDir, oldVariant);
      const newVarPath = path.join(folderDir, newVariant);
      if (fs.existsSync(oldVarPath)) {
        fs.renameSync(oldVarPath, newVarPath);
        renamedVariants.push({ from: oldVariant, to: newVariant });
      }
    }

    // Update metadata
    const meta = loadMeta();
    if (meta[filename] !== undefined) {
      meta[newFilename] = meta[filename];
      delete meta[filename];
      saveMeta(meta);
    }

    await logAudit({
      userId: req.user.id,
      action: 'media_rename',
      entityType: 'media',
      entityId: filename,
      details: { oldName: filename, newName: newFilename, variants: renamedVariants.length },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, oldName: filename, newFilename, variants: renamedVariants });
  } catch (err) {
    console.error('[Media] Rename error:', err.message);
    res.status(500).json({ error: 'Erreur lors du renommage' });
  }
});

/**
 * DELETE /:filename — Delete an image (admin only)
 */
router.delete('/:filename', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { filename } = req.params;

    // Find file in images dir
    const results = [];
    scanImages(getImagesDir(), IMAGES_BASE, results);
    const img = results.find(i => i.name === filename);

    if (!img) {
      return res.status(404).json({ error: 'Image non trouvee' });
    }

    // Check if referenced in HTML files
    const referenced = isImageReferenced(filename);
    if (referenced) {
      return res.status(409).json({
        error: 'Cette image est utilisee dans des pages. Retirez-la d\'abord.',
        referencedIn: referenced
      });
    }

    // Delete file
    const fullPath = path.join(IMAGES_BASE, img.path.replace('/site-images/', ''));
    fs.unlinkSync(fullPath);

    // Remove from meta
    const meta = loadMeta();
    delete meta[filename];
    saveMeta(meta);

    await logAudit({
      userId: req.user.id,
      action: 'media_delete',
      entityType: 'media',
      entityId: filename,
      details: {},
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Image supprimee' });
  } catch (err) {
    console.error('[Media] Delete error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

/**
 * GET /unused — Find unreferenced images
 */
router.get('/unused', verifyToken, async (req, res) => {
  try {
    const images = [];
    scanImages(getImagesDir(), IMAGES_BASE, images);

    const unused = [];
    for (const img of images) {
      if (img.name === 'media-meta.json') continue;
      const refs = isImageReferenced(img.name);
      if (!refs) {
        unused.push(img);
      }
    }

    res.json({ unused, count: unused.length });
  } catch (err) {
    console.error('[Media] Unused scan error:', err.message);
    res.status(500).json({ error: 'Erreur lors du scan des images inutilisees' });
  }
});

/**
 * Check if an image filename is referenced in any HTML file
 * Returns array of referencing files, or null if not referenced
 */
function isImageReferenced(filename) {
  const refs = [];
  const dirsToScan = [getActiveSite().previewsDir || _DEFAULT_PREVIEWS_DIR, PUBLIC_DIR];

  for (const dir of dirsToScan) {
    if (!fs.existsSync(dir)) continue;
    scanHtmlFiles(dir, filename, refs);
  }

  return refs.length > 0 ? refs : null;
}

function scanHtmlFiles(dir, filename, refs) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'images') {
        scanHtmlFiles(fullPath, filename, refs);
      } else if (entry.name.endsWith('.html') || entry.name.endsWith('.css')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.includes(filename)) {
            refs.push(path.relative(path.join(__dirname, '..'), fullPath));
          }
        } catch (e) { /* skip unreadable files */ }
      }
    }
  } catch (e) { /* skip unreadable dirs */ }
}

module.exports = router;
