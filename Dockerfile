FROM node:20-alpine

# Инструменты для сборки нативных модулей (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

ENV NODE_ENV=production

# Сначала зависимости — используем кэш слоёв Docker
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Затем исходники (node_modules и локальная БД исключены через .dockerignore)
COPY . .

# Директории для данных и загрузок
RUN mkdir -p server/db public/uploads

EXPOSE 8080

# Render передаёт порт через переменную окружения PORT (по умолчанию 8080)
CMD ["node", "server/server.js"]
