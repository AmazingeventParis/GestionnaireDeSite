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
app.use(cookieParser());

// 7. CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://admin.swipego.app', 'https://gestionnaire.swipego.app']
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

// Phase 2 routes (pages, settings) — mounted when files exist
try { app.use('/api/pages', require('./routes/pages')); } catch {}
try { app.use('/api/settings', require('./routes/settings')); } catch {}

// Phase 3 routes (media, navigation, seo, blocks, blog, shared)
try { app.use('/api/media', require('./routes/media')); } catch {}
try { app.use('/api/blocks', require('./routes/blocks')); } catch {}
try { app.use('/api/blog', require('./routes/blog')); } catch {}
try { app.use('/api/shared', require('./routes/shared')); } catch {}
try { app.use('/api/navigation', require('./routes/navigation')); } catch {}
try { app.use('/api/seo', require('./routes/seo')); } catch {}
try { app.use('/api/audit', require('./routes/audit')); } catch {}

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
// No cache on admin JS/CSS (they change frequently during development)
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  etag: true
}));

// ===== SITE PREVIEW (built pages served at /site/) =====
app.use('/site', express.static(path.join(__dirname, 'public', 'site'), {
  maxAge: 0, etag: true, extensions: ['html'], index: ['index.html']
}));
// Fallback for /site/slug/ paths — serve index.html from subdirectory
app.use('/site', (req, res, next) => {
  const fs = require('fs');
  const sitePath = path.join(__dirname, 'public', 'site', req.path, 'index.html');
  if (fs.existsSync(sitePath)) return res.sendFile(sitePath);
  next();
});
// Serve site images
app.use('/site-images', express.static(path.join(__dirname, 'public', 'site-images'), {
  maxAge: process.env.NODE_ENV === 'production' ? '365d' : 0, etag: true
}));

// ===== URL PATH ROUTING — redirect /location-photobooth-xxx/ to page preview =====
app.get('/location-photobooth-:city/', (req, res) => {
  const city = req.params.city.replace(/[^a-z0-9-]/gi, '');
  res.redirect('/api/pages/' + city + '/preview');
});
app.get('/location-photobooth/:city/', (req, res) => {
  const city = req.params.city.replace(/[^a-z0-9-]/gi, '');
  res.redirect('/api/pages/' + city + '/preview');
});

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

// ===== START =====
app.listen(PORT, () => {
  logger.info(`Gestionnaire de Site running on port ${PORT}`);
});

module.exports = app;
