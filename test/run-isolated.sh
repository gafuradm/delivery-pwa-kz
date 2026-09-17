#!/bin/sh
# Изолированный прогон автотестов API: поднимаем отдельный сервер на временной БД в /tmp,
# прогоняем test/api-test.js, гасим сервер и удаляем БД. Рабочая база не затрагивается.
#
#   npm test                      # этот скрипт
#   TEST_PORT=8110 npm test        # свой стартовый порт
#
# Тестовые записи (контейнеры TEST*, вагоны WAG*, документы и т.п.) остаются только
# во временном файле БД, который удаляется по завершении.

cd "$(dirname "$0")/.." || exit 1

PORT="${TEST_PORT:-8099}"
DB="/tmp/qazconhub-test-$$.db"
LOG="/tmp/qazconhub-test-$$.log"

while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

rm -f "$DB" "$DB-wal" "$DB-shm"
DB_PATH="$DB" PORT="$PORT" node server/server.js >"$LOG" 2>&1 &
PID=$!

cleanup() {
  kill "$PID" 2>/dev/null
  wait "$PID" 2>/dev/null
  rm -f "$DB" "$DB-wal" "$DB-shm"
}
trap cleanup EXIT INT TERM

# Ждём готовности сервера (401 от /api/stats — тоже признак, что он поднялся).
i=0
while [ "$i" -lt 60 ]; do
  if curl -s -o /dev/null "http://localhost:$PORT/api/stats"; then break; fi
  i=$((i + 1))
  sleep 0.25
done

if [ "$i" -ge 60 ]; then
  echo "❌ Не удалось поднять тестовый сервер на порту $PORT. Лог: $LOG"
  exit 2
fi

echo "Изолированный прогон: http://localhost:$PORT (БД $DB)"
BASE_URL="http://localhost:$PORT" node test/api-test.js
STATUS=$?

exit "$STATUS"
