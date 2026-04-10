/**
 * activeSite middleware — Multi-site support
 *
 * Reads the `gds_active_site` cookie to determine which GDS-managed site is
 * active for this request. Sets req.activeSite with resolved absolute paths
 * and propagates the context via AsyncLocalStorage so that route helpers
 * (like getPD() in pages.js) can access it without needing req passed down.
 */

const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

// Registry lives in the previews/ volume so it persists across Docker deploys.
// Fallback: root gds-managed-sites.json (for local dev / first boot).
const REGISTRY_PATH = path.join(__dirname, '..', 'previews', '_sites-registry.json');
const REGISTRY_FALLBACK = path.join(__dirname, '..', 'gds-managed-sites.json');
const DEFAULT_SITE_ID = 'shootnbox';

// Exported AsyncLocalStorage instance — used by routes to get active site paths
const siteStorage = new AsyncLocalStorage();

/**
 * Read the GDS sites registry from disk.
 * Tries the volume path first, falls back to the root fallback file.
 * If neither exists, auto-creates with Shootnbox defaults.
 */
function readRegistry() {
  for (const p of [REGISTRY_PATH, REGISTRY_FALLBACK]) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      }
    } catch (e) {
      console.warn('[activeSite] Registry read error at', p, ':', e.message);
    }
  }
  // Auto-create default registry (first boot on empty volume)
  const defaultRegistry = {
    sites: [{
      id: 'shootnbox', name: 'Shootnbox', domain: 'shootnbox.fr',
      description: 'Location photobooth Paris & Bordeaux',
      previewsDir: 'previews', configFile: 'site-config.json', blocksDir: 'blocks',
      logo: '/images/logo/shootnbox-logo-new-1.webp', color: '#E51981',
      status: 'active', createdAt: new Date().toISOString()
    }]
  };
  try {
    fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(defaultRegistry, null, 2), 'utf-8');
  } catch (e) {}
  return defaultRegistry;
}

/**
 * Resolve a GDS site object into one with absolute filesystem paths.
 */
function resolveSite(site) {
  const root = path.join(__dirname, '..');
  return {
    ...site,
    previewsDir: path.join(root, site.previewsDir),
    configPath: path.join(root, site.configFile),
    blocksDir: path.join(root, site.blocksDir)
  };
}

/**
 * Express middleware.
 * Sets req.activeSite and runs next() inside the AsyncLocalStorage context.
 */
function activeSiteMiddleware(req, res, next) {
  const siteId = (req.cookies && req.cookies.gds_active_site) || DEFAULT_SITE_ID;
  const registry = readRegistry();

  let site = registry.sites.find(s => s.id === siteId);
  if (!site) site = registry.sites.find(s => s.id === DEFAULT_SITE_ID);
  if (!site) site = registry.sites[0];

  if (site) {
    req.activeSite = resolveSite(site);
    siteStorage.run(req.activeSite, next);
  } else {
    next();
  }
}

/**
 * Read the registry, write a site entry (add or replace by id), save.
 * Always writes to the volume path (REGISTRY_PATH).
 */
function writeSiteToRegistry(siteData) {
  const registry = readRegistry();
  const idx = registry.sites.findIndex(s => s.id === siteData.id);
  if (idx >= 0) {
    registry.sites[idx] = siteData;
  } else {
    registry.sites.push(siteData);
  }
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
}

/**
 * Remove a site from the registry by id.
 */
function removeSiteFromRegistry(id) {
  const registry = readRegistry();
  registry.sites = registry.sites.filter(s => s.id !== id);
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
}

module.exports = {
  activeSiteMiddleware,
  siteStorage,
  readRegistry,
  resolveSite,
  writeSiteToRegistry,
  removeSiteFromRegistry
};
