FROM node:20-alpine

# Chromium headless pour Puppeteer (packages validés Alpine 3.20)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

RUN mkdir -p uploads_tmp backups previews public/site-images

RUN cp -r previews previews-seed
RUN cp -r public/site-images site-images-seed

RUN chmod +x scripts/init-previews.sh

EXPOSE 3000

CMD ["sh", "scripts/init-previews.sh"]
