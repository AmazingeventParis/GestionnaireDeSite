const { AsyncLocalStorage } = require('async_hooks');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Legacy = Shootnbox — paths identical to existing hardcoded constants
const LEGACY = {
  id: null,
  isLegacy: true,
  previewsDir:  path.join(ROOT, 'previews'),
  imagesDir:    path.join(ROOT, 'public', 'site-images'),
  bannersDir:   path.join(ROOT, 'previews', '_shared', 'banners'),
  blocksDir:    path.join(ROOT, 'blocks'),
  configPath:   path.join(ROOT, 'site-config.json'),
  sharedDir:    path.join(ROOT, 'previews', '_shared'),
  blogIndexPath: path.join(ROOT, 'previews', '_blog-index.json'),
};

const storage = new AsyncLocalStorage();

/**
 * Returns the active site context for the current async request.
 * Falls back to LEGACY (Shootnbox) when called outside a request or
 * when no X-Site-Id header was present — guaranteeing zero impact on
 * all existing Shootnbox behaviour.
 */
function getActiveSite() {
  return storage.getStore() || LEGACY;
}

/**
 * Express middleware: resolves the active site from the X-Site-Id request
 * header and stores it in AsyncLocalStorage so any code in the call chain
 * can access it via getActiveSite() without explicit param threading.
 *
 * Rules:
 *  - No header, empty, or 'shootnbox' → LEGACY (Shootnbox, unchanged behaviour)
 *  - Invalid format (not ^[a-z0-9-]{1,64}$) → LEGACY (silently ignored, safe)
 *  - Valid siteId → scoped paths under previews/_sites/{siteId}/
 */
function activeSiteMiddleware(req, res, next) {
  const raw = (req.headers['x-site-id'] || req.query.site || '').trim().toLowerCase();

  let site;
  if (!raw || raw === 'shootnbox' || !/^[a-z0-9-]{1,64}$/.test(raw)) {
    site = LEGACY;
  } else {
    const base = path.join(ROOT, 'previews', '_sites', raw);
    site = {
      id: raw,
      isLegacy: false,
      previewsDir:  base,
      imagesDir:    path.join(ROOT, 'public', 'site-images', '_sites', raw),
      bannersDir:   path.join(base, '_banners'),
      blocksDir:    path.join(ROOT, 'blocks', '_sites', raw),
      configPath:   path.join(base, '_config.json'),
      sharedDir:    path.join(base, '_shared'),
      blogIndexPath: path.join(base, '_blog-index.json'),
    };
  }

  req.activeSite = site;
  storage.run(site, next);
}

module.exports = { activeSiteMiddleware, getActiveSite, LEGACY };
