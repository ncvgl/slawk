ARG BASE_IMAGE=us-central1-docker.pkg.dev/ncvgl-gcp/cloud-run-source-deploy/slawk-base:latest

# ── Stage 1: Build frontend (deps from base) ────────────────────────
FROM ${BASE_IMAGE} AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx vite build

# ── Stage 2: Build backend (deps from base) ─────────────────────────
FROM ${BASE_IMAGE} AS backend-build
WORKDIR /app/backend
COPY backend/ ./
RUN npx prisma generate
RUN npx tsc --noEmitOnError
RUN test -f dist/index.js

# ── Stage 3: Production image ────────────────────────────────────────
FROM node:22-alpine AS production
RUN apk add --no-cache openssl postgresql-client
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app

# Copy backend build output and dependencies
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/package.json ./
COPY --from=backend-build /app/backend/prisma ./prisma

# Copy frontend build output into public/ for static serving
COPY --from=frontend-build /app/frontend/dist ./public

# Copy entrypoint
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

RUN chown -R appuser:appgroup /app
USER appuser

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["./entrypoint.sh"]
