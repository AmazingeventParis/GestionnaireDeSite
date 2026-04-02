const supabase = require('../lib/supabase');

// In-memory cache of redirections
let redirectCache = null;
let cacheLoadedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadRedirects() {
  try {
    const { data, error } = await supabase
      .from('site_manager_redirections')
      .select('source_path, target_path, status_code')
      .eq('is_active', true);

    if (error) {
      console.error('[Redirects] Failed to load:', error.message);
      return null;
    }

    const map = new Map();
    for (const r of (data || [])) {
      map.set(r.source_path, { target: r.target_path, code: r.status_code });
    }
    return map;
  } catch (err) {
    console.error('[Redirects] Load error:', err.message);
    return null;
  }
}

function invalidateRedirectCache() {
  redirectCache = null;
  cacheLoadedAt = 0;
}

async function redirectHandler(req, res, next) {
  // Only handle GET requests on non-API paths
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    return next();
  }

  // Load/refresh cache
  const now = Date.now();
  if (!redirectCache || (now - cacheLoadedAt) > CACHE_TTL) {
    redirectCache = await loadRedirects();
    cacheLoadedAt = now;
  }

  if (!redirectCache) return next();

  // Check exact match
  const match = redirectCache.get(req.path);
  if (match) {
    // Increment hit count asynchronously (fire and forget)
    supabase
      .from('site_manager_redirections')
      .update({ hit_count: supabase.raw('hit_count + 1'), last_hit_at: new Date().toISOString() })
      .eq('source_path', req.path)
      .then(() => {})
      .catch(() => {});

    return res.redirect(match.code, match.target);
  }

  // Check with/without trailing slash
  const altPath = req.path.endsWith('/') ? req.path.slice(0, -1) : req.path + '/';
  const altMatch = redirectCache.get(altPath);
  if (altMatch) {
    return res.redirect(altMatch.code, altMatch.target);
  }

  next();
}

module.exports = { redirectHandler, invalidateRedirectCache };
