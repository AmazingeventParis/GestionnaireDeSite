const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const { getActiveSite } = require('../middleware/activeSite');
const _DEFAULT_SHARED = path.join(__dirname, '..', 'previews', '_shared');
function getSharedDir() { return getActiveSite().sharedDir || _DEFAULT_SHARED; }

/**
 * GET /header — Serve shared header HTML (public, no auth required)
 * For WordPress integration: fetch and cache this HTML
 */
router.get('/header', (req, res) => {
  const headerPath = path.join(getSharedDir(), 'header.html');
  if (!fs.existsSync(headerPath)) {
    return res.status(404).json({ error: 'Header not found' });
  }
  const html = fs.readFileSync(headerPath, 'utf-8');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300'); // 5 min cache
  res.set('Access-Control-Allow-Origin', '*');
  res.send(html);
});

/**
 * GET /banner — Serve active banner HTML (public, no auth required)
 * For WordPress integration: same pattern as header/footer
 */
router.get('/banner', (req, res) => {
  try {
    const { getActiveBanner, buildBannerHtml } = require('./banners');
    const banner = getActiveBanner();
    if (!banner) {
      res.set('Cache-Control', 'public, max-age=300');
      return res.status(204).send('');
    }
    const html = buildBannerHtml(banner);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(html);
  } catch (err) {
    res.status(204).send('');
  }
});

/**
 * GET /footer — Serve shared footer HTML (public, no auth required)
 */
router.get('/footer', (req, res) => {
  const footerPath = path.join(getSharedDir(), 'footer.html');
  if (!fs.existsSync(footerPath)) {
    return res.status(404).json({ error: 'Footer not found' });
  }
  const html = fs.readFileSync(footerPath, 'utf-8');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300');
  res.set('Access-Control-Allow-Origin', '*');
  res.send(html);
});

/**
 * GET /critical-css — Serve critical CSS (fonts + resets) for WordPress to include
 */
router.get('/critical-css', (req, res) => {
  const configPath = path.join(__dirname, '..', 'site-config.json');
  let bgColor = '#f8eaff';
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    bgColor = config.colors?.bgAlt || bgColor;
  } catch (e) {}

  const css = `@font-face{font-family:'Raleway';font-style:normal;font-weight:400 900;font-display:swap;src:url(/fonts/raleway-latin.woff2) format('woff2')}
@font-face{font-family:'Raleway';font-style:italic;font-weight:900;font-display:swap;src:url(/fonts/raleway-900i-latin.woff2) format('woff2')}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;padding:0;font-family:"Raleway",sans-serif;color:#333;line-height:1.6;background:${bgColor};-webkit-font-smoothing:antialiased}
.snb-page-wrapper{overflow-x:hidden}
a{text-decoration:none;color:inherit}
img{max-width:100%;height:auto}
.snb-page-content{padding-top:72px}
@media(max-width:850px){.snb-page-content{padding-top:60px}}`;

  res.set('Content-Type', 'text/css; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300');
  res.set('Access-Control-Allow-Origin', '*');
  res.send(css);
});

/**
 * PUT /header — Update shared header HTML (admin only)
 */
router.put('/header', verifyToken, requireRole('admin'), (req, res) => {
  const { html } = req.body;
  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'html field required' });
  }
  const headerPath = path.join(getSharedDir(), 'header.html');
  fs.writeFileSync(headerPath, html, 'utf-8');
  res.json({ success: true, size: html.length });
});

/**
 * PUT /footer — Update shared footer HTML (admin only)
 */
router.put('/footer', verifyToken, requireRole('admin'), (req, res) => {
  const { html } = req.body;
  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'html field required' });
  }
  const footerPath = path.join(getSharedDir(), 'footer.html');
  fs.writeFileSync(footerPath, html, 'utf-8');
  res.json({ success: true, size: html.length });
});

module.exports = router;
