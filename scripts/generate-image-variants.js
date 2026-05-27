#!/usr/bin/env node
// Generate responsive variants (-480w, -768w) for /images/ directory
// Usage: node scripts/generate-image-variants.js [<path-list-file>]
// If no file is given, scans public/images/ and generates variants for all .webp/.jpg/.jpeg/.png
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');

const VARIANTS = [
  { suffix: '-480w', width: 480 },
  { suffix: '-768w', width: 768 }
];

function listImagesRecursive(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listImagesRecursive(fp, out);
    } else if (/\.(webp|jpg|jpeg|png)$/i.test(entry.name)) {
      // Skip variants themselves to avoid recursion
      if (/-480w\.|-768w\.|-1280w\./i.test(entry.name)) continue;
      out.push(fp);
    }
  }
  return out;
}

async function generateVariants(imgPath) {
  const ext = path.extname(imgPath).toLowerCase();
  const base = imgPath.slice(0, -ext.length);
  const results = [];
  try {
    const meta = await sharp(imgPath).metadata();
    const origWidth = meta.width || 1200;
    for (const v of VARIANTS) {
      const outPath = `${base}${v.suffix}${ext}`;
      // Skip if already exists and is fresh
      if (fs.existsSync(outPath)) {
        const origStat = fs.statSync(imgPath);
        const outStat = fs.statSync(outPath);
        if (outStat.mtimeMs >= origStat.mtimeMs) {
          results.push({ outPath, status: 'skip-fresh' });
          continue;
        }
      }
      // Skip if original is narrower than the variant width
      if (origWidth <= v.width) {
        results.push({ outPath, status: 'skip-too-small' });
        continue;
      }
      const pipeline = sharp(imgPath).resize(v.width, null, { fit: 'inside', withoutEnlargement: true });
      if (ext === '.webp') {
        await pipeline.webp({ quality: 75 }).toFile(outPath);
      } else if (ext === '.jpg' || ext === '.jpeg') {
        await pipeline.jpeg({ quality: 80, mozjpeg: true }).toFile(outPath);
      } else if (ext === '.png') {
        await pipeline.png({ compressionLevel: 9 }).toFile(outPath);
      }
      results.push({ outPath, status: 'ok' });
    }
    return { imgPath, results };
  } catch (e) {
    return { imgPath, error: e.message };
  }
}

(async () => {
  let images;
  const argFile = process.argv[2];
  if (argFile && fs.existsSync(argFile)) {
    // Read paths from file (one per line, like "/images/foo.webp")
    images = fs.readFileSync(argFile, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(p => path.join(ROOT, 'public', p.replace(/^\//, '')));
    console.log(`Reading paths from ${argFile}: ${images.length} images`);
  } else {
    images = listImagesRecursive(IMAGES_DIR);
    console.log(`Scanning ${IMAGES_DIR}: ${images.length} images`);
  }

  let okCount = 0, skipFresh = 0, skipSmall = 0, errCount = 0;
  for (const img of images) {
    if (!fs.existsSync(img)) { console.log(`MISSING: ${img}`); continue; }
    const { error, results } = await generateVariants(img);
    if (error) { errCount++; console.log(`ERR  ${path.relative(ROOT, img)}: ${error}`); continue; }
    const stats = { ok: 0, fresh: 0, small: 0 };
    results.forEach(r => {
      if (r.status === 'ok') stats.ok++;
      else if (r.status === 'skip-fresh') stats.fresh++;
      else stats.small++;
    });
    okCount += stats.ok;
    skipFresh += stats.fresh;
    skipSmall += stats.small;
    const sym = stats.ok ? '✓' : stats.fresh === results.length ? '·' : '−';
    console.log(`${sym} ${path.relative(ROOT, img)} (ok=${stats.ok}, fresh=${stats.fresh}, small=${stats.small})`);
  }
  console.log(`\n=== Summary ===`);
  console.log(`Generated: ${okCount} | Already fresh: ${skipFresh} | Too small: ${skipSmall} | Errors: ${errCount}`);
})();
