const fs = require('fs');
const path = require('path');

// Adapted for GestionnaireDeSite structure
// previews/ = source of truth (drafts)
// public/site/ = built output (production pages)
// public/site-images/ = images
const projectRoot = path.join(__dirname, '..');
const previewsDir = path.join(projectRoot, 'previews');

// Read site-config.json for SEO data
const siteConfigPath = path.join(projectRoot, 'site-config.json');
const siteConfig = JSON.parse(fs.readFileSync(siteConfigPath, 'utf-8'));
const SITE_DOMAIN = siteConfig.deploy?.domain ? `https://${siteConfig.deploy.domain}` : 'https://shootnbox.swipego.app';
const PRODUCTION_DOMAIN = 'https://shootnbox.fr'; // Future production domain

// ===== PAGES CONFIGURATION =====
const pages = [
  {
    slug: 'home',
    output: 'public/site/index.html',
    title: 'Shootnbox - Location Photobooth &amp; Borne Photo Paris | \u00c9v\u00e9nements',
    description: 'Shootnbox, sp\u00e9cialiste de la location de photobooth et borne photo \u00e0 Paris et en \u00cele-de-France. Mariages, entreprises, soir\u00e9es : des souvenirs inoubliables pour vos \u00e9v\u00e9nements.',
    ogTitle: 'Shootnbox - Location Photobooth & Borne Photo Paris',
    ogDescription: 'Sp\u00e9cialiste de la location de photobooth et borne photo \u00e0 Paris. Mariages, entreprises, soir\u00e9es.',
    ogImage: 'https://shootnbox.swipego.app/images/vegas-hero-group.webp',
    ogUrl: 'https://shootnbox.swipego.app/',
    preloadImage: '/images/vegas-hero-group.webp',
    schemaType: 'WebSite',
    breadcrumbs: [],
    hasFaq: false,
    sections: [
      'hero', 'trust', 'bento', 'stats', 'avis',
      'equipe', 'savoirfaire', 'mur', 'carte-france', 'blog'
    ],
    previewDir: previewsDir  // sections at root of previews/
  },
  {
    slug: 'location-photobooth',
    output: 'public/site/location-photobooth/index.html',
    title: 'Location Photobooth Paris | Borne Photo Mariage & Entreprise - Shootnbox',
    description: 'Louez un photobooth professionnel \u00e0 Paris et en \u00cele-de-France. Borne photo Ring, Vegas, Miroir, Spinner 360. Mariages, soir\u00e9es, \u00e9v\u00e9nements d\'entreprise.',
    ogTitle: 'Location Photobooth Paris - Shootnbox',
    ogDescription: 'Louez un photobooth professionnel pour vos \u00e9v\u00e9nements. 4 bornes au choix, livraison partout en France.',
    ogImage: 'https://shootnbox.swipego.app/images/vegas-hero-group.webp',
    ogUrl: 'https://shootnbox.swipego.app/location-photobooth/',
    preloadImage: '/images/location-hero-party.webp',
    schemaType: 'Service',
    breadcrumbs: [
      { name: 'Accueil', url: '/' },
      { name: 'Location Photobooth', url: '/location-photobooth/' }
    ],
    hasFaq: true,
    sections: ['hero', 'intro', 'bornes', 'avis', 'usages', 'service-v2', 'fabrication', 'comparatif', 'couverture', 'faq', 'blog'],
    previewDir: path.join(previewsDir, 'location-photobooth')
  },
  {
    slug: 'location-photobooth-entreprise',
    output: 'public/site/location-photobooth-entreprise/index.html',
    title: 'Location Photobooth Entreprise | Borne Photo S\u00e9minaire & Team Building - Shootnbox',
    description: 'Louez un photobooth pour vos \u00e9v\u00e9nements d\'entreprise : s\u00e9minaires, team buildings, soir\u00e9es corporate, salons. Borne photo premium livr\u00e9e partout en France.',
    ogTitle: 'Location Photobooth Entreprise - Shootnbox',
    ogDescription: 'Borne photo pour s\u00e9minaires, team buildings et soir\u00e9es d\'entreprise. Livraison partout en France.',
    ogImage: 'https://shootnbox.swipego.app/images/location-hero-entreprise.webp',
    ogUrl: 'https://shootnbox.swipego.app/location-photobooth-entreprise/',
    preloadImage: '/images/location-hero-entreprise.webp',
    schemaType: 'Service',
    breadcrumbs: [
      { name: 'Accueil', url: '/' },
      { name: 'Location Photobooth', url: '/location-photobooth/' },
      { name: 'Entreprise', url: '/location-photobooth-entreprise/' }
    ],
    hasFaq: false,
    sections: ['hero', 'trust', 'intro', 'bornes', 'modeles', 'service', 'usages'],
    previewDir: path.join(previewsDir, 'location-photobooth-entreprise')
  }
];

