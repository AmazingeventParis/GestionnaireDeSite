const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const PREVIEWS_DIR = path.join(__dirname, '..', 'previews');

/**
 * Extract text content from HTML (strip tags)
 */
function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#\d+;/gi, ' ')
    .replace(/&\w+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Count words in text
 */
function countWords(text) {
  if (!text) return 0;
  return text.split(/\s+/).filter(function(w) { return w.length > 0; }).length;
}

/**
 * Extract first H1 from HTML
 */
function extractH1(html) {
  var match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) return null;
  return stripHtml(match[1]).trim() || null;
}

/**
 * Extract internal links (href="/...") from HTML
 */
function extractInternalLinks(html) {
  var links = [];
  var regex = /href=["']\/([\w\-\/]*?)["']/g;
  var match;
  while ((match = regex.exec(html)) !== null) {
    var link = match[1].replace(/\/+$/, '').replace(/^\/+/, '');
    if (link) {
      links.push(link);
    }
  }
  return links;
}

/**
 * Read and concatenate all HTML section files in a page directory
 */
function readPageHtml(pageDir) {
  var combined = '';
  try {
    var files = fs.readdirSync(pageDir).filter(function(f) {
      return f.endsWith('.html') && !f.startsWith('_') && !f.startsWith('.');
    }).sort(function(a, b) {
      var numA = parseInt(a, 10) || 0;
      var numB = parseInt(b, 10) || 0;
      return numA - numB;
    });
    for (var i = 0; i < files.length; i++) {
      combined += fs.readFileSync(path.join(pageDir, files[i]), 'utf-8') + '\n';
    }
  } catch (e) {
    // ignore read errors
  }
  return combined;
}

/**
 * GET /global — Full site SEO audit
 */
router.get('/global', verifyToken, requireRole('admin'), function(req, res) {
  try {
    // 1. Scan all page directories
    var entries = fs.readdirSync(PREVIEWS_DIR, { withFileTypes: true });
    var pageDirs = entries.filter(function(e) {
      return e.isDirectory() && e.name !== '_shared' && !e.name.startsWith('_');
    });

    var pages = [];

    for (var i = 0; i < pageDirs.length; i++) {
      var slug = pageDirs[i].name;
      var pageDir = path.join(PREVIEWS_DIR, slug);
      var seoPath = path.join(pageDir, 'seo.json');

      var seo = {};
      if (fs.existsSync(seoPath)) {
        try {
          seo = JSON.parse(fs.readFileSync(seoPath, 'utf-8'));
        } catch (e) {
          seo = {};
        }
      }

      var html = readPageHtml(pageDir);
      var textContent = stripHtml(html);
      var wordCount = countWords(textContent);
      var h1 = extractH1(html);
      var internalLinks = extractInternalLinks(html);

      pages.push({
        slug: slug,
        title: seo.title || '',
        description: seo.description || '',
        urlPath: seo.urlPath || '',
        noindex: seo.noindex === true,
        schemaType: seo.schemaType || '',
        status: seo.status || '',
        h1: h1,
        wordCount: wordCount,
        internalLinks: internalLinks
      });
    }

    // 2. Read header and footer to find navigation links
    var sharedDir = path.join(PREVIEWS_DIR, '_shared');
    var headerHtml = '';
    var footerHtml = '';
    try {
      headerHtml = fs.readFileSync(path.join(sharedDir, 'header.html'), 'utf-8');
    } catch (e) {}
    try {
      footerHtml = fs.readFileSync(path.join(sharedDir, 'footer.html'), 'utf-8');
    } catch (e) {}

    var navLinks = extractInternalLinks(headerHtml + '\n' + footerHtml);
    // Normalize nav links — extract slug portion
    var navSlugs = {};
    for (var n = 0; n < navLinks.length; n++) {
      var linkSlug = navLinks[n].split('/')[0] || navLinks[n];
      navSlugs[linkSlug] = true;
      // Also store the full path
      navSlugs[navLinks[n]] = true;
    }

    // 3. Build audit results
    var allSlugs = pages.map(function(p) { return p.slug; });

    // Duplicate titles
    var titleMap = {};
    for (var t = 0; t < pages.length; t++) {
      var title = pages[t].title.trim();
      if (!title) continue;
      if (!titleMap[title]) titleMap[title] = [];
      titleMap[title].push(pages[t].slug);
    }
    var duplicateTitles = {};
    Object.keys(titleMap).forEach(function(k) {
      if (titleMap[k].length > 1) duplicateTitles[k] = titleMap[k];
    });

    // Duplicate descriptions
    var descMap = {};
    for (var d = 0; d < pages.length; d++) {
      var desc = pages[d].description.trim();
      if (!desc) continue;
      if (!descMap[desc]) descMap[desc] = [];
      descMap[desc].push(pages[d].slug);
    }
    var duplicateDescriptions = {};
    Object.keys(descMap).forEach(function(k) {
      if (descMap[k].length > 1) duplicateDescriptions[k] = descMap[k];
    });

    // Orphan pages — not linked from header or footer
    var orphanPages = [];
    for (var o = 0; o < pages.length; o++) {
      var pg = pages[o];
      var slug2 = pg.slug;
      var urlPath = pg.urlPath ? pg.urlPath.replace(/^\/+/, '').replace(/\/+$/, '') : '';
      var isLinked = navSlugs[slug2] || navSlugs[urlPath];
      // Also check if urlPath partial matches
      if (!isLinked && urlPath) {
        var urlParts = urlPath.split('/');
        for (var up = 0; up < urlParts.length; up++) {
          if (navSlugs[urlParts[up]]) { isLinked = true; break; }
        }
      }
      if (!isLinked) {
        orphanPages.push(slug2);
      }
    }

    // Empty indexable pages (< 100 words and not noindex)
    var emptyPages = [];
    for (var e2 = 0; e2 < pages.length; e2++) {
      if (pages[e2].wordCount < 100 && !pages[e2].noindex) {
        emptyPages.push({ slug: pages[e2].slug, wordCount: pages[e2].wordCount });
      }
    }

    // Canonical inconsistencies — urlPath doesn't match slug
    var canonicalIssues = [];
    for (var c = 0; c < pages.length; c++) {
      var pg2 = pages[c];
      if (pg2.urlPath) {
        var normalizedUrl = pg2.urlPath.replace(/^\/+/, '').replace(/\/+$/, '');
        if (normalizedUrl && normalizedUrl !== pg2.slug) {
          canonicalIssues.push({
            slug: pg2.slug,
            urlPath: pg2.urlPath
          });
        }
      }
    }

    // Missing SEO data
    var missingSeo = [];
    for (var m = 0; m < pages.length; m++) {
      var missing = [];
      if (!pages[m].title.trim()) missing.push('title');
      if (!pages[m].description.trim()) missing.push('description');
      if (missing.length > 0) {
        missingSeo.push({ slug: pages[m].slug, missing: missing });
      }
    }

    // Missing H1
    var missingH1 = [];
    for (var h = 0; h < pages.length; h++) {
      if (!pages[h].h1) {
        missingH1.push(pages[h].slug);
      }
    }

    // 4. Calculate score
    var criticalIssues = 0;
    var warnings = 0;

    // Critical: duplicate titles, missing SEO, missing H1
    criticalIssues += Object.keys(duplicateTitles).length;
    criticalIssues += missingSeo.length;
    criticalIssues += missingH1.length;

    // Warnings: duplicate descriptions, orphans, empty pages, canonical issues
    warnings += Object.keys(duplicateDescriptions).length;
    warnings += orphanPages.length;
    warnings += emptyPages.length;
    warnings += canonicalIssues.length;

    var score = Math.max(0, Math.min(100, 100 - (10 * criticalIssues) - (3 * warnings)));

    res.json({
      score: score,
      totalPages: pages.length,
      criticalIssues: criticalIssues,
      warnings: warnings,
      duplicateTitles: duplicateTitles,
      duplicateDescriptions: duplicateDescriptions,
      orphanPages: orphanPages,
      emptyPages: emptyPages,
      canonicalIssues: canonicalIssues,
      missingSeo: missingSeo,
      missingH1: missingH1,
      pages: pages.map(function(p) {
        return {
          slug: p.slug,
          title: p.title,
          description: p.description,
          urlPath: p.urlPath,
          noindex: p.noindex,
          h1: p.h1,
          wordCount: p.wordCount
        };
      })
    });
  } catch (err) {
    console.error('Audit global error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'audit global' });
  }
});

module.exports = router;
