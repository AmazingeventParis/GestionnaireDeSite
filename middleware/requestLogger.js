const pino = require('pino');

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined
});

function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]({
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: duration + 'ms',
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
      user: req.user?.email || 'anonymous'
    });
  });

  next();
}

module.exports = { requestLogger, logger };
