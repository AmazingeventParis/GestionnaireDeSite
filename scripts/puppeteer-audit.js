'use strict';

/**
 * puppeteer-audit.js — Audit SEO/technique exhaustif de shootnbox.fr
 * Usage: node scripts/puppeteer-audit.js
 */

const puppeteer = require('puppeteer');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────
const API_BASE = 'https://sites.swipego.app';
const SITE_BASE = 'https://shootnbox.fr';
const AUTH_EMAIL = 'admin@shootnbox.fr';
const AUTH_PASSWORD = 'Laurytal2';
const CONCURRENCY = 4;
const PAGE_TIMEOUT = 30000;
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'puppeteer-audit.json');

// ─── Poids pour le score ─────────────────────────────────────────────────────
const WEIGHTS = {
  http:          12,
  noindex:       12,
  softFake:       8,
  title:          7,
  description:    7,
  h1:             7,
  canonical:      6,
  jsonLd:         5,
  ogTags:         4,
  lang:           4,
  headings:       4,
  images:         4,
  serverRender:   4,
  security:       4,
  lcp:            3,
  cls:            3,
  main:           3,
  breadcrumbs:    3,
  internalLinks:  2,
  lazyLoad:       2,
  charset:        1,
  viewport:       1,
  favicon:        1,
  twitterCard:    1,
  metaKeywords:   1,
  author:         1,
};
const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

