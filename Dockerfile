FROM node:20-alpine

# Chromium + dependencies for Puppeteer on Alpine
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto

# Tell Puppeteer to use system Chromium instead of downloading its own
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

RUN mkdir -p uploads_tmp backups previews public/site-images

# Copy repo data to seed directories (won't be overwritten by volume mounts)
RUN cp -r previews previews-seed
RUN cp -r public/site-images site-images-seed

# Make init script executable
RUN chmod +x scripts/init-previews.sh

EXPOSE 3000

# Use init script that seeds volumes if empty, then starts server
CMD ["sh", "scripts/init-previews.sh"]
