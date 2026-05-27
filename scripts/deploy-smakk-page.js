#!/usr/bin/env node
/**
 * scripts/deploy-smakk-page.js
 *
 * Deploy a Smakk GDS page to production (smakk.fr/<slug>/index.html).
 * Fetches the GDS preview, absolutizes asset URLs, then POSTs to the secure
 * writer helper on smakk.fr/manager/gds_writer.php which writes the file and
 * pings IndexNow (Bing/Yandex/Seznam) to trigger re-indexation.
 *
 * Usage: node scripts/deploy-smakk-page.js <slug> [<slug2> ...]
 * Example: node scripts/deploy-smakk-page.js mariage anniversaire
 */
const https = require('https');
const querystring = require('querystring');

const BASE_GDS = 'https://sites.swipego.app';
const SITE_ID = 'cb56296b-27d3-463c-a38f-76c764911746';
const WRITER_URL = 'https://smakk.fr/manager/gds_writer.php';
const DEPLOY_SECRET = process.env.SMAKK_DEPLOY_SECRET || 'n5U_VpdCv0scnXaXOwdmUkVh482lWZXA';

const slugs = process.argv.slice(2);
if (slugs.length === 0) {
  console.error('Usage: node scripts/deploy-smakk-page.js <slug> [<slug2> ...]');
  process.exit(1);
}

function absolutizeHtml(html) {
  html = html.replace(/(href|src)="([^"]*)"/g, (m, a, u) => {
    if (u.startsWith('http') || u.startsWith('//') || u.startsWith('data:') || u.startsWith('#')) return m;
    if (/^\/(fonts|images|site-images|css|js)\//.test(u)) return `${a}="${BASE_GDS}${u}"`;
    return m;
  });
  html = html.replace(/srcset="([^"]+)"/g, (m, v) => {
    const parts = v.split(',').map(p => {
      const t = p.trim(); if (!t) return p;
      const sp = t.indexOf(' '); const u = sp === -1 ? t : t.slice(0, sp); const d = sp === -1 ? '' : t.slice(sp);
      if (u.startsWith('http') || u.startsWith('//') || u.startsWith('data:')) return t;
      if (/^\/(fonts|images|site-images|css|js)\//.test(u)) return BASE_GDS + u + d;
      return t;
    });
    return `srcset="${parts.join(', ')}"`;
  });
  html = html.replace(/url\('(\/(?:fonts|images|site-images)\/[^']+)'\)/g, (_, p) => `url('${BASE_GDS}${p}')`);
  html = html.replace(/url\("(\/(?:fonts|images|site-images)\/[^"]+)"\)/g, (_, p) => `url("${BASE_GDS}${p}")`);
  html = html.replace(/url\((\/(?:fonts|images|site-images)\/[^)'"]+)\)/g, (_, p) => `url(${BASE_GDS}${p})`);
  html = html.replace(/fetch\('\/api\//g, `fetch('${BASE_GDS}/api/`);
  return html;
}

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search, headers }, res => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function post(url, formData) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify(formData);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

(async () => {
  for (const slug of slugs) {
    process.stdout.write(`[${slug}] fetching preview… `);
    const prev = await get(`${BASE_GDS}/api/pages/${slug}/preview`, {
      'X-Site-Id': SITE_ID, 'Accept': 'text/html', 'User-Agent': 'gds-deploy'
    });
    if (prev.status !== 200) { console.log('HTTP ' + prev.status + ' — skip'); continue; }
    let html = absolutizeHtml(prev.body);
    const rel = (html.match(/src="\/site-images\//g) || []).length;
    if (rel > 0) { console.log('FAIL relative imgs:' + rel); continue; }
    if (!html.includes('<title>')) { console.log('FAIL no title'); continue; }
    if (/shootnbox/i.test(html)) { console.log('FAIL shootnbox leak'); continue; }
    process.stdout.write(`${html.length}B → push… `);
    const res = await post(WRITER_URL, { secret: DEPLOY_SECRET, slug, ct: html });
    console.log(res.body);
  }
  console.log('DONE');
})();