// Image dimensions map (path -> [width, height]) for CLS prevention
const imageDimensions = {
  '/site-images/logo/shootnbox-logo-new-1.webp': [330, 175],
  '/site-images/arrow-hand.webp': [247, 560],
  '/site-images/carte-france.webp': [1145, 1200],
  '/site-images/vegas-hero-group.webp': [1200, 900],
  '/site-images/vegas3.webp': [1200, 898],
  '/site-images/bornes/Miroir.webp': [1200, 898],
  '/site-images/bornes/Ring.webp': [1200, 898],
  '/site-images/bornes/Spinner.webp': [1200, 898],
  '/site-images/bornes/Vegas.webp': [1200, 898],
  '/site-images/bento/1.webp': [800, 1200], '/images/bento/2.webp': [800, 1200],
  '/site-images/bento/3.webp': [1200, 800], '/images/bento/4.webp': [1200, 800],
  '/site-images/bento/5.webp': [1200, 800], '/images/bento/6.webp': [1200, 800],
  '/site-images/bento/7.webp': [800, 1200], '/images/bento/8.webp': [800, 1200],
  '/site-images/bento/9.webp': [1200, 800], '/images/bento/10.webp': [800, 1200],
  '/site-images/bento/11.webp': [800, 1200], '/images/bento/12.webp': [1200, 800],
  '/site-images/bento/13.webp': [800, 1200], '/images/bento/14.webp': [1200, 800],
  '/site-images/bento/15.webp': [1200, 800], '/images/bento/16.webp': [408, 1200],
  '/site-images/bento/17.webp': [400, 1200],
  '/site-images/bento/Aircam-scaled.webp': [1200, 748],
  '/site-images/bento/Kara-1.webp': [1200, 603],
  '/site-images/bento/Vogue-scaled.webp': [1200, 675],
  '/site-images/team/team-021.webp': [1200, 796],
  '/site-images/team/team-028.webp': [1200, 800],
  '/site-images/team/team-128.webp': [1200, 800],
  '/site-images/savoirfaire/sf-borddemer-15.webp': [904, 1200],
  '/site-images/savoirfaire/sf-borne-basicfit-15.webp': [1200, 900],
  '/site-images/savoirfaire/sf-borne-creditmutuel.webp': [1200, 900],
  '/site-images/savoirfaire/sf-borne-perso.webp': [1200, 900],
  '/site-images/savoirfaire/sf-evenement-15.webp': [736, 1155],
  '/site-images/savoirfaire/sf-gala.webp': [327, 486],
  '/site-images/savoirfaire/sf-mariage.webp': [330, 487],
  '/site-images/savoirfaire/sf-nrj-7.webp': [1200, 808],
  '/site-images/savoirfaire/sf-paris-15-scaled.webp': [583, 1200],
  '/site-images/savoirfaire/sf-soiree.webp': [327, 487],
  '/site-images/agence/paris-51.webp': [1200, 900],
  '/site-images/agence/paris-52.webp': [900, 1200],
  '/site-images/agence/paris-53.webp': [900, 1200],
  '/site-images/agence/paris-54.webp': [900, 1200],
  '/site-images/agence/paris-55.webp': [1200, 900],
  '/site-images/location-hero-party.webp': [1200, 493],
  '/site-images/borne-ring-detoure.webp': [800, 1390],
  '/site-images/borne-made-in-france.webp': [800, 800],
  '/site-images/camion-shootnbox-v2.webp': [1200, 543],
  '/site-images/equipe-shootnbox.webp': [1200, 800],
  '/site-images/sarah-appel.webp': [800, 566],
  '/site-images/usage-anniversaire.webp': [700, 525],
  '/site-images/usage-entreprise.webp': [700, 466],
  '/site-images/usage-mariage.webp': [700, 525],
  '/site-images/strip-photo-1.webp': [220, 322],
  '/site-images/strip-photo-2.webp': [220, 142],
  '/site-images/strip-photo-3.webp': [220, 335],
  '/site-images/strip-photo-4.webp': [220, 323],
  '/site-images/strip-photo-5.webp': [220, 256],
  '/site-images/strip-photo-6.webp': [220, 142],
  '/site-images/strip-photo-7.webp': [220, 345],
  '/site-images/strip-photo-8.webp': [220, 338],
  '/site-images/strip-photo-9.webp': [220, 326],
  '/site-images/strip-photo-10.webp': [220, 311],
  '/site-images/bornes/ring-1.webp': [930, 623],
  '/site-images/bornes/ring-2.webp': [930, 698],
  '/site-images/bornes/ring-3.webp': [930, 667],
  '/site-images/bornes/ring-4.webp': [930, 620],
  '/site-images/bornes/ring-5.webp': [930, 629],
  '/site-images/bornes/ring-6.webp': [930, 606],
  '/site-images/bornes/vegas-1.webp': [1200, 800],
  '/site-images/bornes/vegas-2.webp': [1200, 800],
  '/site-images/bornes/vegas-3.webp': [1200, 800],
  '/site-images/bornes/vegas-4.webp': [1200, 800],
  '/site-images/bornes/vegas-5.webp': [1200, 800],
  '/site-images/bornes/miroir-1.webp': [1200, 800],
  '/site-images/bornes/miroir-2.webp': [1200, 800],
  '/site-images/bornes/miroir-3.webp': [1200, 800],
  '/site-images/bornes/spinner-1.webp': [1200, 800],
  '/site-images/couverture/bureau-bis.webp': [1200, 800],
  '/site-images/agence/bureau-bis.webp': [1200, 800],
  '/site-images/couverture/paris-51.webp': [1200, 900],
  '/site-images/couverture/paris-52.webp': [900, 1200],
  '/site-images/couverture/paris-53.webp': [900, 1200],
  '/site-images/couverture/paris-54.webp': [900, 1200],
  '/site-images/couverture/paris-55.webp': [1200, 900],
  '/site-images/couverture/team-021.webp': [1200, 796],
  '/site-images/couverture/team-028.webp': [1200, 800],
  '/site-images/couverture/team-128.webp': [1200, 800],
};
// Logos all 417x417
for (let i = 2; i <= 19; i++) {
  const pad = i.toString().padStart(2, '0');
  imageDimensions[`/images/logos/logo ils nous font confiance-${pad}.webp`] = [417, 417];
}
imageDimensions['/images/logos/logo ils nous font confiance_Plan de travail 1.webp'] = [417, 417];

