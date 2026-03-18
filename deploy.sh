#!/bin/bash
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────
# Set these environment variables before running, or export them in your shell.
# To look up current production values:
#   gcloud run services describe slawk --project ncvgl-gcp --region us-central1 \
#     --format='yaml(spec.template.spec.containers[0].env)'
#
# Required env vars:
#   GCP_PROJECT_ID   - GCP project ID (default: ncvgl-gcp)
#   DATABASE_URL     - Cloud SQL connection string (get from Cloud Run)
#   JWT_SECRET       - JWT signing secret (get from Cloud Run)
#   GCS_BUCKET_NAME  - GCS bucket for file uploads (default: slawk-uploads-<project>)
#   RUN_SEED         - "true" for first deploy, "false" after

GCP_PROJECT_ID="${GCP_PROJECT_ID:-ncvgl-gcp}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-slawk}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-${GCP_PROJECT_ID}:${REGION}:slawk-db}"

DATABASE_URL="${DATABASE_URL:?Set DATABASE_URL}"
JWT_SECRET="${JWT_SECRET:?Set JWT_SECRET}"
GCS_BUCKET_NAME="${GCS_BUCKET_NAME:-slawk-uploads-${GCP_PROJECT_ID}}"
VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY:?Set VAPID_PUBLIC_KEY}"
VAPID_PRIVATE_KEY="${VAPID_PRIVATE_KEY:?Set VAPID_PRIVATE_KEY}"
VAPID_SUBJECT="${VAPID_SUBJECT:-mailto:admin@slawk.dev}"
RUN_SEED="${RUN_SEED:-false}"

echo "Deploying ${SERVICE_NAME} to Cloud Run..."
echo "  Project:  ${GCP_PROJECT_ID}"
echo "  Region:   ${REGION}"
echo "  SQL:      ${CLOUD_SQL_INSTANCE}"
echo "  Bucket:   ${GCS_BUCKET_NAME}"
echo "  Seed:     ${RUN_SEED}"
echo ""

# ── Ensure GCS bucket exists and has correct permissions ─────────────
echo "Ensuring GCS bucket gs://${GCS_BUCKET_NAME} exists..."
if ! gcloud storage buckets describe "gs://${GCS_BUCKET_NAME}" --project "${GCP_PROJECT_ID}" &>/dev/null; then
  echo "  Creating bucket gs://${GCS_BUCKET_NAME}..."
  gcloud storage buckets create "gs://${GCS_BUCKET_NAME}" \
    --project "${GCP_PROJECT_ID}" \
    --location "${REGION}" \
    --uniform-bucket-level-access
else
  echo "  Bucket already exists."
fi

# Determine the Cloud Run service account (use compute default SA)
PROJECT_NUMBER=$(gcloud projects describe "${GCP_PROJECT_ID}" --format='value(projectNumber)')
SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo "  Granting storage access to ${SA_EMAIL}..."
gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET_NAME}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin" \
  --project "${GCP_PROJECT_ID}" 2>/dev/null || true

# Grant signBlob permission (required to generate GCS signed URLs)
echo "  Granting Service Account Token Creator role for signed URLs..."
gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --condition=None \
  --quiet 2>/dev/null || true
echo "  GCS bucket ready."
echo ""

# ── Clone main branch from GitHub ────────────────────────────────────
REPO_URL="https://github.com/ncvgl/slawk.git"
DEPLOY_DIR=$(mktemp -d)
echo "Cloning ${REPO_URL} (main) into ${DEPLOY_DIR}..."
git clone --depth 1 --branch main "${REPO_URL}" "${DEPLOY_DIR}"
echo ""

# ── Build and deploy (with Docker layer caching) ────────────────────
IMAGE="us-central1-docker.pkg.dev/${GCP_PROJECT_ID}/cloud-run-source-deploy/slawk"

gcloud builds submit "${DEPLOY_DIR}" \
  --config="${DEPLOY_DIR}/cloudbuild.yaml" \
  --project "${GCP_PROJECT_ID}" \
  --substitutions="_IMAGE=${IMAGE},_CLOUD_SQL=${CLOUD_SQL_INSTANCE},_DATABASE_URL=${DATABASE_URL},_JWT_SECRET=${JWT_SECRET},_GCS_BUCKET=${GCS_BUCKET_NAME},_VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY},_VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY},_VAPID_SUBJECT=${VAPID_SUBJECT},_RUN_SEED=${RUN_SEED}"

echo ""
echo "Deploy complete! Service URL:"
gcloud run services describe "${SERVICE_NAME}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${REGION}" \
  --format 'value(status.url)'

# Clean up
rm -rf "${DEPLOY_DIR}"
