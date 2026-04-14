const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');

const BANNERS_DIR = path.join(__dirname, '..', 'banners');
if (!fs.existsSync(BANNERS_DIR)) fs.mkdirSync(BANNERS_DIR, { recursive: true });

/**
 * Read all banners from disk
 */
function readAllBanners() {
  const files = fs.readdirSync(BANNERS_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(BANNERS_DIR, f), 'utf-8'));
      data.id = f.replace('.json', '');
      return data;
    } catch { return null; }
  }).filter(Boolean);
}

/**
 * Get the currently active banner (highest priority, within date range, enabled)
 */
function getActiveBanner() {
  const now = new Date();
  const banners = readAllBanners()
    .filter(b => {
      if (!b.enabled) return false;
      if (b.startDate && new Date(b.startDate) > now) return false;
      if (b.endDate && new Date(b.endDate) < now) return false;
      return true;
    })
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return banners[0] || null;
}

/**
 * Build the full banner HTML with wrapper, close button, and CSS
 */
function buildBannerHtml(banner) {
  if (!banner) return '';
  const bg = banner.bgColor || '#E51981';
  const color = banner.textColor || '#ffffff';
  const id = banner.id || 'banner';
  const closable = banner.closable !== false;

  const css = `
.snb-promo-banner{width:100%;z-index:998;position:relative;color:${color};font-family:'Raleway',Arial,sans-serif;}
.snb-promo-banner__inner{max-width:1300px;margin:0 auto;display:flex;align-items:center;justify-content:center;padding:12px 20px;gap:12px;font-size:14px;font-weight:600;text-align:center;}
.snb-promo-banner__inner a{color:inherit;text-decoration:underline;}
.snb-promo-banner__close{background:none;border:none;color:inherit;font-size:22px;cursor:pointer;opacity:0.7;padding:0 4px;line-height:1;flex-shrink:0;}
.snb-promo-banner__close:hover{opacity:1;}
@media(max-width:850px){.snb-promo-banner{position:fixed;bottom:0;left:0;right:0;z-index:9998;box-shadow:0 -4px 20px rgba(0,0,0,0.15);}body{padding-bottom:52px;}}
${banner.css || ''}`;

  const closeScript = closable
    ? `onclick="this.closest('.snb-promo-banner').remove();try{sessionStorage.setItem('snb-banner-closed-${id}','1')}catch(e){};var s=document.querySelector('body');if(s)s.style.paddingBottom='0';"`
    : 'style="display:none"';

  const checkClosed = `<script>(function(){try{if(sessionStorage.getItem('snb-banner-closed-${id}')){var b=document.querySelector('.snb-promo-banner[data-banner-id="${id}"]');if(b)b.remove()}}catch(e){}})()</script>`;

  return `<style>${css}</style>
<div class="snb-promo-banner" data-banner-id="${id}" role="complementary" aria-label="Promotion">
<div class="snb-promo-banner__inner">
${banner.html || ''}
<button class="snb-promo-banner__close" aria-label="Fermer" ${closeScript}>&times;</button>
</div>
</div>
${checkClosed}`;
}

// Export for use in pages.js / build.js
module.exports.getActiveBanner = getActiveBanner;
module.exports.buildBannerHtml = buildBannerHtml;

/**
 * GET /active — Public: return active banner HTML (for WordPress & deployed pages)
 */
router.get('/active', (req, res) => {
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
});

/**
 * GET /active.js — Public: JS loader for WordPress/deployed pages
 */
router.get('/active.js', (req, res) => {
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300');
  res.set('Access-Control-Allow-Origin', '*');

  const banner = getActiveBanner();
  if (!banner) return res.send('/* no active banner */');

  const html = buildBannerHtml(banner).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  res.send(`(function(){
  var id='${banner.id}';
  try{if(sessionStorage.getItem('snb-banner-closed-'+id))return;}catch(e){}
  if(document.querySelector('.snb-promo-banner'))return;
  var h=document.querySelector('.snb-header');
  if(!h)return;
  h.insertAdjacentHTML('afterend','${html}');
})();`);
});

