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

const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');
const META_FILE = path.join(IMAGES_DIR, 'media-meta.json');
const PREVIEWS_DIR = path.join(__dirname, '..', 'previews');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const CONFIG_PATH = path.join(__dirname, '..', 'site-config.json');
const UPLOADS_TMP = path.join(__dirname, '..', 'uploads_tmp');

// Ensure directories exist
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_TMP)) fs.mkdirSync(UPLOADS_TMP, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: UPLOADS_TMP,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Seules les images sont acceptees'), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });

/**
 * Load media metadata sidecar file
 */
function loadMeta() {
  try {
    if (fs.existsSync(META_FILE)) {
      return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return {};
}

function saveMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
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
        path: '/images/' + relativePath,
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
  return map[usage] || null;
}

/**
 * Read WebP quality from site-config or use default
 */
function getWebpQuality() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return config.media?.webpQuality || 85;
  } catch (e) {
    return 85;
  }
}

// ==================== ROUTES ====================

/**
 * GET / — List all images
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const { folder, search, sort } = req.query;
    const results = [];
    scanImages(IMAGES_DIR, IMAGES_DIR, results);

    // Enrich with dimensions
    const meta = loadMeta();
    const enriched = await Promise.all(results.map(async (img) => {
      const fullPath = path.join(IMAGES_DIR, img.path.replace('/images/', ''));
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
    const targetDir = folder ? path.join(IMAGES_DIR, folder) : IMAGES_DIR;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const uploaded = [];

    for (const file of req.files) {
      try {
        const baseName = path.basename(file.originalname, path.extname(file.originalname))
          .replace(/[^a-z0-9_-]/gi, '-')
          .toLowerCase();
        const webpName = baseName + '-' + Date.now() + '.webp';
        const outputPath = path.join(targetDir, webpName);

        let pipeline = sharp(file.path);

        if (resizeWidth) {
          pipeline = pipeline.resize(resizeWidth, null, { withoutEnlargement: true });
        }

        await pipeline.webp({ quality }).toFile(outputPath);

        // Get final metadata
        const metadata = await sharp(outputPath).metadata();
        const stat = fs.statSync(outputPath);

        uploaded.push({
          name: webpName,
          path: '/images/' + (folder ? folder + '/' : '') + webpName,
          size: stat.size,
          dimensions: { width: metadata.width, height: metadata.height },
          format: 'webp'
        });

        // Clean up temp file
        fs.unlinkSync(file.path);
      } catch (fileErr) {
        console.error('[Media] Process file error:', fileErr.message);
        // Clean up temp file on error
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
    scanImages(IMAGES_DIR, IMAGES_DIR, results);
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
 * DELETE /:filename — Delete an image (admin only)
 */
router.delete('/:filename', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { filename } = req.params;

    // Find file in images dir
    const results = [];
    scanImages(IMAGES_DIR, IMAGES_DIR, results);
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
    const fullPath = path.join(IMAGES_DIR, img.path.replace('/images/', ''));
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
    scanImages(IMAGES_DIR, IMAGES_DIR, images);

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
  const dirsToScan = [PREVIEWS_DIR, PUBLIC_DIR];

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
