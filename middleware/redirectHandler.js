const supabase = require('../lib/supabase');

// In-memory cache of redirections (refreshed every 5 minutes)
let redirectCache = new Map();
let lastCacheRefresh = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load all active redirections into the cache Map.
 * Key: source_path, Value: { target: target_path, code: status_code, id: id }
 */
async function refreshRedirectCache() {
  const now = Date.now();
  if (now - lastCacheRefresh < CACHE_TTL) return;

  try {
    const { data } = await supabase
      .from('site_manager_redirections')
      .select('id, source_path, target_path, status_code')
      .eq('is_active', true);

    redirectCache = new Map();
    if (data) {
      for (const r of data) {
        redirectCache.set(r.source_path, {
          target: r.target_path,
          code: r.status_code || 301,
          id: r.id
        });
      }
    }
    lastCacheRefresh = now;
  } catch (err) {
    console.error('[RedirectHandler] Cache refresh failed:', err.message);
  }
}

/**
 * Force cache invalidation (called after creating/updating/deleting redirections).
 */
function invalidateRedirectCache() {
  lastCacheRefresh = 0;
}

/**
 * Middleware: check incoming request path against cached redirections.
 * If a match is found, send a 301/302 redirect and increment hit_count asynchronously.
 */
async function redirectHandler(req, res, next) {
  // Only handle GET/HEAD requests for redirects
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }

  await refreshRedirectCache();

  const match = redirectCache.get(req.path);
  if (!match) {
    return next();
  }

  // Increment hit_count asynchronously (non-blocking)
  supabase
    .from('site_manager_redirections')
    .update({ hit_count: supabase.rpc ? undefined : undefined })
    .eq('id', match.id)
    .then(() => {
      // Use raw SQL increment via rpc or manual increment
      return supabase.rpc('increment_redirect_hits', { redirect_id: match.id }).catch(() => {
        // Fallback: read current count and increment
        return supabase
          .from('site_manager_redirections')
          .select('hit_count')
          .eq('id', match.id)
          .single()
          .then(({ data }) => {
            if (data) {
              return supabase
                .from('site_manager_redirections')
                .update({ hit_count: (data.hit_count || 0) + 1 })
                .eq('id', match.id);
            }
          });
      });
    })
    .catch(err => {
      console.error('[RedirectHandler] Hit count update failed:', err.message);
    });

  // Send redirect response
  res.redirect(match.code, match.target);
}

module.exports = { redirectHandler, invalidateRedirectCache };