// ===== SHARED: Read header & footer =====
function readSection(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    content = bodyMatch[1].trim();
  } else {
    // Fragment file (no <body> wrapper) — use as-is
    content = content.trim();
  }
  // Fix image paths (both ../public/ and ../../public/ for subdirectories)
  // In GestionnaireDeSite, images are served from /site-images/
  content = content.replace(/src="(?:\.\.\/)+public\/images\//g, 'src="/site-images/');
  content = content.replace(/url\((?:\.\.\/)+public\/images\//g, 'url(/site-images/');
  content = content.replace(/url\('(?:\.\.\/)+public\/images\//g, "url('/site-images/");
  content = content.replace(/src="\.\.\/public\/logo/g, 'src="/logo');
  // Also fix absolute /images/ references
  content = content.replace(/src="\/images\//g, 'src="/site-images/');
  content = content.replace(/url\(\/images\//g, 'url(/site-images/');
  content = content.replace(/url\('\/images\//g, "url('/site-images/");
  return content;
}

const sharedHeader = readSection(path.join(previewsDir, '_shared', 'header.html'));
const sharedFooter = readSection(path.join(previewsDir, '_shared', 'footer.html'));

// ===== POST-PROCESSING for Lighthouse =====
function postProcess(html) {
  // 1. Add width/height + loading="lazy" + decoding="async" to images
  html = html.replace(/<img\s([^>]*?)>/gi, (match, attrs) => {
    const srcMatch = attrs.match(/src="([^"]+)"/);
    if (!srcMatch) return match;
    const src = srcMatch[1];

    // External images (blog thumbnails from WordPress)
    if (src.startsWith('http')) {
      if (!attrs.includes('width=') && src.includes('768x494')) {
        attrs += ' width="768" height="494"';
      }
      if (!attrs.includes('loading=')) attrs += ' loading="lazy"';
      if (!attrs.includes('decoding=')) attrs += ' decoding="async"';
      return `<img ${attrs}>`;
    }

    // Add width/height if missing
    if (!attrs.includes('width=')) {
      const dims = imageDimensions[src];
      if (dims) {
        attrs += ` width="${dims[0]}" height="${dims[1]}"`;
      }
    }

    // Logo = above the fold, no lazy
    if (!attrs.includes('loading=')) {
      if (src.includes('/logo/')) {
        attrs += ' fetchpriority="high"';
      } else {
        attrs += ' loading="lazy"';
      }
    }

    if (!attrs.includes('decoding=')) {
      attrs += ' decoding="async"';
    }

    return `<img ${attrs}>`;
  });

  // 2. Add rel="noopener noreferrer" to external links with target="_blank"
  html = html.replace(/<a\s([^>]*?target="_blank"[^>]*?)>/gi, (match, attrs) => {
    if (!attrs.includes('rel=')) {
      attrs += ' rel="noopener noreferrer"';
    }
    return `<a ${attrs}>`;
  });

  // 3. Add data-snb-edit attributes for admin inline editing
  const sectionMap = {
    // Home
    'snb-hero': 'hero',
    'snb-bento': 'bento',
    'trust': 'trust',
    'snb-stats': 'stats',
    'snb-avis': 'avis',
    'snb-equipe': 'equipe',
    'snb-sf': 'savoirfaire',
    'snb-mur': 'mur',
    'snb-cf': 'carte-france',
    'snb-bl': 'blog',
    'snb-footer': 'footer',
    'snb-ft': 'footer',
    // Location-photobooth
    'lp-hero': 'hero',
    'lp-intro': 'intro',
    'snb-bornes': 'bornes',
    'snb-b': 'bornes',
    'snb-tarifs': 'tarifs',
    'snb-usages': 'usages',
    'snb-usage': 'usages',
    'snb-svc2': 'service-v2',
    'snb-service': 'service-v2',
    'snb-fab': 'fabrication',
    'snb-comp': 'comparatif',
    'snb-couv': 'couverture',
    'snb-faq': 'faq',
    // Location-photobooth-entreprise
    'lpe-hero': 'hero',
    'lpei-intro': 'intro',
    'lpem-modeles': 'modeles',
    'lpee-svc': 'service',
    'lpeu-usages': 'usages'
  };

  const cheerio = require('cheerio');
  const $ = cheerio.load(html, { decodeEntities: false });
  const sectionCounters = {};

  const editableTags = ['h1', 'h2', 'h3', 'h4'];
  $(editableTags.join(',')).each((i, el) => {
    const $el = $(el);
    if ($el.closest('#snb-admin-bar, #snb-seo-panel').length) return;
    if (!$el.text().trim()) return;
    let section = 'unknown';
    for (const [cls, name] of Object.entries(sectionMap)) {
      if ($el.closest('.' + cls).length || $el.closest('[class*="' + cls + '"]').length) {
        section = name;
        break;
      }
    }
    if (!sectionCounters[section]) sectionCounters[section] = 0;
    const idx = sectionCounters[section]++;
    const tag = el.tagName.toLowerCase();
    $el.attr('data-snb-edit', `${section}:${idx}:${tag}`);
    $el.attr('data-snb-section', section);
    $el.attr('data-snb-tag', tag.toUpperCase());
  });

  const editableClasses = [
    // Home
    '.hero-subtitle', '.hero-tagline',
    '.card-sub',
    '.trust-title',
    '.equipe-subtitle', '.eq-card-text', '.eq-card-label', '.eq-reass-quote',
    '.sf-card-desc', '.sf-engage-desc', '.sf-feature-text',
    '.sf-cta-note', '.sf-review-text', '.sf-engage-sub',
    '.sf-stat-n', '.sf-stat-l',
    '.sf-gallery-caption', '.sf-gallery-label',
    '.stat-label',
    '.sm-subtitle', '.sm-cta-sub',
    '.snb-cf-title', '.snb-cf-info-title', '.snb-cf-info-text',
    '.snb-bl-title', '.snb-bl-subtitle',
    '.snb-ft-cta-title', '.snb-ft-cta-text', '.snb-ft-cta-subtitle', '.snb-ft-desc',
    // Location-photobooth - hero & intro
    '.lp-hero-sub', '.lp-price-amount', '.lp-price-from', '.lp-price-period', '.lp-price-weekend',
    '.lp-proof-item', '.lp-intro-label', '.lp-intro-p', '.lp-intro-title',
    // Location-photobooth - modules
    '.snb-b-name', '.snb-b-tagline', '.snb-b-feat-text',
    '.snb-tarifs-h2', '.snb-tarifs-desc', '.snb-tarifs-arg-title', '.snb-tarifs-arg-text',
    '.snb-tarifs-check-text',
    '.snb-svc2-step-title', '.snb-svc2-step-desc', '.snb-svc2-subtitle',
    '.snb-fab-text', '.snb-fab-quote',
    '.snb-comp-subtitle', '.snb-comp-card-name', '.snb-comp-card-sub',
    '.snb-comp-intro-card',
    '.snb-couv-subtitle', '.snb-couv-map-title', '.snb-couv-map-desc',
    '.snb-couv-highlight-label',
    '.snb-faq-q', '.snb-faq-ans', '.snb-faq-subtitle'
  ];
  editableClasses.forEach(sel => {
    $(sel).each((i, el) => {
      const $el = $(el);
      if ($el.attr('data-snb-edit')) return;
      let section = 'unknown';
      for (const [cls, name] of Object.entries(sectionMap)) {
        if ($el.closest('.' + cls).length || $el.closest('[class*="' + cls + '"]').length) {
          section = name;
          break;
        }
      }
      if (!sectionCounters[section]) sectionCounters[section] = 0;
      const idx = sectionCounters[section]++;
      const tag = el.tagName.toLowerCase();
      $el.attr('data-snb-edit', `${section}:${idx}:${tag}`);
      $el.attr('data-snb-section', section);
      $el.attr('data-snb-tag', tag.toUpperCase());
    });
  });

  // 4. Add data-snb-img attributes for admin image editing (img tags)
  let imgIdx = 0;
  $('img').each((i, el) => {
    const $el = $(el);
    if ($el.closest('#snb-admin-bar, #snb-seo-panel').length) return;
    const src = $el.attr('src');
    if (!src) return;
    // Skip external images (WordPress blog thumbnails), SVG inline, and tiny icons
    if (src.startsWith('http') || src.startsWith('data:')) return;
    // Skip logo and header nav images
    if (src.includes('/logo/')) return;
    if ($el.closest('.snb-header, .snb-nav, nav, header').length) return;
    let section = 'unknown';
    for (const [cls, name] of Object.entries(sectionMap)) {
      if ($el.closest('.' + cls).length || $el.closest('[class*="' + cls + '"]').length) {
        section = name;
        break;
      }
    }
    // Skip images not in any known section
    if (section === 'unknown') return;
    $el.attr('data-snb-img', `${section}:${imgIdx}:${src}`);
    imgIdx++;
  });

  // 5. Add data-snb-bg attributes for elements with inline background-image
  let bgIdx = 0;
  $('[style]').each((i, el) => {
    const $el = $(el);
    const style = $el.attr('style') || '';
    const bgMatch = style.match(/background(?:-image)?:\s*(?:[^;]*?)url\(([^)]+)\)/);
    if (!bgMatch) return;
    let bgUrl = bgMatch[1].replace(/['"]/g, '');
    // Normalize path
    if (bgUrl.startsWith('../public/')) bgUrl = bgUrl.replace(/^\.\.\/public/, '');
    if (bgUrl.startsWith('../../public/')) bgUrl = bgUrl.replace(/^\.\.\/\.\.\/public/, '');
    if (!bgUrl.startsWith('/images/')) return;
    let section = 'unknown';
    for (const [cls, name] of Object.entries(sectionMap)) {
      if ($el.closest('.' + cls).length || $el.closest('[class*="' + cls + '"]').length) {
        section = name;
        break;
      }
    }
    if (section === 'unknown') return;
    $el.attr('data-snb-bg', `${section}:${bgIdx}:${bgUrl}`);
    bgIdx++;
  });

  html = $.html();
  return html;
}

// ===== CSS HELPERS =====
function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*\n\s*/g, '')
    .replace(/\s*{\s*/g, '{')
    .replace(/\s*}\s*/g, '}')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*;\s*/g, ';')
    .replace(/\s*,\s*/g, ',')
    .replace(/;}/g, '}')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractAndProcessCSS(html, inlineAll) {
  const styleBlocks = [];
  let blockIdx = 0;
  html = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (match, css) => {
    blockIdx++;
    const isCritical = inlineAll || blockIdx <= 3; // blocks 1-3 = global, header, hero
    styleBlocks.push({ css, isCritical, index: blockIdx });
    if (isCritical) {
      return `<style>${minifyCSS(css)}</style>`;
    }
    return '';
  });

  const nonCriticalCSS = styleBlocks.filter(b => !b.isCritical).map(b => b.css).join('\n');
  const minified = minifyCSS(nonCriticalCSS);

  return { html, styleBlocks, minifiedCSS: minified };
}

function extractScripts(html) {
  const scriptBlocks = [];
  html = html.replace(/<script>([\s\S]*?)<\/script>/gi, (match, js) => {
    const trimmed = js.trim();
    if (!trimmed) return '';
    scriptBlocks.push(trimmed);
    return '';
  });
  return { html, scriptBlocks };
}

function minifyHTML(html) {
  html = html.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
  html = html.replace(/\n\s*\n\s*\n/g, '\n');
  html = html.replace(/\n\s{2,}/g, '\n');
  html = html.replace(/\n\s*\n/g, '\n');
  return html;
}

// ===== JSON-LD SCHEMA.ORG GENERATORS =====
function generateOrganizationLD() {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${SITE_DOMAIN}/#organization`,
    'name': siteConfig.identity?.name || 'Shootnbox',
    'alternateName': "Shoot'n'Box",
    'url': SITE_DOMAIN,
    'logo': `${SITE_DOMAIN}/site-images/logo/shootnbox-logo-new-1.webp`,
    'description': siteConfig.identity?.tagline || '',
    'telephone': siteConfig.contact?.phone ? `+33${siteConfig.contact.phone.replace(/[^0-9]/g, '').replace(/^0/, '')}` : '',
    'email': siteConfig.contact?.email || '',
    'address': {
      '@type': 'PostalAddress',
      'addressLocality': 'Paris',
      'addressRegion': 'Ile-de-France',
      'addressCountry': 'FR'
    },
    'areaServed': { '@type': 'Country', 'name': 'France' },
    'priceRange': '\u20ac\u20ac',
    'sameAs': Object.values(siteConfig.footer?.socials || {}).filter(Boolean),
    'aggregateRating': {
      '@type': 'AggregateRating',
      'ratingValue': '4.8',
      'bestRating': '5',
      'ratingCount': '250',
      'reviewCount': '250'
    }
  };
  return org;
}

function generateProductLD(productName, productDesc, productImage, productUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    'name': productName,
    'description': productDesc,
    'image': `${SITE_DOMAIN}${productImage}`,
    'url': `${SITE_DOMAIN}${productUrl}`,
    'brand': { '@type': 'Brand', 'name': 'Shootnbox' },
    'offers': {
      '@type': 'Offer',
      'priceCurrency': 'EUR',
      'availability': 'https://schema.org/InStock',
      'url': `${SITE_DOMAIN}/reservation/`
    },
    'aggregateRating': {
      '@type': 'AggregateRating',
      'ratingValue': '4.8',
      'bestRating': '5',
      'ratingCount': '250'
    }
  };
}

function generateServiceLD(page) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    'name': page.ogTitle,
    'serviceType': 'Photo Booth Rental',
    'provider': { '@id': `${SITE_DOMAIN}/#organization` },
    'areaServed': { '@type': 'Country', 'name': 'France' },
    'description': page.description
  };
}

function generateBreadcrumbLD(breadcrumbs) {
  if (!breadcrumbs || breadcrumbs.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': breadcrumbs.map((item, i) => ({
      '@type': 'ListItem',
      'position': i + 1,
      'name': item.name,
      ...(item.url ? { 'item': SITE_DOMAIN + item.url } : {})
    }))
  };
}

