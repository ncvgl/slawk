#!/bin/sh
set -e

echo "Waiting for database to be ready..."
until npx prisma migrate status > /dev/null 2>&1; do
  echo "Database not ready, retrying in 2s..."
  sleep 2
done
echo "Database is ready."

echo "Running database migrations..."
npx prisma migrate deploy

if [ "$RUN_SEED" = "true" ]; then
  echo "Seeding database..."
  npx tsx prisma/seed.ts
fi

echo "Starting server..."
mkdir -p /app/uploads/avatars /app/uploads/files
exec node dist/index.js
