#!/bin/sh
set -e

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