function generateWebSiteLD() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    'name': siteConfig.identity?.name || 'Shootnbox',
    'url': SITE_DOMAIN,
    'publisher': { '@id': `${SITE_DOMAIN}/#organization` }
  };
}

function buildJsonLdTags(page) {
  const scripts = [];

  // Always include Organization (with AggregateRating)
  scripts.push(`<script type="application/ld+json">${JSON.stringify(generateOrganizationLD())}</script>`);

  // Page-specific schema
  if (page.schemaType === 'WebSite') {
    scripts.push(`<script type="application/ld+json">${JSON.stringify(generateWebSiteLD())}</script>`);
  } else if (page.schemaType === 'Service') {
    scripts.push(`<script type="application/ld+json">${JSON.stringify(generateServiceLD(page))}</script>`);
  } else if (page.schemaType === 'Product' && page.product) {
    scripts.push(`<script type="application/ld+json">${JSON.stringify(generateProductLD(page.product.name, page.product.description, page.product.image, page.product.url))}</script>`);
  }

  // Breadcrumbs
  const breadcrumbLD = generateBreadcrumbLD(page.breadcrumbs);
  if (breadcrumbLD) {
    scripts.push(`<script type="application/ld+json">${JSON.stringify(breadcrumbLD)}</script>`);
  }

  return scripts.join('\n');
}

