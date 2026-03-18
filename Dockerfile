FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

RUN mkdir -p uploads_tmp backups previews

EXPOSE 3000

CMD ["node", "server.js"]
