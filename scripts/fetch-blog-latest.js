// scripts/fetch-blog-latest.js
// Fetch the 6 latest published articles from shootnbox.fr WP REST API
// and cache them in previews/_shared/latest-blog.json for SSR injection.
//
// Runs via server.js scheduler (every 6h) or: node scripts/fetch-blog-latest.js

const fs = require('fs');
const path = require('path');

const WP_ENDPOINT = 'https://shootnbox.fr/wp-json/wp/v2/posts';
const POST_LIMIT = 6;
const OUTPUT_PATH = path.join(__dirname, '..', 'previews', '_shared', 'latest-blog.json');

// Category name → color class mapping for design consistency
const CATEGORY_COLORS = {
  'mariage': 'rose',
  'mariages': 'rose',
  'entreprise': 'bleu',
  'événements d\'entreprise': 'bleu',
  'evenements-d-entreprise': 'bleu',
  'anniversaire': 'violet',
  'anniversaires': 'violet',
  'conseils': 'orange',
  'tendances': 'orange',
  'inspirations': 'rose',
  'inspirations pour événements': 'rose',
};

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  agrave: 'à', acirc: 'â', auml: 'ä', aelig: 'æ',
  ccedil: 'ç', icirc: 'î', iuml: 'ï', ocirc: 'ô', ouml: 'ö',
  ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Agrave: 'À', Ccedil: 'Ç',
};
function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] !== undefined ? NAMED_ENTITIES[name] : m);
}

function stripHtml(s) {
  return decodeHtmlEntities(String(s || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function pickCategoryColor(categoryName) {
  if (!categoryName) return 'rose';
  const key = String(categoryName).toLowerCase().trim();
  for (const [k, v] of Object.entries(CATEGORY_COLORS)) {
    if (key.includes(k)) return v;
  }
  return 'rose';
}

async function fetchLatest() {
  const url = `${WP_ENDPOINT}?per_page=${POST_LIMIT}&orderby=date&order=desc&_embed=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Shootnbox-GDS/1.0' } });
  if (!res.ok) throw new Error(`WP REST HTTP ${res.status}`);
  const posts = await res.json();
  if (!Array.isArray(posts)) throw new Error('Unexpected WP REST response');

  const articles = posts.map((p) => {
    const title = stripHtml(p.title?.rendered || '');
    const excerpt = stripHtml(p.excerpt?.rendered || '').slice(0, 160);
    const url = p.link || '';
    const slug = p.slug || '';
    const date = p.date || '';

    // Featured image: _embedded['wp:featuredmedia'][0].source_url (or media_details.sizes.medium_large.source_url)
    const media = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
    let image = '';
    let imageAlt = title;
    if (media) {
      const sizes = media.media_details?.sizes;
      image = sizes?.medium_large?.source_url
           || sizes?.large?.source_url
           || sizes?.medium?.source_url
           || media.source_url
           || '';
      imageAlt = media.alt_text || title;
    }

    // Category: _embedded['wp:term'][0] is an array of category terms
    const terms = p._embedded && p._embedded['wp:term'];
    const categoryTerm = terms && terms[0] && terms[0][0];
    const categoryName = categoryTerm?.name || '';
    const categoryColor = pickCategoryColor(categoryName);

    return { id: p.id, slug, title, excerpt, url, date, image, imageAlt, categoryName, categoryColor };
  });

  const data = {
    lastUpdated: new Date().toISOString(),
    source: 'wp-rest',
    endpoint: WP_ENDPOINT,
    articles,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

if (require.main === module) {
  fetchLatest()
    .then((data) => {
      console.log(`[blog-latest] Fetched ${data.articles.length} posts → ${OUTPUT_PATH}`);
      data.articles.forEach((a, i) => {
        console.log(`  ${i + 1}. ${a.title} — ${a.categoryName || '(no cat)'} — ${a.date.split('T')[0]}`);
      });
    })
    .catch((err) => {
      console.error('[blog-latest] ERROR:', err.message);
      process.exit(1);
    });
}

module.exports = { fetchLatest };
