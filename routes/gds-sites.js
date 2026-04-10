/**
 * GDS Sites API — Manage GDS-served websites (multi-site)
 *
 * GET    /              — List all registered GDS sites
 * GET    /active        — Get the current active site (from cookie)
 * POST   /              — Create a new site
 * PUT    /:id           — Update site metadata
 * DELETE /:id           — Delete a site (and optionally its files)
 * POST   /:id/activate  — Set the active site cookie
 */

const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const {
  readRegistry,
  resolveSite,
  writeSiteToRegistry,
  removeSiteFromRegistry
} = require('../middleware/activeSite');

const ROOT_DIR = path.join(__dirname, '..');
const DEFAULT_SITE_ID = 'shootnbox';

// Validate site ID: lowercase slug, no dots, no underscores starting with _
function isValidSiteId(id) {
  return /^[a-z0-9][a-z0-9-]{1,49}$/.test(id);
}

/**
 * GET / — List all GDS-managed sites.
 */
router.get('/', verifyToken, (req, res) => {
  const registry = readRegistry();
  const activeSiteId = (req.cookies && req.cookies.gds_active_site) || DEFAULT_SITE_ID;

  const sites = registry.sites.map(site => ({
    id: site.id,
    name: site.name,
    domain: site.domain || '',
    description: site.description || '',
    logo: site.logo || '',
    color: site.color || '#6366f1',
    status: site.status || 'active',
    createdAt: site.createdAt,
    isActive: site.id === activeSiteId
  }));

  res.json({ sites });
});

/**
 * GET /active — Get the current active site.
 */
router.get('/active', verifyToken, (req, res) => {
  const siteId = (req.cookies && req.cookies.gds_active_site) || DEFAULT_SITE_ID;
  const registry = readRegistry();
  const site = registry.sites.find(s => s.id === siteId) || registry.sites[0];
  if (!site) return res.json({ site: null });
  res.json({ site: { ...site, isActive: true } });
});

/**
 * POST / — Create a new GDS site.
 * Body: { id, name, domain, description, color }
 */
router.post('/', verifyToken, requireRole('admin'), (req, res) => {
  const { id, name, domain, description, color } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: 'Les champs "id" et "name" sont requis' });
  }
  if (!isValidSiteId(id)) {
    return res.status(400).json({ error: 'ID invalide. Utilisez uniquement lettres minuscules, chiffres et tirets (2-50 chars).' });
  }

  const registry = readRegistry();
  if (registry.sites.find(s => s.id === id)) {
    return res.status(409).json({ error: `Un site avec l'ID "${id}" existe deja` });
  }

  // Paths for the new site
  const previewsDir = `previews-${id}`;
  const configFile = `site-config-${id}.json`;
  const blocksDir = `blocks-${id}`;

  // Create directories
  const absolutePreviewsDir = path.join(ROOT_DIR, previewsDir);
  const absoluteBlocksDir = path.join(ROOT_DIR, blocksDir);
  const sharedDir = path.join(absolutePreviewsDir, '_shared');

  fs.mkdirSync(absolutePreviewsDir, { recursive: true });
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.mkdirSync(absoluteBlocksDir, { recursive: true });

  // Initialize site-config with defaults
  const defaultConfig = {
    identity: {
      name: name,
      tagline: '',
      logo: '',
      logoWhite: '',
      favicon: ''
    },
    colors: {
      primary: color || '#6366f1',
      secondary: '#0ea5e9',
      tertiary: '#8b5cf6',
      accent1: '#f59e0b',
      accent2: '#10b981',
      textDark: '#1e293b',
      textLight: '#ffffff',
      bgMain: '#ffffff',
      bgAlt: '#f8f9fa'
    },
    typography: {
      fontMain: 'Inter',
      fontHeadings: 'Inter',
      sizes: {
        h1: { desktop: '48px', mobile: '32px', weight: 800, lineHeight: 1.1 },
        h2: { desktop: '36px', mobile: '26px', weight: 700, lineHeight: 1.2 },
        h3: { desktop: '24px', mobile: '20px', weight: 600, lineHeight: 1.3 },
        p:  { desktop: '16px', mobile: '15px', weight: 400, lineHeight: 1.6 }
      }
    },
    header: { sticky: true, height: { desktop: '72px', mobile: '60px' } },
    footer: { copyright: `© ${new Date().getFullYear()} ${name}` },
    sections: {},
    deploy: {}
  };

  fs.writeFileSync(
    path.join(ROOT_DIR, configFile),
    JSON.stringify(defaultConfig, null, 2),
    'utf-8'
  );

  // Write minimal header/footer templates
  const headerHtml = `<!-- Header ${name} -->\n<header class="snb-header">\n  <a href="/" class="snb-logo">${name}</a>\n</header>`;
  const footerHtml = `<!-- Footer ${name} -->\n<footer class="snb-footer">\n  <p>&copy; ${new Date().getFullYear()} ${name}</p>\n</footer>`;
  fs.writeFileSync(path.join(sharedDir, 'header.html'), headerHtml, 'utf-8');
  fs.writeFileSync(path.join(sharedDir, 'footer.html'), footerHtml, 'utf-8');

  const siteData = {
    id,
    name,
    domain: domain || '',
    description: description || '',
    previewsDir,
    configFile,
    blocksDir,
    logo: '',
    color: color || '#6366f1',
    status: 'active',
    createdAt: new Date().toISOString()
  };

  writeSiteToRegistry(siteData);

  res.status(201).json({ success: true, site: siteData });
});