// ─── Helpers HTTP ─────────────────────────────────────────────────────────────
function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GDS-Audit/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 15000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function postJson(url, data, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      timeout: 30000,
    };
    const mod = urlObj.protocol === 'https:' ? https : http;
    const req = mod.request(options, (res) => {
      let respBody = '';
      res.on('data', (chunk) => { respBody += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(respBody) }); }
        catch (e) { resolve({ status: res.statusCode, body: respBody }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

function getJson(url, token) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      timeout: 15000,
    };
    const mod = urlObj.protocol === 'https:' ? https : http;
    const req = mod.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// ─── Auth ────────────────────────────────────────────────────────────────────
async function getToken() {
  const res = await postJson(`${API_BASE}/api/auth/login`, {
    email: AUTH_EMAIL,
    password: AUTH_PASSWORD,
  });
  if (!res.body.accessToken) throw new Error('Auth failed: ' + JSON.stringify(res.body));
  return res.body.accessToken;
}

// ─── URL mapping ─────────────────────────────────────────────────────────────
function pageUrl(page) {
  if (page.slug === 'home') return `${SITE_BASE}/`;
  if (page.seo && page.seo.urlPath) {
    const p = page.seo.urlPath.endsWith('/') ? page.seo.urlPath : page.seo.urlPath + '/';
    return `${SITE_BASE}${p}`;
  }
  return `${SITE_BASE}/${page.slug}/`;
}

// ─── Score calculator ─────────────────────────────────────────────────────────
function calcScore(checks) {
  let earned = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const check = checks[key];
    if (check && check.ok === true) {
      earned += weight;
    }
  }
  return Math.round((earned / TOTAL_WEIGHT) * 100);
}

// ─── Issues builder ──────────────────────────────────────────────────────────
function buildIssues(checks) {
  const issues = [];
  const add = (msg, sev) => issues.push({ msg, sev });

  if (checks.http && !checks.http.ok) add(`HTTP ${checks.http.status || 'error'}`, 'crit');
  if (checks.noindex && !checks.noindex.ok) add('Page noindex (accidentel ?)', 'crit');
  if (checks.softFake && !checks.softFake.ok) add('Soft 404 détecté', 'crit');
  if (checks.title && !checks.title.ok) {
    if (!checks.title.value) add('Title manquant', 'crit');
    else add(`Title hors longueur (${checks.title.length} chars)`, 'warn');
  }
  if (checks.description && !checks.description.ok) {
    if (!checks.description.value) add('Description manquante', 'crit');
    else add(`Description hors longueur (${checks.description.length} chars)`, 'warn');
  }
  if (checks.h1 && !checks.h1.ok) {
    if (checks.h1.count === 0) add('H1 manquant', 'crit');
    else add(`${checks.h1.count} H1 trouvés (doit être exactement 1)`, 'warn');
  }
  if (checks.canonical && !checks.canonical.ok) add('Canonical manquant ou relatif', 'warn');
  if (checks.jsonLd && !checks.jsonLd.ok) add('Aucun JSON-LD structuré', 'warn');
  if (checks.ogTags && !checks.ogTags.ok) add('Balises Open Graph incomplètes', 'warn');
  if (checks.lang && !checks.lang.ok) add('Attribut lang manquant ou non fr', 'warn');
  if (checks.headings && !checks.headings.ok) add('Saut dans la hiérarchie des titres', 'warn');
  if (checks.images && !checks.images.ok) {
    if (checks.images.missingAlt > 0) add(`${checks.images.missingAlt} image(s) sans alt`, 'warn');
  }
  if (checks.serverRender && !checks.serverRender.ok) add('Contenu non rendu côté serveur', 'crit');
  if (checks.security && !checks.security.ok) add('Headers de sécurité manquants', 'warn');
  if (checks.lcp && !checks.lcp.ok) add(`LCP lent (${checks.lcp.value}ms)`, 'warn');
  if (checks.cls && !checks.cls.ok) add(`CLS élevé (${checks.cls.value})`, 'warn');
  if (checks.main && !checks.main.ok) add('Balise <main> manquante', 'warn');
  if (checks.breadcrumbs && !checks.breadcrumbs.ok) add('Pas de fil d\'Ariane', 'info');
  if (checks.internalLinks && !checks.internalLinks.ok) add(`${checks.internalLinks.noHref} lien(s) sans href`, 'warn');
  if (checks.lazyLoad && !checks.lazyLoad.ok) add('Images sans loading=lazy', 'warn');
  if (checks.charset && !checks.charset.ok) add('Charset manquant', 'warn');
  if (checks.viewport && !checks.viewport.ok) add('Viewport manquant', 'warn');
  if (checks.favicon && !checks.favicon.ok) add('Favicon manquant', 'info');
  if (checks.twitterCard && !checks.twitterCard.ok) add('Twitter Card manquante', 'info');
  if (checks.metaKeywords && !checks.metaKeywords.ok) add('Meta keywords présent (obsolète)', 'info');
  if (checks.author && !checks.author.ok) add('Meta author manquant', 'info');

  return issues;
}

// ─── Audit d'une page ────────────────────────────────────────────────────────
async function auditPage(browser, pageObj, token) {
  const url = pageUrl(pageObj);
  const slug = pageObj.slug;
  const startTime = Date.now();

  const checks = {};

  // Valeurs interceptées pendant la navigation
  let httpStatus = null;
  let responseHeaders = {};

  let browserPage = null;
  try {
    browserPage = await browser.newPage();
    await browserPage.setDefaultNavigationTimeout(PAGE_TIMEOUT);
    await browserPage.setDefaultTimeout(PAGE_TIMEOUT);

    // Intercepter la première réponse principale
    browserPage.on('response', (response) => {
      if (response.url() === url || response.url() === url.replace(/\/$/, '')) {
        if (httpStatus === null) {
          httpStatus = response.status();
          try { responseHeaders = response.headers(); } catch (e) {}
        }
      }
    });

    // Naviguer vers la page
    try {
      await browserPage.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT });
    } catch (navErr) {
      // On continue même si timeout partiel
      if (httpStatus === null) httpStatus = 0;
    }

    if (httpStatus === null) httpStatus = 0;

    // ── check: http ──
    checks.http = { ok: httpStatus === 200, status: httpStatus };

    // ── check: security ──
    try {
      const isHttps = url.startsWith('https');
      const hsts = !!responseHeaders['strict-transport-security'];
      const xframe = !!responseHeaders['x-frame-options'];
      const xcto = !!responseHeaders['x-content-type-options'];
      checks.security = {
        ok: isHttps && (hsts || xframe || xcto),
        https: isHttps,
        hsts,
        xframe,
        xcto,
      };
    } catch (e) {
      checks.security = { ok: null };
    }

    // ── check: noindex (meta + header) ──
    try {
      const robotsMeta = await browserPage.evaluate(() => {
        const el = document.querySelector('meta[name="robots"]');
        return el ? el.getAttribute('content') || '' : '';
      });
      const robotsHeader = responseHeaders['x-robots-tag'] || '';
      const hasNoindex = /noindex/i.test(robotsMeta) || /noindex/i.test(robotsHeader);
      checks.noindex = { ok: !hasNoindex, hasNoindex };
      checks.robots = { ok: !hasNoindex, content: robotsMeta || robotsHeader || '' };
    } catch (e) {
      checks.noindex = { ok: null };
      checks.robots = { ok: null };
    }

    // ── check: charset ──
    try {
      const hasCharset = await browserPage.evaluate(() => {
        return !!document.querySelector('meta[charset]') ||
               !!document.querySelector('meta[http-equiv="Content-Type"]');
      });
      checks.charset = { ok: hasCharset };
    } catch (e) {
      checks.charset = { ok: null };
    }

    // ── check: viewport ──
    try {
      const hasViewport = await browserPage.evaluate(() => {
        return !!document.querySelector('meta[name="viewport"]');
      });
      checks.viewport = { ok: hasViewport };
    } catch (e) {
      checks.viewport = { ok: null };
    }

    // ── check: lang ──
    try {
      const langValue = await browserPage.evaluate(() => {
        return document.documentElement.getAttribute('lang') || '';
      });
      checks.lang = { ok: langValue.toLowerCase().startsWith('fr'), value: langValue };
    } catch (e) {
      checks.lang = { ok: null };
    }

    // ── check: title ──
    try {
      const titleValue = await browserPage.evaluate(() => {
        const el = document.querySelector('title');
        return el ? el.textContent.trim() : '';
      });
      const tlen = titleValue.length;
      checks.title = {
        ok: tlen >= 10 && tlen <= 70,
        value: titleValue,
        length: tlen,
      };
    } catch (e) {
      checks.title = { ok: null };
    }

    // ── check: description ──
    try {
      const descValue = await browserPage.evaluate(() => {
        const el = document.querySelector('meta[name="description"]');
        return el ? (el.getAttribute('content') || '').trim() : '';
      });
      const dlen = descValue.length;
      checks.description = {
        ok: dlen >= 50 && dlen <= 160,
        value: descValue,
        length: dlen,
      };
    } catch (e) {
      checks.description = { ok: null };
    }

    // ── check: canonical ──
    try {
      const canonValue = await browserPage.evaluate(() => {
        const el = document.querySelector('link[rel="canonical"]');
        return el ? (el.getAttribute('href') || '') : '';
      });
      checks.canonical = {
        ok: !!canonValue && canonValue.startsWith('https://'),
        value: canonValue,
      };
    } catch (e) {
      checks.canonical = { ok: null };
    }

    // ── check: h1 ──
    try {
      const h1Data = await browserPage.evaluate(() => {
        const els = document.querySelectorAll('h1');
        return {
          count: els.length,
          value: els.length > 0 ? els[0].textContent.trim() : '',
        };
      });
      checks.h1 = {
        ok: h1Data.count === 1,
        count: h1Data.count,
        value: h1Data.value,
      };
    } catch (e) {
      checks.h1 = { ok: null };
    }

    // ── check: headings (hiérarchie sans saut) ──
    try {
      const headingLevels = await browserPage.evaluate(() => {
        const els = document.querySelectorAll('h1,h2,h3,h4,h5,h6');
        return Array.from(els).map(el => parseInt(el.tagName.substring(1)));
      });
      let hasJump = false;
      for (let i = 1; i < headingLevels.length; i++) {
        if (headingLevels[i] - headingLevels[i - 1] > 1) {
          hasJump = true;
          break;
        }
      }
      checks.headings = { ok: !hasJump };
    } catch (e) {
      checks.headings = { ok: null };
    }

    // ── check: jsonLd ──
    try {
      const jsonLdTypes = await browserPage.evaluate(() => {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        const types = [];
        scripts.forEach(s => {
          try {
            const data = JSON.parse(s.textContent);
            if (data['@type']) types.push(data['@type']);
            if (data['@graph']) {
              data['@graph'].forEach(item => {
                if (item['@type']) types.push(item['@type']);
              });
            }
          } catch (e) {}
        });
        return types;
      });
      checks.jsonLd = {
        ok: jsonLdTypes.length > 0,
        types: jsonLdTypes,
      };
    } catch (e) {
      checks.jsonLd = { ok: null };
    }

    // ── check: ogTags ──
    try {
      const ogData = await browserPage.evaluate(() => {
        const get = (prop) => {
          const el = document.querySelector(`meta[property="${prop}"]`);
          return el ? (el.getAttribute('content') || '') : '';
        };
        return {
          title: get('og:title'),
          description: get('og:description'),
          image: get('og:image'),
          url: get('og:url'),
        };
      });
      checks.ogTags = {
        ok: !!(ogData.title && ogData.description && ogData.image && ogData.url),
        ...ogData,
      };
    } catch (e) {
      checks.ogTags = { ok: null };
    }

    // ── check: twitterCard ──
    try {
      const tcValue = await browserPage.evaluate(() => {
        const el = document.querySelector('meta[name="twitter:card"]');
        return el ? (el.getAttribute('content') || '') : '';
      });
      checks.twitterCard = { ok: !!tcValue, value: tcValue };
    } catch (e) {
      checks.twitterCard = { ok: null };
    }

    // ── check: images ──
    try {
      const imgData = await browserPage.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        let missingAlt = 0;
        let missingDimensions = 0;
        imgs.forEach(img => {
          const alt = img.getAttribute('alt');
          if (alt === null || alt === '') missingAlt++;
          if (!img.getAttribute('width') && !img.getAttribute('height')) missingDimensions++;
        });
        return { total: imgs.length, missingAlt, missingDimensions };
      });
      checks.images = {
        ok: imgData.missingAlt === 0,
        missingAlt: imgData.missingAlt,
        missingDimensions: imgData.missingDimensions,
        total: imgData.total,
      };
    } catch (e) {
      checks.images = { ok: null };
    }

    // ── check: lazyLoad ──
    try {
      const lazyData = await browserPage.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        // La première image (LCP potentiel) est exclue
        const nonFirstImgs = imgs.slice(1);
        const withoutLazy = nonFirstImgs.filter(img => img.getAttribute('loading') !== 'lazy');
        return { total: nonFirstImgs.length, withoutLazy: withoutLazy.length };
      });
      checks.lazyLoad = {
        ok: lazyData.withoutLazy === 0,
        total: lazyData.total,
        withoutLazy: lazyData.withoutLazy,
      };
    } catch (e) {
      checks.lazyLoad = { ok: null };
    }

    // ── check: internalLinks ──
    try {
      const linkData = await browserPage.evaluate((siteBase) => {
        const links = Array.from(document.querySelectorAll('a'));
        let noHref = 0;
        let noOpener = 0;
        links.forEach(a => {
          const href = a.getAttribute('href') || '';
          if (!href || href === '#' || href.startsWith('javascript:')) {
            noHref++;
          }
          if (a.getAttribute('target') === '_blank') {
            const rel = a.getAttribute('rel') || '';
            if (!rel.includes('noopener')) noOpener++;
          }
        });
        return { total: links.length, noHref, noOpener };
      }, SITE_BASE);
      checks.internalLinks = {
        ok: linkData.noHref === 0,
        noHref: linkData.noHref,
        noOpener: linkData.noOpener,
        total: linkData.total,
      };
    } catch (e) {
      checks.internalLinks = { ok: null };
    }

    // ── check: breadcrumbs ──
    try {
      const hasBreadcrumb = await browserPage.evaluate(() => {
        // Check HTML breadcrumb
        const htmlBreadcrumb = document.querySelector(
          '[aria-label*="breadcrumb" i], [aria-label*="fil" i], [class*="breadcrumb"], nav[class*="bread"]'
        );
        if (htmlBreadcrumb) return true;
        // Check JSON-LD BreadcrumbList
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const s of scripts) {
          try {
            const data = JSON.parse(s.textContent);
            if (data['@type'] === 'BreadcrumbList') return true;
            if (data['@graph'] && data['@graph'].some(item => item['@type'] === 'BreadcrumbList')) return true;
          } catch (e) {}
        }
        return false;
      });
      checks.breadcrumbs = { ok: hasBreadcrumb };
    } catch (e) {
      checks.breadcrumbs = { ok: null };
    }

    // ── check: main ──
    try {
      const hasMain = await browserPage.evaluate(() => !!document.querySelector('main'));
      checks.main = { ok: hasMain };
    } catch (e) {
      checks.main = { ok: null };
    }

    // ── check: favicon ──
    try {
      const hasFavicon = await browserPage.evaluate(() => {
        return !!(
          document.querySelector('link[rel="icon"]') ||
          document.querySelector('link[rel="shortcut icon"]') ||
          document.querySelector('link[rel="apple-touch-icon"]')
        );
      });
      checks.favicon = { ok: hasFavicon };
    } catch (e) {
      checks.favicon = { ok: null };
    }

    // ── check: semantics ──
    try {
      const semData = await browserPage.evaluate(() => {
        const issues = [];
        if (!document.querySelector('header')) issues.push('Pas de <header>');
        if (!document.querySelector('footer')) issues.push('Pas de <footer>');
        if (!document.querySelector('nav')) issues.push('Pas de <nav>');
        const bTags = document.querySelectorAll('b');
        if (bTags.length > 5) issues.push(`${bTags.length} balises <b> (utiliser <strong>)`);
        const iTags = document.querySelectorAll('i:not([class])');
        if (iTags.length > 3) issues.push(`${iTags.length} balises <i> sans classe (utiliser <em>)`);
        return issues;
      });
      checks.semantics = { ok: semData.length === 0, issues: semData };
    } catch (e) {
      checks.semantics = { ok: null };
    }

    // ── check: metaKeywords ──
    try {
      const hasKeywords = await browserPage.evaluate(() => {
        return !!document.querySelector('meta[name="keywords"]');
      });
      checks.metaKeywords = { ok: !hasKeywords }; // ok = pas de meta keywords
    } catch (e) {
      checks.metaKeywords = { ok: null };
    }

    // ── check: author ──
    try {
      const authorValue = await browserPage.evaluate(() => {
        const el = document.querySelector('meta[name="author"]');
        return el ? (el.getAttribute('content') || '') : '';
      });
      checks.author = { ok: !!authorValue, value: authorValue };
    } catch (e) {
      checks.author = { ok: null };
    }

    // ── check: softFake ──
    try {
      const softData = await browserPage.evaluate(() => {
        const wordCount = document.body.innerText.split(/\s+/).filter(w => w.length > 0).length;
        const h1Count = document.querySelectorAll('h1').length;
        const titleText = document.querySelector('title')?.textContent?.trim() || '';
        const genericTitles = ['page not found', '404', 'error', 'not found', 'erreur'];
        const isGeneric = genericTitles.some(g => titleText.toLowerCase().includes(g));
        return { wordCount, h1Count, isGeneric };
      });
      const isSoft404 = (
        httpStatus === 200 &&
        (softData.h1Count === 0 || softData.wordCount < 100 || softData.isGeneric)
      );
      checks.softFake = { ok: !isSoft404, wordCount: softData.wordCount };
    } catch (e) {
      checks.softFake = { ok: null };
    }

    // ── check: LCP (PerformanceObserver) ──
    try {
      const lcpValue = await browserPage.evaluate(() => {
        return new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(null), 8000);
          try {
            let lcpTime = null;
            const observer = new PerformanceObserver((list) => {
              const entries = list.getEntries();
              if (entries.length > 0) {
                lcpTime = entries[entries.length - 1].startTime;
              }
            });
            observer.observe({ type: 'largest-contentful-paint', buffered: true });
            setTimeout(() => {
              observer.disconnect();
              clearTimeout(timeout);
              resolve(lcpTime);
            }, 6000);
          } catch (e) {
            clearTimeout(timeout);
            resolve(null);
          }
        });
      });
      checks.lcp = {
        ok: lcpValue !== null ? lcpValue < 2500 : null,
        value: lcpValue !== null ? Math.round(lcpValue) : null,
      };
    } catch (e) {
      checks.lcp = { ok: null, value: null };
    }

    // ── check: CLS (PerformanceObserver) ──
    try {
      const clsValue = await browserPage.evaluate(() => {
        return new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(null), 6000);
          try {
            let clsScore = 0;
            const observer = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput) {
                  clsScore += entry.value;
                }
              }
            });
            observer.observe({ type: 'layout-shift', buffered: true });
            setTimeout(() => {
              observer.disconnect();
              clearTimeout(timeout);
              resolve(clsScore);
            }, 4000);
          } catch (e) {
            clearTimeout(timeout);
            resolve(null);
          }
        });
      });
      checks.cls = {
        ok: clsValue !== null ? clsValue < 0.1 : null,
        value: clsValue !== null ? Math.round(clsValue * 1000) / 1000 : null,
      };
    } catch (e) {
      checks.cls = { ok: null, value: null };
    }

    // ── check: serverRender (fetch HTML brut sans JS) ──
    try {
      const raw = await fetchRaw(url);
      const rawBody = raw.body || '';
      const hasH1 = /<h1[\s>]/i.test(rawBody);
      const titleMatch = rawBody.match(/<title[^>]*>([^<]+)<\/title>/i);
      const hasTitle = titleMatch && titleMatch[1].trim().length > 0;
      // Calculer longueur texte approximative (strip HTML)
      const textLen = rawBody.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length;
      checks.serverRender = {
        ok: hasH1 && hasTitle && textLen >= 200,
        hasH1,
        hasTitle,
        textLen,
      };
    } catch (e) {
      checks.serverRender = { ok: null };
    }

    await browserPage.close();
    browserPage = null;

  } catch (err) {
    if (browserPage) {
      try { await browserPage.close(); } catch (e) {}
    }
    // Erreur de crawl — retourner score 0
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return {
      slug,
      url,
      score: 0,
      checks: {},
      issues: [{ msg: `Erreur de crawl: ${err.message}`, sev: 'crit' }],
      elapsed: parseFloat(elapsed),
    };
  }

  const score = calcScore(checks);
  const issues = buildIssues(checks);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  return {
    slug,
    url,
    score,
    checks,
    issues,
    elapsed: parseFloat(elapsed),
  };
}