/**
 * GET / — List all banners (admin)
 */
router.get('/', verifyToken, (req, res) => {
  try {
    const banners = readAllBanners().map(b => {
      const now = new Date();
      let status = 'disabled';
      if (b.enabled) {
        const start = b.startDate ? new Date(b.startDate) : null;
        const end = b.endDate ? new Date(b.endDate) : null;
        if (end && end < now) status = 'expired';
        else if (start && start > now) status = 'scheduled';
        else status = 'active';
      }
      return {
        id: b.id, name: b.name, status, priority: b.priority || 0,
        startDate: b.startDate, endDate: b.endDate,
        bgColor: b.bgColor, enabled: b.enabled,
        createdAt: b.createdAt
      };
    });
    banners.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    res.json({ banners });
  } catch (err) {
    console.error('[Banners] List error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /:id — Get single banner (admin)
 */
router.get('/:id', verifyToken, (req, res) => {
  try {
    const id = req.params.id.replace(/[^a-z0-9-_]/gi, '');
    const filePath = path.join(BANNERS_DIR, id + '.json');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Banniere non trouvee' });
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    data.id = id;
    res.json({ banner: data });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST / — Create banner (admin/editor)
 */
router.post('/', verifyToken, requireRole('admin', 'editor'), (req, res) => {
  try {
    const { name, html, css, bgColor, textColor, linkUrl, startDate, endDate, priority, closable, enabled } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });

    const id = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filePath = path.join(BANNERS_DIR, id + '.json');

    const banner = {
      name, html: html || '', css: css || '',
      bgColor: bgColor || '#E51981', textColor: textColor || '#ffffff',
      linkUrl: linkUrl || '', startDate: startDate || null, endDate: endDate || null,
      priority: parseInt(priority) || 0, closable: closable !== false, enabled: !!enabled,
      createdAt: new Date().toISOString(), createdBy: req.user.id,
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(filePath, JSON.stringify(banner, null, 2), 'utf-8');

    logAudit({
      userId: req.user.id, action: 'create', entityType: 'banner', entityId: id,
      details: { name }, ip: getClientIp(req), userAgent: req.headers['user-agent']
    });

    res.status(201).json({ banner: { ...banner, id } });
  } catch (err) {
    console.error('[Banners] Create error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * PUT /:id — Update banner (admin/editor)
 */
router.put('/:id', verifyToken, requireRole('admin', 'editor'), (req, res) => {
  try {
    const id = req.params.id.replace(/[^a-z0-9-_]/gi, '');
    const filePath = path.join(BANNERS_DIR, id + '.json');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Banniere non trouvee' });

    const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const fields = ['name', 'html', 'css', 'bgColor', 'textColor', 'linkUrl', 'startDate', 'endDate', 'priority', 'closable', 'enabled'];
    for (const f of fields) {
      if (req.body[f] !== undefined) existing[f] = req.body[f];
    }
    if (req.body.priority !== undefined) existing.priority = parseInt(req.body.priority) || 0;
    existing.updatedAt = new Date().toISOString();

    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');

    logAudit({
      userId: req.user.id, action: 'update', entityType: 'banner', entityId: id,
      details: { name: existing.name }, ip: getClientIp(req), userAgent: req.headers['user-agent']
    });

    res.json({ banner: { ...existing, id } });
  } catch (err) {
    console.error('[Banners] Update error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * DELETE /:id — Delete banner (admin only)
 */
router.delete('/:id', verifyToken, requireRole('admin'), (req, res) => {
  try {
    const id = req.params.id.replace(/[^a-z0-9-_]/gi, '');
    const filePath = path.join(BANNERS_DIR, id + '.json');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Banniere non trouvee' });

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    fs.unlinkSync(filePath);

    logAudit({
      userId: req.user.id, action: 'delete', entityType: 'banner', entityId: id,
      details: { name: data.name }, ip: getClientIp(req), userAgent: req.headers['user-agent']
    });

    res.json({ message: 'Banniere supprimee' });
  } catch (err) {
    console.error('[Banners] Delete error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
