#!/bin/bash
set -euo pipefail

# Rebuild the base image (only needed when package.json or prisma schema changes)

GCP_PROJECT_ID="${GCP_PROJECT_ID:-ncvgl-gcp}"
IMAGE="us-central1-docker.pkg.dev/${GCP_PROJECT_ID}/cloud-run-source-deploy/slawk-base"
REPO_URL="https://github.com/ncvgl/slawk.git"

echo "Building base image..."
echo "  Image: ${IMAGE}:latest"
echo ""

# Clone from GitHub main (minimal context — only files Dockerfile.base needs)
CLONE_DIR=$(mktemp -d)
echo "Cloning ${REPO_URL} (main)..."
git clone --depth 1 --branch main "${REPO_URL}" "${CLONE_DIR}"

CONTEXT_DIR=$(mktemp -d)
cp "${CLONE_DIR}/Dockerfile.base" "${CONTEXT_DIR}/"
cp "${CLONE_DIR}/cloudbuild.base.yaml" "${CONTEXT_DIR}/"
mkdir -p "${CONTEXT_DIR}/frontend" "${CONTEXT_DIR}/backend/prisma"
cp "${CLONE_DIR}/frontend/package.json" "${CLONE_DIR}/frontend/package-lock.json" "${CONTEXT_DIR}/frontend/"
cp "${CLONE_DIR}/backend/package.json" "${CLONE_DIR}/backend/package-lock.json" "${CONTEXT_DIR}/backend/"
cp "${CLONE_DIR}/backend/prisma/schema.prisma" "${CONTEXT_DIR}/backend/prisma/"

gcloud builds submit "${CONTEXT_DIR}" \
  --project "${GCP_PROJECT_ID}" \
  --config "${CONTEXT_DIR}/cloudbuild.base.yaml" \
  --substitutions="_IMAGE=${IMAGE}"

rm -rf "${CLONE_DIR}" "${CONTEXT_DIR}"

echo ""
echo "Base image built and pushed: ${IMAGE}:latest"
