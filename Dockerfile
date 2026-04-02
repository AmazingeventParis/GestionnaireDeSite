FROM node:20-alpine

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
