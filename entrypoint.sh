#!/bin/sh
set -e

if [ -n "$K_SERVICE" ]; then
  # Cloud Run: wait for Cloud SQL proxy socket
  SOCKET_DIR=$(echo "$DATABASE_URL" | sed 's/.*host=\(\/cloudsql\/[^&]*\).*/\1/')
  echo "Waiting for Cloud SQL proxy at ${SOCKET_DIR}..."
  for i in $(seq 1 30); do
    if [ -S "${SOCKET_DIR}/.s.PGSQL.5432" ]; then
      echo "Cloud SQL proxy is ready."
      break
    fi
    sleep 1
  done
else
  # Docker Compose: wait for Postgres via TCP
  echo "Waiting for database to be ready..."
  i=0
  until pg_isready -h db -p 5432 -U postgres > /dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge 30 ]; then
      echo "Database did not become ready in time. Exiting."
      exit 1
    fi
    echo "Database not ready, retrying in 2s... ($i/30)"
    sleep 2
  done
  echo "Database is ready."
fi

echo "Running database migrations..."
timeout 60 npx prisma migrate deploy || {
  echo "Migration failed or timed out, checking status..."
  npx prisma migrate status
  exit 1
}

if [ "$RUN_SEED" = "true" ]; then
  echo "Seeding database..."
  npx tsx prisma/seed.ts
fi

echo "Starting server..."
mkdir -p /app/uploads/avatars /app/uploads/files
exec node dist/index.js