// ─── Checks globaux ──────────────────────────────────────────────────────────
async function auditGlobal() {
  const global = {};

  // robots.txt
  try {
    const res = await fetchRaw(`${SITE_BASE}/robots.txt`);
    const body = res.body || '';
    const accessible = res.status === 200;
    const hasSitemap = /sitemap/i.test(body);
    const bots = {
      OAISearchBot: !/Disallow.*OAISearchBot/i.test(body) && !/User-agent:\s*OAISearchBot[\s\S]*?Disallow:\s*\//m.test(body),
      GPTBot: !/User-agent:\s*GPTBot[\s\S]*?Disallow:\s*\//m.test(body),
      ClaudeBot: !/User-agent:\s*ClaudeBot[\s\S]*?Disallow:\s*\//m.test(body),
      PerplexityBot: !/User-agent:\s*PerplexityBot[\s\S]*?Disallow:\s*\//m.test(body),
      GoogleExtended: !/User-agent:\s*Google-Extended[\s\S]*?Disallow:\s*\//m.test(body),
    };
    global.robotsTxt = { accessible, hasSitemap, bots, rawLength: body.length };
  } catch (e) {
    global.robotsTxt = { accessible: false, hasSitemap: false, bots: {}, error: e.message };
  }

  // sitemap.xml
  try {
    const res = await fetchRaw(`${SITE_BASE}/sitemap.xml`);
    const body = res.body || '';
    const accessible = res.status === 200;
    const urlMatches = body.match(/<url>/g);
    const urlCount = urlMatches ? urlMatches.length : 0;
    // Détecter URLs invalides (vérification basique)
    const hasInvalidUrls = /noindex/i.test(body);
    global.sitemapXml = { accessible, urlCount, hasInvalidUrls };
  } catch (e) {
    global.sitemapXml = { accessible: false, urlCount: 0, hasInvalidUrls: false, error: e.message };
  }

  return global;
}

