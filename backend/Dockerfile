FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
# SQL migrations are applied at startup (config/env.js -> ../../db/migrations).
COPY db ./db

EXPOSE 3000
CMD ["node", "src/server.js"]
