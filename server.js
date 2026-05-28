require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');

// Validate required env vars
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`FATAL: ${key} is not set in environment`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// ===== GLOBAL MIDDLEWARE (order matters — follows security pipeline) =====

// 1. IP Ban check
const { ipBanCheck } = require('./middleware/ipBan');
app.use(ipBanCheck);

// 2. Rate limiting
const { generalLimiter } = require('./middleware/rateLimiter');
app.use('/api/', generalLimiter);

// 3. Threat detection
const threatDetector = require('./middleware/threatDetector');
app.use('/api/', threatDetector);

// 4. Security headers
const securityHeaders = require('./middleware/securityHeaders');
app.use(securityHeaders);

// 5. Request logging
const { requestLogger, logger } = require('./middleware/requestLogger');
app.use(requestLogger);

// 6. Body parsing & cookies
app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

// 7. CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://admin.swipego.app', 'https://gestionnaire.swipego.app', 'https://shootnbox.fr', 'https://www.shootnbox.fr', 'https://smakk.fr', 'https://www.smakk.fr']
    : true,
  credentials: true
}));

// 8. Redirect handler (WordPress migration + custom redirects)
try {
  const { redirectHandler } = require('./middleware/redirectHandler');
  app.use(redirectHandler);
} catch (e) {
  console.warn('Redirect handler not loaded:', e.message);
}

// ===== MULTI-SITE CONTEXT =====
// Resolves X-Site-Id header → req.activeSite (LEGACY for Shootnbox, scoped for new sites)
const { activeSiteMiddleware } = require('./middleware/activeSite');
app.use('/api/', activeSiteMiddleware);

// ===== API ROUTES =====

// Auth (no auth middleware needed — it handles its own)
app.use('/api/auth', require('./routes/auth'));