// ─── Concurrence pool ────────────────────────────────────────────────────────
async function runPool(tasks, concurrency, runner) {
  const results = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await runner(tasks[i], i);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// ─── Terminal output helpers ─────────────────────────────────────────────────
function padEnd(str, len) {
  const s = String(str);
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}
function padStart(str, len) {
  const s = String(str);
  return s.length >= len ? s : ' '.repeat(len - s.length) + s;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  // Créer le dossier data/ si nécessaire
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  console.log('Authentification sur sites.swipego.app...');
  let token;
  try {
    token = await getToken();
    console.log('Token obtenu ✓');
  } catch (e) {
    console.error('Erreur auth:', e.message);
    process.exit(1);
  }

  // Récupérer la liste des pages
  console.log('Récupération de la liste des pages...');
  let pages;
  try {
    const res = await getJson(`${API_BASE}/api/pages`, token);
    // L'API retourne { pages: [...] } ou directement [...]
    if (Array.isArray(res.body)) {
      pages = res.body;
    } else if (res.body && typeof res.body === 'object') {
      const arr = Object.values(res.body).find(v => Array.isArray(v));
      if (!arr) throw new Error('Impossible de trouver le tableau de pages dans: ' + JSON.stringify(res.body).substring(0, 100));
      pages = arr;
    } else {
      throw new Error('Réponse inattendue: ' + JSON.stringify(res.body).substring(0, 100));
    }
    console.log(`${pages.length} pages trouvées ✓\n`);
  } catch (e) {
    console.error('Erreur récupération pages:', e.message);
    process.exit(1);
  }

  // Checks globaux (robots.txt, sitemap.xml)
  console.log('Vérification robots.txt et sitemap.xml...');
  const globalChecks = await auditGlobal();
  console.log(`  robots.txt: ${globalChecks.robotsTxt.accessible ? '✓' : '✗'} | sitemap.xml: ${globalChecks.sitemapXml.accessible ? '✓' : '✗'} (${globalChecks.sitemapXml.urlCount} URLs)\n`);

  // Lancer Puppeteer
  console.log('Lancement de Puppeteer...');
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
    ],
  });
  console.log('Puppeteer prêt ✓\n');

  const totalPages = pages.length;
  const auditStartTime = Date.now();
  let completed = 0;

  // Audit de toutes les pages en parallèle (pool de CONCURRENCY onglets)
  const results = await runPool(pages, CONCURRENCY, async (pageObj, taskIdx) => {
    const result = await auditPage(browser, pageObj, token);

    completed++;
    const idx = completed;
    const prefix = `[${padStart(idx, 3)}/${totalPages}]`;
    const statusIcon = result.score >= 80 ? '✓' : result.score >= 50 ? '⚠' : '✗';
    const slugPadded = padEnd(result.slug, 35);
    const scoreStr = `score: ${padStart(result.score, 3)}`;
    const timeStr = `(${result.elapsed}s)`;

    // Résumé des problèmes critiques
    const critIssues = result.issues.filter(i => i.sev === 'crit').map(i => i.msg);
    const issueStr = critIssues.length > 0 ? `  ⚠ ${critIssues.slice(0, 3).join(', ')}` : '';

    console.log(`${prefix} ${statusIcon} ${slugPadded} ${scoreStr}  ${timeStr}${issueStr}`);

    return result;
  });

  await browser.close();

  const totalTime = Date.now() - auditStartTime;
  const totalSec = Math.floor(totalTime / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  // Statistiques finales
  const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  const okPages = results.filter(r => r.score >= 80).length;
  const warnPages = results.filter(r => r.score >= 50 && r.score < 80).length;
  const critPages = results.filter(r => r.score < 50).length;

  // Top problèmes (par fréquence d'échec)
  const problemCounts = {};
  for (const r of results) {
    for (const issue of r.issues) {
      const key = issue.msg;
      problemCounts[key] = (problemCounts[key] || 0) + 1;
    }
  }
  const topProblems = Object.entries(problemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([msg, count]) => `${msg} (${count})`);

  console.log('\n' + '═'.repeat(60));
  console.log(`AUDIT TERMINÉ — ${totalPages} pages en ${timeStr}`);
  console.log(`Score moyen: ${avgScore}/100`);
  console.log(`✓ OK (≥80): ${okPages} pages`);
  console.log(`⚠ Warning (50-79): ${warnPages} pages`);
  console.log(`✗ Critique (<50): ${critPages} pages`);
  if (topProblems.length > 0) {
    console.log(`Top problèmes: ${topProblems.join(', ')}`);
  }
  console.log('═'.repeat(60));

  // Construire l'objet final
  const auditData = {
    createdAt: new Date().toISOString(),
    duration: totalTime,
    pageCount: totalPages,
    avgScore,
    stats: { ok: okPages, warn: warnPages, crit: critPages },
    global: globalChecks,
    pages: results,
  };

  // Sauvegarder en local
  try {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(auditData, null, 2), 'utf-8');
    console.log(`\nRésultats sauvegardés dans ${OUTPUT_FILE} ✓`);
  } catch (e) {
    console.error('Erreur sauvegarde locale:', e.message);
  }

  // Upload vers l'API
  console.log('Upload des résultats sur sites.swipego.app...');
  try {
    const uploadRes = await postJson(
      `${API_BASE}/api/puppeteer-audit`,
      auditData,
      token
    );
    if (uploadRes.status >= 200 && uploadRes.status < 300) {
      console.log('Résultats uploadés sur sites.swipego.app ✓');
    } else {
      console.warn(`Upload échoué (HTTP ${uploadRes.status}): ${JSON.stringify(uploadRes.body).substring(0, 200)}`);
      console.log('Les résultats sont disponibles dans data/puppeteer-audit.json');
    }
  } catch (e) {
    console.error('Erreur upload API:', e.message);
    console.log('Les résultats sont disponibles dans data/puppeteer-audit.json');
  }
}

main().catch((err) => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
