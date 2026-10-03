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
4. **Blueprint Path** — оставьте `render.yaml`: манифест лежит в корне репозитория (файл спецификации Render должен называться именно `render.yaml`; путь вида `deploy/render.yaml` указывают только тогда, когда манифест лежит в подпапке).
5. В поле **Branch** выберите **`qazconhub`** — не `master`. Это обязательный шаг: Render читает [`render.yaml`](render.yaml:1) **именно из выбранной ветки**, а в `master` этого файла нет — отсюда и сообщение «No resources managed by this Blueprint».
6. Render прочитает манифест и покажет сервис **damu**: тип `web`, runtime `docker`, план `free`, регион `frankfurt`, health-check `/`, `autoDeploy: true`, ветка деплоя зафиксирована как `branch: qazconhub`.
7. Нажмите **Apply** / **Create Resources**.

## Шаг 3. Дождаться сборки
Первый билд занимает **3–6 минут** (компиляция `better-sqlite3`). В логах появится строка вида `Server started on 0.0.0.0:<PORT>` / `listening`.
После этого сервис доступен по адресу вида `https://<имя-сервиса>.onrender.com` — точный домен Render покажет в панели сервиса.

Действующий сервис, который уже обслуживает проект: **https://qazconhub-terminal.onrender.com**
(имя сервиса из [`render.yaml`](render.yaml:5) — `damu`; адрес `damu.onrender.com` заработает только после применения Blueprint/**Sync** или ручного переименования сервиса).

## Шаг 4. Проверка
- Откройте URL → откроется страница входа ([`index.html`](public/index.html:1)).
- Логин: **admin** / **admin123** (см. seed в [`server/db.js`](server/db.js:305)).

## Шаг 5. Убрать лишние ресурсы (только если сервисов действительно два)

⚠️ **Проверьте, что удаляете именно дубль.** Сейчас проект обслуживает сервис
**qazconhub-terminal** (`https://qazconhub-terminal.onrender.com`) — удалять его нельзя:
именно он собирается из ветки `qazconhub` и уже отдаёт текущую версию (`qazconhub-cache-v8`,
включая раздел «Прибытие ЖД»).

Если после применения Blueprint появился **второй** сервис (`damu`):
1. Дождитесь, пока новый сервис отвечает 200 и на нём видна свежая сборка.
2. Только тогда удалите ставший лишним сервис: **Settings → Delete Web Service**.
3. Пустой Blueprint-проект, который писал «No resources managed by this Blueprint» → **Settings → Delete Blueprint**.

Это важно на бесплатном тарифе: лимит — 750 инстанс-часов в месяц на аккаунт, два одновременно работающих сервиса расходуют его примерно вдвое быстрее.

Порядок важен: сначала проверьте новый сервис, и только потом удаляйте старый.

## Особенности бесплатного тарифа Render
- **Засыпание:** после 15 минут простоя сервис останавливается; первый запрос — «холодный старт» 30–60 секунд.
- **Эфемерная ФС:** постоянного диска нет. При каждом перезапуске БД пересоздаётся и заливаются seed-данные.
  - Восстанавливаются автоматически: пользователи, пути, спецтехника (см. `seed()` в [`server/db.js`](server/db.js:297)).
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

# Docker (имя образа после docker build -t <имя> — произвольное)
docker run -p 8080:8080 -e JWT_SECRET="$(openssl rand -hex 32)" damulogistics

# Render без Blueprint: Settings → Environment → Add Environment Variable
```

## Альтернатива: ручной деплой (без Blueprint)
**New +** → **Web Service** → выберите репозиторий → **Branch: `qazconhub`** →
**Runtime: Docker** → **Instance Type: Free** → **Health Check Path: `/`** → **Create Web Service**.

## Обновление после изменений кода

**Обычный путь (рекомендуемый):** сделать коммит и запушить в рабочую ветку `qazconhub`.
`autoDeploy: true` в [`render.yaml`](render.yaml:1) заставит Render пересобрать сервис автоматически.

```bash
git add -A && git commit -m "feat: ..."
git push origin HEAD:qazconhub      # в этой ветке upstream уже настроен, достаточно git push
```

Ветка в локальном репозитории называется `master`, но её upstream — `origin/qazconhub`
(ветка `master` на GitHub содержит другое, старое React/Supabase-приложение — туда пушить нельзя).

Если менялись `public/css/style.css` или `public/js/*.js`, поднимите версию кэша в
[`public/sw.js`](public/sw.js:1) (текущая — `qazconhub-cache-v8`). Статика отдаётся
service worker'ом по стратегии cache-first, поэтому у вернувшихся пользователей иначе
останется старая версия файлов до фонового обновления кэша.

**Если автодеплой выключен или нужно обновить прямо сейчас:** панель Render → сервис →
**Manual Deploy → Deploy latest commit → Deploy** (или **Clear build cache & deploy**, если
сборка кэширует старые слои).

## Если автодеплой не сработал
`autoDeploy` из [`render.yaml`](render.yaml:12) применяется при создании сервиса из Blueprint.
Для уже созданного сервиса проверьте настройки и подтвердите деплой вручную:

1. Панель Render → сервис (сейчас **qazconhub-terminal**) → **Settings → Build & Deploy**:
   **Auto-Deploy: Yes**, **Branch: `qazconhub`** (не `master` — там старое React/Supabase-приложение).
2. Затем **Manual Deploy → Deploy latest commit** и дождитесь завершения сборки в **Logs**.
3. Проверка, что прод подхватил изменения (подставьте адрес своего сервиса):

```bash
SITE=https://qazconhub-terminal.onrender.com
curl -s  $SITE/sw.js | grep CACHE_NAME              # ожидается qazconhub-cache-v8
curl -sI $SITE/js/dashboard-docs.js | head -1       # 200, а не 404
curl -sI $SITE/js/dashboard-rail.js | head -1       # 200 — раздел «Прибытие ЖД» в сборке
curl -s -o /dev/null -w '%{http_code}\n' $SITE/api/rail-arrivals   # 401 — новый API-роут жив (без токена так и должно быть)
curl -sI $SITE/js/dashboard.js | grep -i last-modified
```

Признаки устаревшей сборки: `/js/dashboard-rail.js` отдаёт **404**, `/api/rail-arrivals` —
**404** вместо `401`, а `last-modified` у `dashboard.js` старше даты последнего пуша.
Первый запрос после простоя — «холодный старт» 30–60 секунд: дайте сервису проснуться.

## Проверка прод-функционала после деплоя
- Вход: **admin / admin123** (seed-данные).
- Быстрый признак новой версии — разделы **«Завоз» / «Вывоз» / «Расходные накладные» / «Справочники» / «Прибытие ЖД»** в панели и доступный файл `/js/dashboard-rail.js`.
- В разделе **«Прибытие ЖД»** проверьте: плитки сводки за текущий месяц, внесение записи (номер вагона/контейнера, пломбы «по документу» и «факт»), подсветку расхождения пломб и выгрузку PDF за месяц.
- На бесплатном тарифе первый запрос после простоя — «холодный старт» 30–60 секунд, а БД при каждом перезапуске пересоздаётся (таблица `rail_arrivals` создаётся автоматически при старте).

## Переименование сервиса и смена адреса
Адрес `<имя>.onrender.com` определяется именем сервиса. В репозитории во [`render.yaml`](render.yaml:5) указано имя **`damu`**, но фактически работающий сервис называется **`qazconhub-terminal`** (адрес `https://qazconhub-terminal.onrender.com`) — он создавался вручную, поэтому имя из манифеста к нему не применилось.

1. **Через Blueprint:** имя задаётся в [`render.yaml`](render.yaml:5) — запушьте изменения в ветку `qazconhub` и нажмите **Sync** в Blueprint-проекте Render; Render приведёт сервис к новому имени и адресу.
2. **Вручную** (если сервис создан без Blueprint): **Settings → Service Name / Edit URL** → задать `damu`. Имя должно быть свободно среди всех сервисов Render.
3. Дождаться сборки и проверить новый адрес:

```bash
curl -s https://damu.onrender.com/sw.js | grep CACHE_NAME
```

Что учесть при смене адреса:
- старый адрес `qazconhub-terminal.onrender.com` перестаёт работать — автоматический редирект Render не настраивает;
- service worker, кэш и `localStorage` (в нём JWT) привязаны к origin: пользователям нужно открыть новый адрес, установить PWA заново и войти; данные в БД при этом сохраняются, если подключён постоянный диск;
- свой домен можно добавить отдельно: **Settings → Custom Domains → Add Custom Domain** (CNAME на `<имя>.onrender.com`) — тогда оба адреса работают параллельно.

## Если Blueprint пишет «No resources managed by this Blueprint»
Это означает, что Blueprint-проект не владеет работающим сервисом: либо сервис создан как обычный **Web Service**, либо Blueprint смотрит не на ту ветку. Порядок действий:

1. **Проверить ветку Blueprint:** Blueprint-проект → **Settings → Branch**. Должна быть `qazconhub`: в ветке `master` файла [`render.yaml`](render.yaml:1) нет, поэтому Render не находит ресурсов. Выберите `qazconhub` и нажмите **Sync** → **Apply**.
2. **Посмотреть события проекта** после Sync: там будет причина (ошибка разбора [`render.yaml`](render.yaml:1), занятое имя сервиса и т. п.).
3. **Если ресурсы не создаются** — Blueprint не умеет «подхватывать» уже существующие сервисы. Переименуйте работающий сервис вручную (см. раздел выше) и удалите пустой Blueprint-проект: **Settings → Delete Blueprint**.
4. **Если нужен именно Blueprint как источник истины** — после Sync Render создаст **новый** сервис `damu`, а работающий `qazconhub-terminal` останется отдельным ресурсом: сначала убедитесь, что новый сервис отвечает и отдаёт свежую сборку, и только потом удалите лишний (**Settings → Delete Web Service**). Пока новый сервис не проверен, `qazconhub-terminal` удалять нельзя — он обслуживает прод. На free-тарифе лимит — 750 инстанс-часов в месяц на аккаунт, два работающих сервиса расходуют его вдвое быстрее.

Признак того, что сервис управляется Blueprint: в его карточке есть пометка **Managed by Blueprint**, а настройки совпадают с [`render.yaml`](render.yaml:1).

## Репозиторий не виден в списке при создании Blueprint
Сам репозиторий доступен: `https://github.com/gafuradm/delivery-pwa-kz` — публичный, ветка по умолчанию `master`. Значит дело не в репозитории, а в доступе GitHub App **Render** к аккаунту-владельцу.

Проверьте по порядку:
1. **Какой GitHub-аккаунт подключён к Render:** Dashboard → **Account Settings → GitHub**. Если подключён другой аккаунт — **Disconnect**, затем **Connect** и авторизуйтесь под владельцем репозитория.
2. **Доступ GitHub App к репозиторию:** https://github.com/settings/installations → **Render** → **Configure** → **Repository access** → **All repositories** или **Only select repositories** → добавить `delivery-pwa-kz` → **Save**. Если установки Render в аккаунте нет, её создаст шаг 1 — при установке сразу отметьте нужные репозитории.
3. **Обновить список в Render:** в диалоге создания сервиса нажмите **Configure account** / обновите страницу — список репозиториев подтягивается из GitHub не мгновенно.
4. **Репозиторий в организации:** https://github.com/organizations/<org>/settings/installations → **Render** → **Configure** → добавить репозиторий. Нужны права владельца организации, а при включённых ограничениях — одобрение в **Organization settings → Third-party Access**.
5. **Обходной путь без GitHub App** (репозиторий публичный): **New + → Web Service → Public Git repository** → URL `https://github.com/gafuradm/delivery-pwa-kz`, ветка `qazconhub`, runtime **Docker**, имя `damu`, план `free`, регион `frankfurt`, health check `/`, переменные `NODE_ENV=production` и `JWT_SECRET` (сгенерировать). Такой сервис не управляется [`render.yaml`](render.yaml:1), и авто-деплой по пушу для него недоступен — обновления запускаются вручную (**Manual Deploy**) или через **Deploy Hook** из CI.

Проверка доступа к ветке: даже при подключённом репозитории Blueprint читает манифест из **выбранной** ветки, поэтому в списке веток нужно указать `qazconhub` — в `master` файла [`render.yaml`](render.yaml:1) нет.

## «A Blueprint file was found, but there was an issue»
Значит манифест найден и разобран, но ресурс создать нельзя. Самая частая причина — **имя сервиса уже занято в аккаунте**: `name:` из манифеста должно быть уникальным, при этом URL-субдомен может оставаться свободным (проверка: `curl -o /dev/null -w '%{http_code}' https://damu.onrender.com/` → `404` означает, что субдомен свободен).

Варианты решения:
1. **Освободить имя:** занятый сервис → **Settings → Name/URL** → переименовать, например, в `damu-legacy`, затем **Sync**/**Apply** в Blueprint-проекте. После проверки нового сервиса старый удалить (**Settings → Delete Web Service**).
2. **Взять другое имя:** изменить `name:` в [`render.yaml`](render.yaml:5), запушить в `qazconhub`, нажать **Sync** в Blueprint-проекте.
3. **Отказаться от Blueprint** (быстрее и без простоя): оставить работающий сервис `qazconhub-terminal` (при желании задать ему в **Settings** имя `damu`) и включить **Auto-Deploy: Yes** с веткой `qazconhub` → **Manual Deploy → Deploy latest commit**. Результат тот же (авто-деплой по пушу), но сервис не пересоздаётся. Сам Blueprint-проект с ошибкой удалить: **Settings → Delete Blueprint**.
4. **Проверить лимиты воркспейса:** Dashboard → **Billing** → **Build Pipeline Minutes** и **Spend limit**. На бесплатном тарифе воркспейсу отводится ограниченное число минут сборки в месяц; когда они израсходованы (и не добавлен способ оплаты или достигнут лимит расходов), Render **отключает все новые сборки** до конца месяца — в этом случае Blueprint не сможет создать сервис, хотя манифест корректен.
5. **Название Blueprint-проекта ни при чём:** конфликт вызывает поле `name:` из манифеста. Смена названия проекта не освобождает имя ресурса — нужно переименовать или удалить сам **сервис**.

Проверить манифест локально, до обращения к панели, можно валидатором по официальной схеме Render:
```bash
python3 -m venv /tmp/rv && /tmp/rv/bin/pip install --quiet jsonschema pyyaml
curl -s https://render.com/schema/render.yaml.json -o /tmp/render-schema.json
/tmp/rv/bin/python -c "import json,yaml;from jsonschema import Draft202012Validator as V;d=json.load(open('/tmp/render-schema.json'));print('ошибок валидации:',len(list(V(d).iter_errors(yaml.safe_load(open('render.yaml'))))))"
```
Ответ `ошибок валидации: 0` означает, что дело не в файле, а в состоянии аккаунта (занятое имя сервиса, лимиты сборки — см. пункты выше).

Проверка, какой адрес реально обслуживается (на момент последней проверки: `qazconhub-terminal` — 200,
`damu` — не отвечает, `damulogistics` — 404/свободен):
```bash
curl -s -o /dev/null -w 'qazconhub-terminal: %{http_code}\n' https://qazconhub-terminal.onrender.com/
curl -s -o /dev/null -w 'damu:               %{http_code}\n' https://damu.onrender.com/
```