// Protected routes
app.use('/api/sites', require('./routes/sites'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/credentials', require('./routes/credentials'));
app.use('/api/monitors', require('./routes/monitors'));
app.use('/api/stats', require('./routes/stats'));

// Public routes (no auth)
app.use('/api/contact-form', require('./routes/contact-form'));

// Phase 2 routes (pages, settings) — mounted when files exist
let pagesRouter;
try { pagesRouter = require('./routes/pages'); app.use('/api/pages', pagesRouter); } catch {}
try { app.use('/api/settings', require('./routes/settings')); } catch {}

// Phase 3 routes (media, navigation, seo, blocks, blog, shared)
try { app.use('/api/media', require('./routes/media')); } catch {}
try { app.use('/api/blocks', require('./routes/blocks')); } catch {}
try { app.use('/api/blog', require('./routes/blog')); } catch {}
try { app.use('/api/shared', require('./routes/shared')); } catch {}
try { app.use('/api/banners', require('./routes/banners')); } catch {}
try { app.use('/api/navigation', require('./routes/navigation')); } catch {}
try { app.use('/api/seo', require('./routes/seo')); } catch {}
try { app.use('/api/audit', require('./routes/audit')); } catch {}
try { app.use('/api/puppeteer-audit', require('./routes/puppeteer-audit')); } catch {}

// Phase 4 routes (security, performance, monitoring, activity)
try { app.use('/api/security', require('./routes/security')); } catch {}
try { app.use('/api/performance', require('./routes/performance')); } catch {}
try { app.use('/api/monitoring', require('./routes/monitoring')); } catch {}
try { app.use('/api/activity', require('./routes/activity')); } catch {}

// Phase 5 routes (backups, deploy, redirections, schedule, users)
try { app.use('/api/backups', require('./routes/backups')); } catch {}
try { app.use('/api/deploy', require('./routes/deploy')); } catch {}
try { app.use('/api/redirections', require('./routes/redirections')); } catch {}
try { app.use('/api/schedule', require('./routes/schedule')); } catch {}
try { app.use('/api/users', require('./routes/users')); } catch {}
try { app.use('/api/reviews', require('./routes/reviews')); } catch {}

// ===== STATIC FILES =====
// Public assets are served cross-origin because deployed pages (shootnbox.fr,
// smakk.fr) reference them from this origin. They need CORS + a long cache.
// Cross-Origin-Resource-Policy must be 'cross-origin' to override Helmet's default.
// IMPORTANT: these specific dir handlers MUST come BEFORE the generic static below,
// otherwise the generic handler (maxAge:0) catches everything first and kills caching.
const PUBLIC_DIR = path.join(__dirname, 'public');
const _isProd = process.env.NODE_ENV === 'production';
// Admin JS/CSS change frequently — never cache them long even though they live in /css /js.
const _ADMIN_ASSET = /(?:^|[\\/])(admin-[\w-]+|auth|components|settings|responsive-preview)\.(?:js|css)$/i;
function _cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}
function _hImmutable(res) { _cors(res); if (_isProd) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); }
function _hMedia(res)     { _cors(res); if (_isProd) res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400'); }
function _hCode(res, fp)  {
  _cors(res);
  if (!_isProd) return;
  if (_ADMIN_ASSET.test(fp)) res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  else res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400');
}
app.use('/fonts', express.static(path.join(PUBLIC_DIR, 'fonts'), { etag: true, setHeaders: (res) => _hImmutable(res) }));
app.use('/site-images', express.static(path.join(PUBLIC_DIR, 'site-images'), { etag: true, setHeaders: (res) => _hMedia(res) }));
app.use('/images', express.static(path.join(PUBLIC_DIR, 'images'), { etag: true, setHeaders: (res) => _hMedia(res) }));
app.use('/css', express.static(path.join(PUBLIC_DIR, 'css'), { etag: true, setHeaders: (res, fp) => _hCode(res, fp) }));
app.use('/js', express.static(path.join(PUBLIC_DIR, 'js'), { etag: true, setHeaders: (res, fp) => _hCode(res, fp) }));

// Generic fallback for any other public file (admin HTML at root, etc.) — no cache.
app.use(express.static(PUBLIC_DIR, {
  maxAge: 0,
  etag: true,
  setHeaders: (res) => _cors(res)
}));

// ===== SITE PREVIEW (built pages served at /site/) =====
app.use('/site', express.static(path.join(PUBLIC_DIR, 'site'), {
  maxAge: 0, etag: true, extensions: ['html'], index: ['index.html']
}));
// Fallback for /site/slug/ paths — serve index.html from subdirectory
app.use('/site', (req, res, next) => {
  const fs = require('fs');
  const sitePath = path.join(PUBLIC_DIR, 'site', req.path, 'index.html');
  if (fs.existsSync(sitePath)) return res.sendFile(sitePath);
  next();
});

// ===== URL PATH ROUTING — serve /location-photobooth-xxx/ directly (no redirect) =====
function servePageBySlug(slug, req, res, next) {
  if (!pagesRouter) return next();
  req.url = '/' + slug + '/preview';
  req.params = {};
  pagesRouter(req, res, next);
}
app.get('/location-photobooth-:city/', (req, res, next) => {
  servePageBySlug(req.params.city.replace(/[^a-z0-9-]/gi, ''), req, res, next);
});
app.get('/location-photobooth/:city/', (req, res, next) => {
  servePageBySlug(req.params.city.replace(/[^a-z0-9-]/gi, ''), req, res, next);
});

// ===== DYNAMIC PAGE ROUTING — serve any page by slug or urlPath =====
// Builds a slug→urlPath map from previews/ directories and seo.json files.
// This allows /ring/, /mariage/, /location-photobooth/ etc. to serve their preview.
(function setupPageRoutes() {
  const fs = require('fs');
  const previewsDir = path.join(__dirname, 'previews');

  // urlPath → slug map (built once at startup, refreshed on cache miss)
  let urlPathMap = null;

  function buildUrlPathMap() {
    const map = new Map();
    if (!fs.existsSync(previewsDir)) return map;
    const dirs = fs.readdirSync(previewsDir).filter(d => {
      if (d.startsWith('_')) return false;
      return fs.statSync(path.join(previewsDir, d)).isDirectory();
    });
    for (const slug of dirs) {
      // By default, urlPath = slug
      map.set('/' + slug, slug);
      // Override with seo.json urlPath if present
      const seoPath = path.join(previewsDir, slug, 'seo.json');
      if (fs.existsSync(seoPath)) {
        try {
          const seo = JSON.parse(fs.readFileSync(seoPath, 'utf-8'));
          if (seo.urlPath) {
            const p = '/' + seo.urlPath.replace(/^\//, '').replace(/\/$/, '');
            map.set(p, slug);
          }
        } catch {}
      }
    }
    return map;
  }

  app.get('/:path(*)', (req, res, next) => {
    // Only handle clean URL paths (no dots = not a file request)
    if (req.path.includes('.')) return next();
    // Skip admin and API paths
    if (req.path.startsWith('/api/') || req.path.startsWith('/site/')) return next();

    if (!urlPathMap) urlPathMap = buildUrlPathMap();

    // Normalize: strip trailing slash, keep leading slash
    const normalized = req.path.replace(/\/+$/, '') || '/';
    const slug = urlPathMap.get(normalized);
    if (!slug) return next();

    servePageBySlug(slug, req, res, next);
  });
})();

// ===== API 404 =====
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Route API non trouvee' });
});

