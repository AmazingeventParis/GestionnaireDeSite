const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requetes, reessayez dans une minute' }
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