/**
 * PUT /:id — Update site metadata (name, domain, description, color, logo).
 * Does NOT change previewsDir/configFile/blocksDir (those are fixed at creation).
 */
router.put('/:id', verifyToken, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const registry = readRegistry();
  const site = registry.sites.find(s => s.id === id);

  if (!site) return res.status(404).json({ error: 'Site non trouve' });
  if (id === DEFAULT_SITE_ID && req.body.id && req.body.id !== DEFAULT_SITE_ID) {
    return res.status(400).json({ error: 'Impossible de renommer le site principal' });
  }

  const allowedFields = ['name', 'domain', 'description', 'logo', 'color', 'status'];
  const updated = { ...site };
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updated[field] = req.body[field];
  }

  writeSiteToRegistry(updated);
  res.json({ success: true, site: updated });
});

/**
 * DELETE /:id — Remove a site from the registry.
 * Does NOT delete files automatically (safety measure). Admin can delete manually.
 * Cannot delete the default Shootnbox site.
 */
router.delete('/:id', verifyToken, requireRole('admin'), (req, res) => {
  const { id } = req.params;

  if (id === DEFAULT_SITE_ID) {
    return res.status(400).json({ error: 'Impossible de supprimer le site principal Shootnbox' });
  }

  const registry = readRegistry();
  const site = registry.sites.find(s => s.id === id);
  if (!site) return res.status(404).json({ error: 'Site non trouve' });

  // Optionally delete files if deleteFiles=true in body
  if (req.body && req.body.deleteFiles === true) {
    const dirs = [
      path.join(ROOT_DIR, site.previewsDir),
      path.join(ROOT_DIR, site.blocksDir)
    ];
    const configPath = path.join(ROOT_DIR, site.configFile);
    for (const d of dirs) {
      if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
    }
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  }

  removeSiteFromRegistry(id);
  res.json({ success: true, message: `Site "${id}" supprime du registre` });
});

/**
 * POST /:id/activate — Set the active site cookie.
 */
router.post('/:id/activate', verifyToken, (req, res) => {
  const { id } = req.params;
  const registry = readRegistry();
  const site = registry.sites.find(s => s.id === id);

  if (!site) return res.status(404).json({ error: 'Site non trouve' });

  res.cookie('gds_active_site', id, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60 * 1000 // 1 year
  });

  res.json({ success: true, activeSiteId: id, site });
});

module.exports = router;
