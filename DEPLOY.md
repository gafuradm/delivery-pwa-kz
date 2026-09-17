# 🚀 Деплой QazconHub на Render (бесплатно, без карты)

## ⚠️ Важно: выбор ветки
Репозиторий `gafuradm/delivery-pwa-kz` содержит несколько проектов:
- ветка **`master`** — старое React/Vite + Supabase приложение (не наш проект);
- ветка **`qazconhub`** — наш терминал QazconHub (Node.js + Express + SQLite), содержит [`render.yaml`](render.yaml:1).

**При создании сервиса на Render обязательно выберите ветку `qazconhub`** — иначе Render не найдёт Blueprint.

## Что уже подготовлено (ветка `qazconhub`)
- [`Dockerfile`](Dockerfile:1) — Node.js 20 + сборка нативного модуля `better-sqlite3` (образ собирается на серверах Render; локальный Docker не нужен).
- [`.dockerignore`](.dockerignore:1) — исключает `node_modules`, локальную БД, загрузки и скриншоты из образа (иначе macOS-бинарь `better-sqlite3` перетёр бы linux-сборку).
- [`render.yaml`](render.yaml:1) — Blueprint (инфраструктура как код): план `free`, регион `frankfurt`.
- Сервер слушает `process.env.PORT` и `0.0.0.0` — полностью совместим с Render (см. [`server/server.js`](server/server.js:18)).
- [`server/db.js`](server/db.js:5) сам создаёт директорию БД и заливает seed-данные при первом запуске.

## Шаг 1. Репозиторий и ветка
- Репозиторий: `https://github.com/gafuradm/delivery-pwa-kz`
- Рабочая ветка: **`qazconhub`** (уже запушена, все изменения закоммичены).

## Шаг 2. Создать Blueprint на Render
1. Зарегистрируйтесь на https://render.com (кнопка **Get Started → GitHub**; банковская карта не требуется).
2. **New +** → **Blueprint**.
3. Выберите репозиторий `gafuradm/delivery-pwa-kz` (при первом разе дайте Render доступ к GitHub).
4. В поле **Branch** выберите **`qazconhub`** (не `master`!).
5. Render прочитает `render.yaml` и покажет сервис **qazconhub-terminal**.
6. Нажмите **Apply** / **Create Resources**.

## Шаг 3. Дождаться сборки
Первый билд занимает **3–6 минут** (компиляция `better-sqlite3`). В логах появится строка вида `Server started on 0.0.0.0:<PORT>` / `listening`.
После этого сервис доступен по адресу:
```
https://qazconhub-terminal.onrender.com
```
(точный домен Render покажет в панели сервиса)

## Шаг 4. Проверка
- Откройте URL → откроется страница входа ([`index.html`](public/index.html:1)).
- Логин: **admin** / **admin123** (см. seed в [`server/db.js`](server/db.js:158)).

## Особенности бесплатного тарифа Render
- **Засыпание:** после 15 минут простоя сервис останавливается; первый запрос — «холодный старт» 30–60 секунд.
- **Эфемерная ФС:** постоянного диска нет. При каждом перезапуске БД пересоздаётся и заливаются seed-данные.
  - Восстанавливаются автоматически: пользователи, пути, спецтехника (см. `seed()` в [`server/db.js`](server/db.js:151)).
  - Сбрасываются: всё, что вводилось вручную (контейнеры, заявки, очередь, вагоны, загрузки).
  - Для постоянного хранения нужен платный **Disk** (Render) или внешняя БД.
- **WebSocket (Socket.IO)** на бесплатном тарифе работает.

## Проверка API-тестами: только локально

`npm test` поднимает **свой** сервер на порту :8099 с временной БД в `/tmp`
([`test/run-isolated.sh`](test/run-isolated.sh:1)), поэтому прод-данные не затрагиваются.

Против развёрнутого сервиса тест запускать не нужно: он **создаёт** документы, контейнеры,
вагоны, пропуска и заявки и ничего не удаляет за собой. Если всё же потребуется,
используйте отдельный стенд, а не рабочий домен:

```bash
BASE_URL=https://<тестовый-стенд> npm run test:direct
```

## Переменные окружения
`render.yaml` задаёт автоматически:
- `JWT_SECRET` — генерируется Render (случайное значение).
- `NODE_ENV=production`.
- `PORT` — Render подставляет сам, сервер его подхватывает.

`JWT_SECRET` обязателен при `NODE_ENV=production`: сервер проверяет его на старте и
завершается с `[FATAL] Переменная окружения JWT_SECRET не задана`, если он не передан.
Это защита от продакшена на дефолтном секрете из репозитория (иначе токен с ролью
`admin` мог бы подписать любой, у кого есть исходники).

Поэтому при ручных способах деплоя секрет нужно задать самому:

```bash
# Fly.io — до первого деплоя
fly secrets set JWT_SECRET="$(openssl rand -hex 32)"

# Docker
docker run -p 8080:8080 -e JWT_SECRET="$(openssl rand -hex 32)" qazconhub-terminal

# Render без Blueprint: Settings → Environment → Add Environment Variable
```

## Альтернатива: ручной деплой (без Blueprint)
**New +** → **Web Service** → выберите репозиторий → **Branch: `qazconhub`** →
**Runtime: Docker** → **Instance Type: Free** → **Health Check Path: `/`** → **Create Web Service**.

## Обновление после изменений кода
При включённом `autoDeploy: true` Render пересобирает сервис автоматически при каждом `git push` в ветку `qazconhub`.
Пушить изменения нужно так:
```
git push origin master:qazconhub
```

Если менялись `public/css/style.css` или `public/js/*.js`, поднимите версию кэша в
[`public/sw.js`](public/sw.js:1) — например, `qazconhub-cache-v3`. Статика отдаётся
service worker'ом по стратегии cache-first, поэтому у вернувшихся пользователей иначе
останется старая версия файлов до фонового обновления кэша.
