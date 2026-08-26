FROM node:20-alpine

# Инструменты для сборки нативных модулей (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Директория для загрузок
RUN mkdir -p public/uploads

EXPOSE 8080

ENV NODE_ENV=production

CMD ["node", "server/server.js"]
