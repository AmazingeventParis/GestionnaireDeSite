const { logSecurityEvent } = require('../utils/audit');

const THREAT_PATTERNS = {
  sql_injection: [
    /('|"|;)\s*(OR|AND|UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)/i,
    /UNION\s+(ALL\s+)?SELECT/i,
    /(\%27|\')\s*(OR|AND)/i,
    /SLEEP\s*\(\d+\)/i,
    /BENCHMARK\s*\(/i
  ],
  xss: [
    /<script[\s>]/i,
    /javascript\s*:/i,
    /on(error|load|click|mouseover|mouseout|focus|blur)\s*=/i,
    /\beval\s*\(/i,
    /document\.(cookie|location|write)/i
  ],
  path_traversal: [
    /\.\.\//,
    /\.\.%2[fF]/,
    /etc\/(passwd|shadow|hosts)/i,
    /proc\/self/i,
    /\bboot\.ini\b/i
  ],
  scanner: [
    /wp-(admin|login|content|includes)/i,
    /phpmyadmin/i,
    /\/\.env$/i,
    /\.(php|asp|aspx|jsp|cgi)$/i,
    /xmlrpc\.php/i,
    /(phpinfo|shell|backdoor|c99|r57)/i,
    /\/\.git\//i,
    /\/\.htaccess/i,
    /\/admin\.php/i,
    /\/config\.(php|bak|old)/i
  ]
};

function checkString(str) {
  if (!str || typeof str !== 'string') return null;
  for (const [type, patterns] of Object.entries(THREAT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(str)) {
        return { type, pattern: pattern.toString() };
      }
    }
  }
  return null;
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress;
}

async function threatDetector(req, res, next) {
  const stringsToCheck = [
    req.path,
    req.originalUrl,
    JSON.stringify(req.query),
    typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
  ];

  for (const str of stringsToCheck) {
    const threat = checkString(str);
    if (threat) {
      const ip = getClientIp(req);
      const severity = threat.type === 'sql_injection' || threat.type === 'xss' ? 'high' : 'medium';

      // Log asynchronously, don't block response
      logSecurityEvent({
        ip,
        method: req.method,
        path: req.originalUrl,
        body: str.slice(0, 500),
        threatType: threat.type,
        severity,
        blocked: true
      });

      return res.status(403).json({ error: 'Requete bloquee' });
    }
  }

  next();
}

threatDetector.getClientIp = getClientIp;

module.exports = threatDetector;
