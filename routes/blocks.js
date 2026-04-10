const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');

const _DEFAULT_BLOCKS_DIR = path.join(__dirname, '..', 'blocks');

// Ensure default blocks directory exists
if (!fs.existsSync(_DEFAULT_BLOCKS_DIR)) {
  fs.mkdirSync(_DEFAULT_BLOCKS_DIR, { recursive: true });
}

function getBD(req) {
  const bd = req && req.activeSite && req.activeSite.blocksDir;
  if (bd && !fs.existsSync(bd)) fs.mkdirSync(bd, { recursive: true });
  return bd || _DEFAULT_BLOCKS_DIR;
}

/**
 * GET / — List all saved blocks
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const BLOCKS_DIR = getBD(req);
    const files = fs.readdirSync(BLOCKS_DIR).filter(f => f.endsWith('.json'));
    const blocks = files.map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(BLOCKS_DIR, f), 'utf-8'));
      return {
        id: f.replace('.json', ''),
        name: data.name || f.replace('.json', ''),
        description: data.description || '',
        category: data.category || 'custom',
        size: (data.html || '').length,
        createdAt: data.createdAt || null
      };
    });
    // Sort by category then name
    blocks.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    res.json({ blocks });
  } catch (err) {
    console.error('[Blocks] List error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la recuperation des blocs' });
  }
});

/**
 * GET /:id — Get a single block's full content
 */
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const BLOCKS_DIR = getBD(req);
    const id = req.params.id.replace(/[^a-z0-9_-]/gi, '');
    const filePath = path.join(BLOCKS_DIR, id + '.json');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Bloc non trouve' });
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(data);
  } catch (err) {
    console.error('[Blocks] Get error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST / — Save a new block to the library
 * Body: { name, description, category, html }
 */
router.post('/', verifyToken, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const BLOCKS_DIR = getBD(req);
    const { name, description, category, html } = req.body;
    if (!name || !html) {
      return res.status(400).json({ error: 'Les champs "name" et "html" sont requis' });
    }

    // Generate ID from name
    const id = name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    if (!id) {
      return res.status(400).json({ error: 'Nom invalide' });
    }

    const filePath = path.join(BLOCKS_DIR, id + '.json');

    const blockData = {
      name,
      description: description || '',
      category: category || 'custom',
      html,
      createdAt: new Date().toISOString(),
      createdBy: req.user.id
    };

    fs.writeFileSync(filePath, JSON.stringify(blockData, null, 2), 'utf-8');

    await logAudit({
      userId: req.user.id,
      action: 'block_save',
      entityType: 'block',
      entityId: id,
      details: { name, category: blockData.category, size: html.length },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({ success: true, id, name });
  } catch (err) {
    console.error('[Blocks] Save error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde du bloc' });
  }
});

/**
 * POST /from-section — Save a block from an existing page section
 * Body: { slug, file, name, description, category }
 */
router.post('/from-section', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const BLOCKS_DIR = getBD(req);
    const { slug, file, name, description, category } = req.body;
    if (!slug || !file || !name) {
      return res.status(400).json({ error: 'Les champs "slug", "file" et "name" sont requis' });
    }

    const basePD = (req.activeSite && req.activeSite.previewsDir) || path.join(__dirname, '..', 'previews');
    const previewDir = slug === 'home' ? basePD : path.join(basePD, slug);
    const sectionPath = path.join(previewDir, path.basename(file));

    if (!fs.existsSync(sectionPath)) {
      return res.status(404).json({ error: 'Section non trouvee' });
    }

    const html = fs.readFileSync(sectionPath, 'utf-8');

    const id = name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const filePath = path.join(BLOCKS_DIR, id + '.json');

    const blockData = {
      name,
      description: description || '',
      category: category || 'section',
      html,
      sourceSlug: slug,
      sourceFile: file,
      createdAt: new Date().toISOString(),
      createdBy: req.user.id
    };

    fs.writeFileSync(filePath, JSON.stringify(blockData, null, 2), 'utf-8');

    await logAudit({
      userId: req.user.id,
      action: 'block_save_from_section',
      entityType: 'block',
      entityId: id,
      details: { name, slug, file, size: html.length },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({ success: true, id, name, size: html.length });
  } catch (err) {
    console.error('[Blocks] Save from section error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * DELETE /:id — Delete a block from the library
 */
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const BLOCKS_DIR = getBD(req);
    const id = req.params.id.replace(/[^a-z0-9_-]/gi, '');
    const filePath = path.join(BLOCKS_DIR, id + '.json');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Bloc non trouve' });
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    fs.unlinkSync(filePath);

    await logAudit({
      userId: req.user.id,
      action: 'block_delete',
      entityType: 'block',
      entityId: id,
      details: { name: data.name },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Bloc supprime' });
  } catch (err) {
    console.error('[Blocks] Delete error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