function extractFaqLD(html) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html, { decodeEntities: false });
  const questions = [];

  // Look for FAQ sections (details/summary or custom FAQ markup)
  $('details').each((i, el) => {
    const $el = $(el);
    const question = $el.find('summary').text().trim();
    const answer = $el.find('.snb-faq-ans, .faq-answer, p').first().text().trim();
    if (question && answer) {
      questions.push({ question, answer });
    }
  });

  // Also look for custom FAQ markup
  if (questions.length === 0) {
    $('.snb-faq-q').each((i, el) => {
      const question = $(el).text().trim();
      const answer = $(el).parent().find('.snb-faq-ans').text().trim() ||
                     $(el).next('.snb-faq-ans').text().trim();
      if (question && answer) {
        questions.push({ question, answer });
      }
    });
  }

  if (questions.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': questions.map(q => ({
      '@type': 'Question',
      'name': q.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': q.answer
      }
    }))
  };
}

// ===== SEO VALIDATION =====
function validateSEO(html, page) {
  const warnings = [];

  // Check title length
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    const titleText = titleMatch[1].replace(/&amp;/g, '&');
    if (titleText.length > 60) warnings.push(`  SEO WARN: <title> too long (${titleText.length} chars, max 60)`);
    if (titleText.length < 30) warnings.push(`  SEO WARN: <title> too short (${titleText.length} chars, min 30)`);
  } else {
    warnings.push('  SEO ERROR: No <title> tag found');
  }

  // Check meta description length
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  if (descMatch) {
    if (descMatch[1].length > 160) warnings.push(`  SEO WARN: meta description too long (${descMatch[1].length} chars, max 160)`);
    if (descMatch[1].length < 50) warnings.push(`  SEO WARN: meta description too short (${descMatch[1].length} chars, min 50)`);
  } else {
    warnings.push('  SEO ERROR: No meta description found');
  }

  // Check h1 count
  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1Count === 0) warnings.push('  SEO ERROR: No <h1> tag found');
  if (h1Count > 1) warnings.push(`  SEO WARN: Multiple <h1> tags found (${h1Count}), should be exactly 1`);

  // Check images without alt
  const imgMatches = html.match(/<img\s[^>]*>/gi) || [];
  let missingAlt = 0;
  for (const img of imgMatches) {
    if (!img.includes('alt=')) missingAlt++;
    else {
      const altMatch = img.match(/alt="([^"]*)"/);
      if (altMatch && altMatch[1] === '' && !img.includes('role="presentation"')) {
        // Empty alt is OK for decorative images, but warn for others
      }
    }
  }
  if (missingAlt > 0) warnings.push(`  SEO WARN: ${missingAlt} image(s) missing alt attribute`);

  // Check canonical
  if (!html.includes('rel="canonical"')) {
    warnings.push('  SEO WARN: No canonical URL found (will be added automatically)');
  }

  return warnings;
}

