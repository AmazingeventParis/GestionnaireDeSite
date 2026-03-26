#!/usr/bin/env node
/**
 * generate-responsive.js
 * One-shot utility: scans site-images/ and generates responsive variants
 * (480w, 768w, 1280w) for images >= 600px wide.
 *
 * Usage: node scripts/generate-responsive.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '..', 'public', 'site-images');
const VARIANT_WIDTHS = [480, 768, 1280];
const WEBP_QUALITY = 80;
const MIN_SOURCE_WIDTH = 600;

// Patterns to skip
const VARIANT_PATTERN = /-(480|768|1280)w\.\w+$/i;
const SKIP_DIRS = ['logo'];
const IMAGE_EXTENSIONS = ['.webp', '.jpg', '.jpeg', '.png'];

/**
 * Recursively collect image file paths
 */
function collectImages(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip logo subdirectories
      if (SKIP_DIRS.includes(entry.name.toLowerCase())) continue;
      results.push(...collectImages(fullPath));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.includes(ext)) continue;
      // Skip existing variant files
      if (VARIANT_PATTERN.test(entry.name)) continue;
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Format bytes into human-readable size
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  return Math.round(bytes / 1024) + 'KB';
}

/**
 * Generate responsive variants for a single image
 * Returns { generated: number } or throws
 */
async function generateVariants(filePath) {
  const metadata = await sharp(filePath).metadata();
  const sourceWidth = metadata.width || 0;

  if (sourceWidth < MIN_SOURCE_WIDTH) {
    return { skipped: true, reason: 'too-small', width: sourceWidth };
  }

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const parts = [];

  for (const w of VARIANT_WIDTHS) {
    // Only generate if variant is smaller than original
    if (w >= sourceWidth) continue;

    const variantName = `${baseName}-${w}w.webp`;
    const variantPath = path.join(dir, variantName);

    // Skip if already exists
    if (fs.existsSync(variantPath)) continue;

    await sharp(filePath)
      .resize(w, null, { withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(variantPath);

    const stat = fs.statSync(variantPath);
    parts.push(`${w}w (${formatSize(stat.size)})`);
  }

  return { skipped: false, generated: parts.length, parts };
}

async function main() {
  console.log('Scanning', IMAGES_DIR, '...\n');

  const images = collectImages(IMAGES_DIR);
  console.log(`Found ${images.length} source images to process.\n`);

  let totalVariants = 0;
  let processedImages = 0;
  let skippedImages = 0;
  let errorCount = 0;

  for (const filePath of images) {
    const relativePath = path.relative(IMAGES_DIR, filePath);
    try {
      const result = await generateVariants(filePath);

      if (result.skipped) {
        skippedImages++;
        continue;
      }

      if (result.generated === 0) {
        // All variants already exist or not applicable
        skippedImages++;
        continue;
      }

      processedImages++;
      totalVariants += result.generated;
      console.log(`[OK] ${relativePath} → ${result.parts.join(', ')}`);
    } catch (err) {
      errorCount++;
      console.error(`[ERR] ${relativePath} — ${err.message}`);
    }
  }

  console.log(`\n========================================`);
  console.log(`Generated ${totalVariants} variants for ${processedImages} images. Skipped ${skippedImages} images.`);
  if (errorCount > 0) {
    console.log(`Errors: ${errorCount}`);
  }
  console.log(`========================================`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
