const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');

const CONFIG_PATH = path.join(__dirname, '..', 'site-config.json');

/**
 * Read site-config.json
 */
function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

/**
 * Write site-config.json
 */
function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Validate a menu item structure
 */
function validateMenuItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!item.label || typeof item.label !== 'string' || item.label.trim() === '') return false;
  if (!item.url || typeof item.url !== 'string' || item.url.trim() === '') return false;

  if (item.children) {
    if (!Array.isArray(item.children)) return false;
    for (const child of item.children) {
      if (!child.label || typeof child.label !== 'string' || child.label.trim() === '') return false;
      if (!child.url || typeof child.url !== 'string' || child.url.trim() === '') return false;
    }
  }

  return true;
}

// ==================== ROUTES ====================

/**
 * GET / — Get current menu items
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const config = readConfig();
    const menuItems = config.header?.menuItems || [];
    res.json({ menuItems });
  } catch (err) {
    console.error('[Navigation] Get error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la recuperation du menu' });
  }
});

/**
 * PUT / — Update menu items (admin only)
 */
router.put('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { menuItems } = req.body;

    if (!Array.isArray(menuItems)) {
      return res.status(400).json({ error: 'menuItems doit etre un tableau' });
    }

    // Validate each item
    for (let i = 0; i < menuItems.length; i++) {
      if (!validateMenuItem(menuItems[i])) {
        return res.status(400).json({
          error: `Element de menu invalide a l'index ${i}. Chaque element doit avoir label et url.`
        });
      }
    }

    // Sanitize items
    const sanitized = menuItems.map(item => ({
      label: item.label.trim(),
      url: item.url.trim(),
      external: !!item.external,
      children: item.children ? item.children.map(child => ({
        label: child.label.trim(),
        url: child.url.trim()
      })) : []
    }));

    const config = readConfig();
    if (!config.header) config.header = {};
    const oldItems = config.header.menuItems || [];
    config.header.menuItems = sanitized;
    writeConfig(config);

    await logAudit({
      userId: req.user.id,
      action: 'navigation_update',
      entityType: 'navigation',
      entityId: 'menu',
      details: { itemCount: sanitized.length, previous: oldItems.length },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, menuItems: sanitized });
  } catch (err) {
    console.error('[Navigation] Update error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la mise a jour du menu' });
  }
});

module.exports = router;
