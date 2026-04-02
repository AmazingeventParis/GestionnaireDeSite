#!/usr/bin/env node
/**
 * Generate OG image (1200x630) for a page using Sharp SVG compositing.
 *
 * Usage:
 *   node scripts/generate-og.js --slug=location-photobooth
 *
 * Reads previews/{slug}/seo.json for the title, generates a branded
 * dark-purple gradient image with the title in white, saves to
 * public/site-images/og/{slug}.webp and updates seo.json ogImage field.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// --------------- Config ---------------
const ROOT = path.join(__dirname, '..');
const PREVIEWS_DIR = path.join(ROOT, 'previews');
const OUTPUT_DIR = path.join(ROOT, 'public', 'site-images', 'og');

const WIDTH = 1200;
const HEIGHT = 630;

// --------------- Helpers ---------------

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Split title into 1 or 2 lines.
 * If <= 35 chars, single line centered at y=315.
 * If > 35 chars, split at nearest space to midpoint into 2 lines.
 */
function splitTitle(title) {
  if (!title) return ['Shootnbox'];
  if (title.length <= 35) return [title];

  const mid = Math.floor(title.length / 2);
  let splitIdx = -1;

  // Search outward from midpoint for a space
  for (let offset = 0; offset < mid; offset++) {
    if (title[mid + offset] === ' ') { splitIdx = mid + offset; break; }
    if (title[mid - offset] === ' ') { splitIdx = mid - offset; break; }
  }

  if (splitIdx === -1) return [title]; // no space found, single line

  return [
    title.substring(0, splitIdx).trim(),
    title.substring(splitIdx + 1).trim()
  ];
}

/**
 * Build SVG string for the OG image.
 */
function buildSvg(lines) {
  const fontSize = 52;
  const lineHeight = 64;

  let textElements = '';
  if (lines.length === 1) {
    textElements = `<text x="600" y="330" text-anchor="middle" fill="white" font-size="${fontSize}" font-weight="900" font-family="sans-serif">${escapeHtml(lines[0])}</text>`;
  } else {
    const startY = 300;
    textElements = lines.map((line, i) =>
      `<text x="600" y="${startY + i * lineHeight}" text-anchor="middle" fill="white" font-size="${fontSize}" font-weight="900" font-family="sans-serif">${escapeHtml(line)}</text>`
    ).join('\n  ');
  }

  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a0a22"/>
      <stop offset="100%" stop-color="#2d0535"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <text x="40" y="50" fill="#E51981" font-size="18" font-weight="700" font-family="sans-serif">SHOOTNBOX</text>
  ${textElements}
  <rect x="0" y="610" width="${WIDTH}" height="20" fill="#E51981"/>
</svg>`;
}

// --------------- Main ---------------

async function main() {
  // Parse --slug argument
  const args = process.argv.slice(2);
  const slugArg = args.find(a => a.startsWith('--slug='));
  if (!slugArg) {
    console.error('Usage: node scripts/generate-og.js --slug=<page-slug>');
    process.exit(1);
  }
  const slug = slugArg.split('=')[1];
  if (!slug) {
    console.error('Error: --slug value is empty');
    process.exit(1);
  }

  // Read seo.json
  const seoPath = path.join(PREVIEWS_DIR, slug, 'seo.json');
  if (!fs.existsSync(seoPath)) {
    console.error(`Error: seo.json not found at ${seoPath}`);
    process.exit(1);
  }

  let seoData;
  try {
    seoData = JSON.parse(fs.readFileSync(seoPath, 'utf-8'));
  } catch (e) {
    console.error(`Error: cannot parse seo.json — ${e.message}`);
    process.exit(1);
  }

  const title = seoData.title || slug;
  console.log(`Generating OG image for "${title}" (slug: ${slug})`);

  // Split title into lines
  const lines = splitTitle(title);

  // Build SVG
  const svg = buildSvg(lines);

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Generate image
  const outputPath = path.join(OUTPUT_DIR, `${slug}.webp`);
  await sharp(Buffer.from(svg))
    .webp({ quality: 90 })
    .toFile(outputPath);

  console.log(`Saved: ${outputPath}`);

  // Update seo.json ogImage field
  const ogImageValue = `/site-images/og/${slug}.webp`;
  seoData.ogImage = ogImageValue;
  fs.writeFileSync(seoPath, JSON.stringify(seoData, null, 2), 'utf-8');
  console.log(`Updated seo.json ogImage: ${ogImageValue}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
