const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');
const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

const CONFIG_PATH = path.join(__dirname, '..', 'site-config.json');
const COOLIFY_HOST = 'http://217.182.89.133:8000';
const BASE_GDS = 'https://sites.swipego.app';
const MANAGER_MPH = 'https://shootnbox.fr/manager/m.php';

// ── Shootnbox deploy helpers ──────────────────────────────────────────────────

function absolutizeHtml(html) {
  // href/src attributes pointing to local GDS assets
  html = html.replace(/(href|src)="([^"]*)"/g, (match, attr, url) => {
    if (url.startsWith('http') || url.startsWith('//') || url.startsWith('data:') || url.startsWith('#')) return match;
    if (/^\/(fonts|images|site-images|css|js)\//.test(url)) return `${attr}="${BASE_GDS}${url}"`;
    return match;
  });
  // CSS url() — single quotes
  html = html.replace(/url\('(\/(?:fonts|images|site-images)\/[^']+)'\)/g, (_, p) => `url('${BASE_GDS}${p}')`);
  // CSS url() — double quotes
  html = html.replace(/url\("(\/(?:fonts|images|site-images)\/[^"]+)"\)/g, (_, p) => `url("${BASE_GDS}${p}")`);
  // CSS url() — no quotes
  html = html.replace(/url\((\/(?:fonts|images|site-images)\/[^)'"]+)\)/g, (_, p) => `url(${BASE_GDS}${p})`);
  // fetch('/api/...')
  html = html.replace(/fetch\('\/api\//g, `fetch('${BASE_GDS}/api/`);
  // Add loading="lazy" to all <img> except the first (LCP candidate)
  let _imgIdx = 0;
  html = html.replace(/<img(\s[^>]*)?\/?>/gi, (match, attrs) => {
    _imgIdx++;
    if (_imgIdx === 1) return match;
    if (/\bloading\s*=/i.test(attrs || '')) return match;
    return attrs ? `<img${attrs} loading="lazy">` : '<img loading="lazy">';
  });
  return html;
}

function httpsPost(url, postData) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify(postData);
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = { hostname: u.hostname, path: u.pathname + u.search, method: 'GET' };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function mWrite(url, filename, content) {
  return httpsPost(url, { action: 'write', file: filename, content });
}

async function mGet(url) {
  return httpsGet(url);
}

async function installMphp(destPath) {
  const helperName = 'helper_gds_deploy.php';
  const mphpCode = '<?php header("Content-Type:text/plain;charset=utf-8");$a=isset($_POST["action"])?$_POST["action"]:"";$dir=__DIR__."/";if($a==="write"&&isset($_POST["file"])&&isset($_POST["content"])){file_put_contents($dir.basename($_POST["file"]),$_POST["content"]);echo "OK:".strlen($_POST["content"]);}else{echo "ACTIVE";}';
  const helperPhp = `<?php\n$target = dirname(__DIR__) . '${destPath}';\nif (!is_dir($target)) mkdir($target, 0755, true);\n$mphp = '${mphpCode}';\nfile_put_contents($target . '/m.php', $mphp);\necho "OK";\n?>`;

  await mWrite(MANAGER_MPH, helperName, helperPhp);
  const result = await mGet(`https://shootnbox.fr/manager/${helperName}`);
  // Cleanup helper
  await mWrite(MANAGER_MPH, helperName, '<?php http_response_code(404); ?>');
  return result.includes('OK');
}

async function deployPageToShootnbox(slug) {
  const PORT = process.env.PORT || 3000;
  const LOCAL = `http://localhost:${PORT}`;

  // 1. Get page SEO + urlPath (read seo.json directly from filesystem)
  // home page lives in the root of previews/ (not in a subdirectory)
  const previewsDir = path.join(__dirname, '..', 'previews');
  const pageDir = slug === 'home' ? previewsDir : path.join(previewsDir, slug);
  if (!fs.existsSync(pageDir)) throw new Error(`Page not found: ${slug}`);
  let seo = {};
  // home page seo is stored as seo-home.json in previews root; others as seo.json in their subdir
  const seoPath = slug === 'home'
    ? path.join(previewsDir, 'seo-home.json')
    : path.join(pageDir, 'seo.json');
  if (fs.existsSync(seoPath)) {
    try { seo = JSON.parse(fs.readFileSync(seoPath, 'utf-8')); } catch {}
  }

  // Determine dest path: prefer canonical, fallback to urlPath or slug
  // home page always deploys to root (destPath = '')
  let destPath;
  if (seo.canonical) {
    try {
      const u = new URL(seo.canonical);
      destPath = u.pathname === '/' ? '' : (u.pathname.replace(/\/$/, '') || `/${slug}`);
    } catch { destPath = `/${slug}`; }
  } else if (seo.urlPath) {
    destPath = '/' + seo.urlPath.replace(/^\//, '').replace(/\/$/, '');
  } else if (slug === 'home') {
    destPath = '';
  } else {
    destPath = `/${slug}`;
  }

  // 2. Fetch preview HTML (from local server — optionalAuth, no token needed)
  const htmlResp = await fetch(`${LOCAL}/api/pages/${encodeURIComponent(slug)}/preview`);
  if (!htmlResp.ok) throw new Error(`Preview fetch failed: ${htmlResp.status}`);
  let html = await htmlResp.text();

  // 3. Absolutize assets
  html = absolutizeHtml(html);

  // 4. Install m.php + upload
  const ok = await installMphp(destPath);
  if (!ok) throw new Error('m.php install failed');

  const targetMph = `https://shootnbox.fr${destPath}/m.php`;
  const check = await mGet(targetMph);
  if (!check.includes('ACTIVE')) throw new Error(`m.php not active: ${check.substring(0, 50)}`);

  const uploadResult = await mWrite(targetMph, 'index.html', html);
  if (!uploadResult.includes('OK:')) throw new Error(`Upload failed: ${uploadResult}`);

  // Disable m.php
  await mWrite(targetMph, 'm.php', '<?php http_response_code(404); ?>');

  // Persist deployedAt in seo.json so getPageStatus() survives Docker rebuilds
  try {
    if (fs.existsSync(seoPath)) {
      seo.deployedAt = new Date().toISOString();
      fs.writeFileSync(seoPath, JSON.stringify(seo, null, 2), 'utf-8');
    }
  } catch {}

  return { destPath, bytes: html.length, uploadResult };
}

// ── POST /shootnbox/:slug — deploy a GDS page to shootnbox.fr ────────────────
router.post('/shootnbox/:slug', verifyToken, requireRole('admin'), async (req, res) => {
  const { slug } = req.params;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Slug invalide' });
  }

  try {
    const result = await deployPageToShootnbox(slug);

    await logAudit({
      userId: req.user.id,
      action: 'deploy_shootnbox',
      entityType: 'page',
      entityId: slug,
      details: { destPath: result.destPath, bytes: result.bytes },
      ip,
      userAgent
    });

    res.json({
      success: true,
      slug,
      destPath: result.destPath,
      url: `https://shootnbox.fr${result.destPath}/`,
      bytes: result.bytes
    });
  } catch (err) {
    console.error(`[Deploy Shootnbox] ${slug}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// POST / — trigger Coolify deploy
router.post('/', verifyToken, requireRole('admin'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const config = readConfig();
    const uuid = config.deploy && config.deploy.coolifyUuid;
    const token = config.deploy && config.deploy.coolifyToken;

    if (!uuid || !token) {
      return res.status(400).json({ error: 'Configuration Coolify manquante (coolifyUuid ou coolifyToken)' });
    }

    // Trigger deploy via Coolify API
    const deployUrl = `${COOLIFY_HOST}/api/v1/deploy?uuid=${encodeURIComponent(uuid)}&force=true`;
    const response = await fetch(deployUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    const result = await response.json().catch(() => ({ status: response.status }));

    await logAudit({
      userId: req.user.id,
      action: 'deploy',
      entityType: 'application',
      entityId: uuid,
      details: { status: response.status, result },
      ip,
      userAgent
    });

    if (!response.ok) {
      return res.status(502).json({
        error: 'Erreur lors du deploiement Coolify',
        status: response.status,
        details: result
      });
    }

    res.json({ message: 'Deploiement declenche avec succes', result });
  } catch (err) {
    console.error('[Deploy] Error:', err.message);
    res.status(500).json({ error: 'Erreur lors du deploiement' });
  }
});

// GET /status — check app status via Coolify API
router.get('/status', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const config = readConfig();
    const uuid = config.deploy && config.deploy.coolifyUuid;
    const token = config.deploy && config.deploy.coolifyToken;

    if (!uuid || !token) {
      return res.status(400).json({ error: 'Configuration Coolify manquante' });
    }

    const statusUrl = `${COOLIFY_HOST}/api/v1/applications/${encodeURIComponent(uuid)}`;
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Erreur lors de la verification du statut', status: response.status });
    }

    const data = await response.json();
    res.json({
      uuid: data.uuid || uuid,
      name: data.name || null,
      fqdn: data.fqdn || null,
      status: data.status || 'unknown',
      last_deployment: data.last_deployment_at || null,
      repository: data.git_repository || null
    });
  } catch (err) {
    console.error('[Deploy] Status error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /history — recent deploy entries from audit log
router.get('/history', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const { data: entries, error, count } = await supabase
      .from('site_manager_audit_log')
      .select('*', { count: 'exact' })
      .eq('action', 'deploy')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation de l\'historique' });
    }

    res.json({ entries, total: count, page, limit });
  } catch (err) {
    console.error('[Deploy] History error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