// ===== BUILD EACH PAGE =====
for (const page of pages) {
  console.log(`\n=== Building: ${page.slug} ===`);

  // Read per-page seo.json for noindex and other overrides
  const pageSeoPath = path.join(page.previewDir, 'seo.json');
  if (fs.existsSync(pageSeoPath)) {
    try {
      const pageSeo = JSON.parse(fs.readFileSync(pageSeoPath, 'utf-8'));
      if (pageSeo.noindex) page.noindex = true;
    } catch (e) { /* ignore parse errors */ }
  }

  // Read page-specific sections
  const sectionContents = {};
  for (const name of page.sections) {
    let filePath = path.join(page.previewDir, `${name}.html`);
    if (!fs.existsSync(filePath)) {
      // Fallback to shared previews directory
      filePath = path.join(previewsDir, `${name}.html`);
    }
    if (!fs.existsSync(filePath)) {
      console.warn(`  WARN: ${name}.html not found in ${page.previewDir} or ${previewsDir}, skipping`);
      continue;
    }
    sectionContents[name] = readSection(filePath);
  }

  // Assemble page HTML
  const preloadImg = page.preloadImage
    ? `<link rel="preload" as="image" href="${page.preloadImage}" type="image/webp" fetchpriority="high">`
    : '';

  let html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="${page.noindex ? 'noindex, nofollow' : 'index, follow'}">
<meta name="author" content="${siteConfig.identity?.name || 'Shootnbox'}">
<meta name="theme-color" content="${siteConfig.colors?.primary || '#E51981'}">
<link rel="apple-touch-icon" href="/site-images/logo/shootnbox-logo-new-1.webp">
<link rel="icon" type="image/webp" href="/site-images/logo/shootnbox-logo-new-1.webp">
<title>${page.title}</title>
<meta name="description" content="${page.description}">
<link rel="canonical" href="${page.ogUrl}">
<meta property="og:type" content="website">
<meta property="og:title" content="${page.ogTitle}">
<meta property="og:description" content="${page.ogDescription}">
<meta property="og:image" content="${page.ogImage}">
<meta property="og:url" content="${page.ogUrl}">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:site_name" content="${siteConfig.identity?.name || 'Shootnbox'}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:title" content="${page.ogTitle}">
<meta name="twitter:description" content="${page.ogDescription}">
<meta name="twitter:image" content="${page.ogImage}">
${preloadImg}
<link rel="dns-prefetch" href="https://shootnbox.fr">
<link rel="preload" as="font" type="font/woff2" href="/fonts/raleway-latin.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="/fonts/raleway-900i-latin.woff2" crossorigin>
<style>
@font-face{font-family:'Raleway';font-style:normal;font-weight:400 900;font-display:swap;src:url(/fonts/raleway-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:'Raleway';font-style:normal;font-weight:400 900;font-display:swap;src:url(/fonts/raleway-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:'Raleway';font-style:italic;font-weight:900;font-display:swap;src:url(/fonts/raleway-900i-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:'Raleway';font-style:italic;font-weight:900;font-display:swap;src:url(/fonts/raleway-900i-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; padding: 0; font-family: "Raleway", sans-serif; color: #333; line-height: 1.6; background: ${siteConfig.colors?.bgAlt || '#f8eaff'}; -webkit-font-smoothing: antialiased; }
.snb-page-wrapper { overflow-x: hidden; }
a { text-decoration: none; color: inherit; }
img { max-width: 100%; height: auto; }
ul { list-style: none; padding: 0; margin: 0; }
.snb-page-content { padding-top: 72px; }
@media (max-width: 850px) { .snb-page-content { padding-top: 60px; } }
</style>
${buildJsonLdTags(page)}
</head>
<body>

${sharedHeader}

<main class="snb-page-content">
${page.sections.filter(s => sectionContents[s]).map(s => sectionContents[s]).join('\n\n')}
</main>

${sharedFooter}

</body>
</html>`;

  // Apply Lighthouse optimizations
  html = postProcess(html);

  // Extract FAQ JSON-LD if page has FAQ
  if (page.hasFaq) {
    const faqLD = extractFaqLD(html);
    if (faqLD) {
      const faqScript = `<script type="application/ld+json">${JSON.stringify(faqLD)}</script>`;
      html = html.replace('</head>', `${faqScript}\n</head>`);
      console.log(`  FAQ Schema: ${faqLD.mainEntity.length} questions extracted`);
    }
  }

  // CSS extraction
  const cssResult = extractAndProcessCSS(html, page.inlineAllCSS);
  html = cssResult.html;

  // Write page-specific CSS (or shared if home)
  const cssFileName = page.slug === 'home' ? 'styles.css' : `styles-${page.slug}.css`;
  fs.writeFileSync(path.join(projectRoot, 'public', 'site', cssFileName), cssResult.minifiedCSS, 'utf8');

  // Add deferred CSS link with cache-busting
  const cssCacheBust = Date.now();
  html = html.replace('</head>',
    `<link rel="preload" as="style" href="/${cssFileName}?v=${cssCacheBust}" onload="this.onload=null;this.rel='stylesheet'">\n<noscript><link rel="stylesheet" href="/${cssFileName}?v=${cssCacheBust}"></noscript>\n</head>`
  );

  // Script extraction
  const jsResult = extractScripts(html);
  html = jsResult.html;

  const jsFileName = page.slug === 'home' ? 'scripts.js' : `scripts-${page.slug}.js`;
  if (jsResult.scriptBlocks.length > 0) {
    const allScripts = jsResult.scriptBlocks.join('\n');
    fs.writeFileSync(path.join(projectRoot, 'public', 'site', jsFileName), allScripts, 'utf8');
    const cacheBust = Date.now();
    html = html.replace('</body>', `<script src="/${jsFileName}?v=${cacheBust}" defer></script>\n</body>`);
    console.log(`  Scripts: ${jsResult.scriptBlocks.length} blocks → ${jsFileName} (${(allScripts.length/1024).toFixed(1)} KB)`);
  }

  // HTML minification
  const sizeBefore = Buffer.byteLength(html);
  html = minifyHTML(html);
  const sizeAfter = Buffer.byteLength(html);

  // SEO validation
  const seoWarnings = validateSEO(html, page);
  if (seoWarnings.length > 0) {
    console.log('  SEO Issues:');
    seoWarnings.forEach(w => console.log(w));
  } else {
    console.log('  SEO: All checks passed ✓');
  }

  // Ensure output directory exists
  const outputPath = path.join(projectRoot, page.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');

  // Stats
  const criticalSize = cssResult.styleBlocks.filter(b=>b.isCritical).reduce((s,b)=>s+b.css.length,0);
  console.log(`  Critical CSS: ${(criticalSize/1024)|0} KB | External CSS: ${(cssResult.minifiedCSS.length/1024).toFixed(1)} KB`);
  console.log(`  HTML: ${(sizeBefore/1024).toFixed(1)} KB → ${(sizeAfter/1024).toFixed(1)} KB`);
  console.log(`  → ${page.output} (${(sizeAfter/1024).toFixed(1)} KB)`);

  const imgCount = (html.match(/<img /g) || []).length;
  const lazyCount = (html.match(/loading="lazy"/g) || []).length;
  console.log(`  Images: ${imgCount} total, ${lazyCount} lazy`);
}

// ===== AUTO-GENERATE SITEMAP =====
console.log('\n=== Generating sitemap.xml ===');
const siteDir = path.join(projectRoot, 'public', 'site');
const sitemapEntries = [];

function scanForPages(dir, baseUrl) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory()) {
      scanForPages(path.join(dir, item.name), baseUrl + item.name + '/');
    } else if (item.name === 'index.html') {
      const urlPath = baseUrl || '/';
      const fileStat = fs.statSync(path.join(dir, item.name));
      const lastmod = fileStat.mtime.toISOString().split('T')[0];
      const priority = urlPath === '/' ? '1.0' : urlPath.split('/').filter(Boolean).length <= 1 ? '0.9' : '0.7';
      const changefreq = urlPath === '/' ? 'weekly' : 'monthly';

      // Check per-page seo.json for sitemap exclusion or noindex
      const pageDir = dir;
      const seoJsonPath = path.join(previewsDir, urlPath.replace(/^\/|\/$/g, '') || 'home', 'seo.json');
      let exclude = false;
      if (fs.existsSync(seoJsonPath)) {
        try {
          const seo = JSON.parse(fs.readFileSync(seoJsonPath, 'utf-8'));
          if (seo.noindex || seo.sitemap?.include === false) exclude = true;
        } catch (e) {}
      }
      if (!exclude) {
        sitemapEntries.push({ url: urlPath, lastmod, priority, changefreq });
      }
    }
  }
}

scanForPages(siteDir, '/');

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.map(e => `  <url>
    <loc>${SITE_DOMAIN}${e.url}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

fs.writeFileSync(path.join(siteDir, 'sitemap.xml'), sitemapXml, 'utf-8');
console.log(`  Sitemap: ${sitemapEntries.length} URLs → public/site/sitemap.xml`);

console.log('\nAll pages built successfully!');
