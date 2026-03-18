const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requetes, reessayez dans une minute' },
  skip: (req) => {
    // Don't rate limit static assets and site pages
    if (req.path.startsWith('/site') || req.path.startsWith('/site-images') ||
        req.path.startsWith('/fonts') || req.path.startsWith('/css') ||
        req.path.startsWith('/js') || req.path.endsWith('.html') ||
        req.path.endsWith('.css') || req.path.endsWith('.js') ||
        req.path.endsWith('.webp') || req.path.endsWith('.woff2')) {
      return true;
    }
    return false;
  }
});

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion, reessayez dans une minute' },
  keyGenerator: ipKeyGenerator
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Trop d\'uploads, reessayez dans une minute' }
});

module.exports = { generalLimiter, loginLimiter, uploadLimiter };
