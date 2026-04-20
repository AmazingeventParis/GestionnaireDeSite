#!/bin/sh
# Init script: seed persistent volumes from repo if they are empty
# Runs at container startup before the Node.js server

echo "[init] Starting volume initialization..."

# === PREVIEWS ===
PREVIEWS_DIR="/app/previews"
PREVIEWS_SEED="/app/previews-seed"

if [ -d "$PREVIEWS_SEED" ]; then
  HTML_COUNT=$(find "$PREVIEWS_DIR" -name "*.html" 2>/dev/null | wc -l)

  if [ "$HTML_COUNT" -eq 0 ]; then
    echo "[init] Previews volume is empty — seeding from repo..."
    cp -r "$PREVIEWS_SEED"/* "$PREVIEWS_DIR/" 2>/dev/null || true
    echo "[init] Seeded $(find "$PREVIEWS_DIR" -name "*.html" | wc -l) HTML files"
  else
    echo "[init] Previews volume has $HTML_COUNT HTML files — keeping existing data"
  fi

  # Always sync shared files (header/footer updates from repo)
  if [ -d "$PREVIEWS_SEED/_shared" ]; then
    mkdir -p "$PREVIEWS_DIR/_shared"
    cp "$PREVIEWS_SEED/_shared"/*.html "$PREVIEWS_DIR/_shared/" 2>/dev/null || true
    echo "[init] Synced shared header/footer from repo"
  fi
fi

# === SITE IMAGES ===
IMAGES_DIR="/app/public/site-images"
IMAGES_SEED="/app/site-images-seed"

if [ -d "$IMAGES_SEED" ]; then
  IMG_COUNT=$(find "$IMAGES_DIR" -type f 2>/dev/null | wc -l)

  if [ "$IMG_COUNT" -eq 0 ]; then
    echo "[init] Site-images volume is empty — seeding from repo..."
    cp -r "$IMAGES_SEED"/* "$IMAGES_DIR/" 2>/dev/null || true
    echo "[init] Seeded $(find "$IMAGES_DIR" -type f | wc -l) image files"
  else
    echo "[init] Site-images volume has $IMG_COUNT files — keeping existing data"
  fi
fi

echo "[init] Volume initialization complete."

# === DEPLOYED AT MIGRATION ===
# Set deployedAt for all pages that don't have it (marks them as published)
node -e "
const fs = require('fs'), path = require('path');
const previewsDir = '/app/previews';
const now = new Date().toISOString();
let count = 0;
// Home page
const homeSeo = path.join(previewsDir, 'seo-home.json');
if (fs.existsSync(homeSeo)) {
  try {
    const seo = JSON.parse(fs.readFileSync(homeSeo, 'utf-8'));
    if (!seo.deployedAt) { seo.deployedAt = now; fs.writeFileSync(homeSeo, JSON.stringify(seo, null, 2)); count++; }
  } catch {}
}
// Other pages
const entries = fs.existsSync(previewsDir) ? fs.readdirSync(previewsDir, { withFileTypes: true }) : [];
for (const e of entries) {
  if (!e.isDirectory() || e.name.startsWith('_')) continue;
  const seoPath = path.join(previewsDir, e.name, 'seo.json');
  if (fs.existsSync(seoPath)) {
    try {
      const seo = JSON.parse(fs.readFileSync(seoPath, 'utf-8'));
      if (!seo.deployedAt) { seo.deployedAt = now; fs.writeFileSync(seoPath, JSON.stringify(seo, null, 2)); count++; }
    } catch {}
  }
}
console.log('[init] deployedAt set for', count, 'pages');
"

# === PUPPETEER ===
# Ensure puppeteer is available (fallback if Docker build didn't include it)
if ! node -e "require('puppeteer')" 2>/dev/null; then
  echo "[init] puppeteer not found — installing..."
  npm install puppeteer --no-save 2>&1 | tail -3
  echo "[init] puppeteer installed."
else
  echo "[init] puppeteer OK."
fi

echo "[init] Starting server..."

# Start the Node.js server
exec node server.js