// ===== SPA FALLBACK =====
app.get('*', (req, res) => {
  // Check if file exists in public
  const filePath = path.join(__dirname, 'public', req.path);
  const fs = require('fs');
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return res.sendFile(filePath);
  }
  // For known HTML pages, serve them; otherwise 404
  const htmlPath = path.join(__dirname, 'public', req.path.endsWith('.html') ? req.path : 'index.html');
  if (fs.existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== GLOBAL ERROR HANDLER =====
app.use((err, req, res, next) => {
  logger.error({ err: err.message, stack: err.stack, path: req.path });
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Erreur interne' : err.message
  });
});

// ===== SCHEDULER: Reviews refresh via SerpAPI =====
// Generic scheduler factory — handles both Shootnbox (weekly) and Smakk (monthly).
function scheduleReviewsFetch({ label, outputPath, placeId, dataId, intervalMs, checkEveryMs, startDelayMs }) {
  if (!process.env.SERPAPI_KEY) return;
  let running = false;

  async function checkAndFetch() {
    if (running) return;
    try {
      const fs = require('fs');
      let lastUpdated = 0;
      if (fs.existsSync(outputPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
          if (data.lastUpdated) lastUpdated = new Date(data.lastUpdated).getTime();
        } catch {}
      }
      if (Date.now() - lastUpdated < intervalMs) return;

      running = true;
      logger.info(`[${label}] Fetch starting`);
      const { fetchReviews } = require('./scripts/fetch-reviews-serpapi');
      const data = await fetchReviews({ silent: true, placeId, dataId, outputPath });
      logger.info(`[${label}] Done — ${data.reviews.length} reviews, ${data.pagesFetched} pages`);
    } catch (err) {
      logger.error(`[${label}] Failed: ${err.message}`);
    } finally {
      running = false;
    }
  }

  setTimeout(checkAndFetch, startDelayMs);
  setInterval(checkAndFetch, checkEveryMs);
  logger.info(`[${label}] Scheduler started`);
}

if (process.env.SERPAPI_KEY) {
  // Shootnbox — refresh weekly, check every 6h
  scheduleReviewsFetch({
    label: 'reviews-snb',
    outputPath: path.join(__dirname, 'previews', '_shared', 'reviews.json'),
    dataId: process.env.SERPAPI_DATA_ID || '0x47e6712e441122c5:0x1279821f9a25615f',
    placeId: process.env.SERPAPI_PLACE_ID || 'ChIJxSIRRC5x5kcRX2Elmh-CeRI',
    intervalMs: 7 * 24 * 60 * 60 * 1000,
    checkEveryMs: 6 * 60 * 60 * 1000,
    startDelayMs: 60 * 1000,
  });

  // Smakk — refresh monthly, check every 24h
  if (process.env.SERPAPI_SMAKK_PLACE_ID) {
    scheduleReviewsFetch({
      label: 'reviews-smakk',
      outputPath: path.join(__dirname, 'previews', '_sites', 'cb56296b-27d3-463c-a38f-76c764911746', '_shared', 'reviews.json'),
      placeId: process.env.SERPAPI_SMAKK_PLACE_ID,
      intervalMs: 30 * 24 * 60 * 60 * 1000,
      checkEveryMs: 24 * 60 * 60 * 1000,
      startDelayMs: 90 * 1000,
    });
  }
} else {
  logger.info('[reviews-cron] SERPAPI_KEY not set — schedulers disabled');
}

// ===== START =====
app.listen(PORT, () => {
  logger.info(`Gestionnaire de Site running on port ${PORT}`);
});

module.exports = app;
