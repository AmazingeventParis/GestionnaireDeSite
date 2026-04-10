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

const REGISTRY_PATH = path.join(__dirname, '..', 'gds-managed-sites.json');
const DEFAULT_SITE_ID = 'shootnbox';

// Exported AsyncLocalStorage instance — used by routes to get active site paths
const siteStorage = new AsyncLocalStorage();

/**
 * Read the GDS sites registry from disk (no caching — file is small and changes rarely).
 */
function readRegistry() {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn('[activeSite] Registry read error:', e.message);
  }
  return { sites: [] };
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
 */
function writeSiteToRegistry(siteData) {
  const registry = readRegistry();
  const idx = registry.sites.findIndex(s => s.id === siteData.id);
  if (idx >= 0) {
    registry.sites[idx] = siteData;
  } else {
    registry.sites.push(siteData);
  }
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
}

/**
 * Remove a site from the registry by id.
 */
function removeSiteFromRegistry(id) {
  const registry = readRegistry();
  registry.sites = registry.sites.filter(s => s.id !== id);
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
