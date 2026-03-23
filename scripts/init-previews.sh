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

echo "[init] Volume initialization complete. Starting server..."

# Start the Node.js server
exec node server.js
