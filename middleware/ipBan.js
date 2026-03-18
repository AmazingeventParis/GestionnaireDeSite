const supabase = require('../lib/supabase');
const { getClientIp } = require('./threatDetector');

// In-memory cache of banned IPs (refreshed every 5 minutes)
let banCache = new Map();
let lastCacheRefresh = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function refreshBanCache() {
  const now = Date.now();
  if (now - lastCacheRefresh < CACHE_TTL) return;

  try {
    const { data } = await supabase
      .from('site_manager_ip_bans')
      .select('ip_address, expires_at')
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());

    banCache = new Map();
    if (data) {
      for (const ban of data) {
        banCache.set(ban.ip_address, ban.expires_at);
      }
    }
    lastCacheRefresh = now;
  } catch (err) {
    console.error('[IPBan] Cache refresh failed:', err.message);
  }
}

async function ipBanCheck(req, res, next) {
  await refreshBanCache();

  const ip = getClientIp(req);
  if (!ip) return next();

  const ban = banCache.get(ip);
  if (ban !== undefined) {
    // Check if ban has expired
    if (ban === null || new Date(ban) > new Date()) {
      return res.status(403).json({ error: 'Adresse IP bloquee' });
    }
  }

  next();
}

// Force cache refresh (called after banning/unbanning)
function invalidateBanCache() {
  lastCacheRefresh = 0;
}

module.exports = { ipBanCheck, invalidateBanCache };
