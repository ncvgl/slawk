---
name: deploy-slawk
description: Deploy Slawk to GCP. Use when the user says "deploy", "/deploy", or asks to deploy the application.
---

# Deploy Slawk to GCP

## Prerequisites Check

Before anything, verify the user has the tools installed:

```bash
gcloud --version
```

If `gcloud` is not installed, tell the user to install it: https://cloud.google.com/sdk/docs/install

Check authentication:

```bash
gcloud auth list --filter=status:ACTIVE --format="value(account)"
```

If not authenticated, run `gcloud auth login`.

## Step 0: Detect Existing Deployment

Check if the `slawk` service already exists on Cloud Run:

```bash
gcloud run services list --format="table(name,region)" --filter="metadata.name=slawk" 2>/dev/null
```

- **If the service exists** → this is a **redeploy**. Go to the [Redeploy Flow](#redeploy-flow).
- **If the service does not exist** → this is a **first deploy**. Go to [First Deploy Flow](#first-deploy-flow).

---

## Redeploy Flow

For redeployments, all infrastructure (Cloud SQL, APIs, IAM, Artifact Registry) is already set up. The only steps are: push code, pull existing config, and deploy.

### 1. Get existing config

Resolve the project and region, then pull env vars from the running service:

```bash
# Get the active GCP project
gcloud config get-value project

# Get the region from the service listing
gcloud run services list --filter="metadata.name=slawk" --format="value(region)"

# Get all env vars from the running service
gcloud run services describe slawk --project=PROJECT_ID --region=REGION \
  --format='yaml(spec.template.spec.containers[0].env)'
```

Extract: `DATABASE_URL`, `JWT_SECRET`, `GCS_BUCKET_NAME`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` from the output. No need to ask the user for any of these.

### 2. Push unpushed commits

The `deploy.sh` script clones from the `main` branch on GitHub. Check for unpushed commits:

```bash
git log origin/main..HEAD --oneline
```

If there are unpushed commits, ask the user for confirmation before pushing, then push:

```bash
git push origin main
```

### 3. Deploy

Run `deploy.sh` with `RUN_SEED=false` and all env vars pulled from the existing service:

```bash
export GCP_PROJECT_ID=PROJECT_ID
export REGION=REGION
export DATABASE_URL="<from existing service>"
export JWT_SECRET="<from existing service>"
export GCS_BUCKET_NAME="<from existing service>"
export VAPID_PUBLIC_KEY="<from existing service>"
export VAPID_PRIVATE_KEY="<from existing service>"
export VAPID_SUBJECT="<from existing service>"
export RUN_SEED=false

bash deploy.sh
```

Use a 10-minute timeout for the build command.

### 4. Verify

```bash
gcloud run services describe slawk --project=PROJECT_ID --region=REGION --format='value(status.url)'
```

Report the URL to the user.

---

## First Deploy Flow

### Step 1: Project Setup

Ask the user which GCP project to use, or create a new one. Default project name: `slawk`.

```bash
# Check if project exists
gcloud projects describe PROJECT_ID 2>/dev/null

# Or create one
gcloud projects create PROJECT_ID --name="slawk"
gcloud config set project PROJECT_ID
```

Link a billing account (required for Cloud SQL and Cloud Run):

```bash
gcloud billing accounts list
gcloud billing projects link PROJECT_ID --billing-account=BILLING_ACCOUNT_ID
```

Ask the user which region to deploy to (default: `us-central1`).

### Step 2: Enable APIs

```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  --project=PROJECT_ID
```

### Step 3: Create Artifact Registry Repository

```bash
gcloud artifacts repositories create cloud-run-source-deploy \
  --repository-format=docker \
  --location=REGION \
  --project=PROJECT_ID 2>/dev/null || true
```

### Step 4: Build the Base Image

The base image caches npm dependencies for faster builds. This only needs to run once (or when dependencies change).

```bash
chmod +x build-base.sh
GCP_PROJECT_ID=PROJECT_ID REGION=REGION bash build-base.sh
```

If `build-base.sh` or the `Dockerfile` ARG `BASE_IMAGE` reference a hardcoded project/region, update them to match the user's chosen project and region.

### Step 5: Create Cloud SQL Instance

```bash
# Create a PostgreSQL 15 instance (takes 5-10 minutes)
gcloud sql instances create slawk-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=REGION \
  --project=PROJECT_ID \
  --storage-size=10GB \
  --storage-auto-increase

# Generate and set a secure postgres password
POSTGRES_PASSWORD=$(openssl rand -base64 24)
gcloud sql users set-password postgres \
  --instance=slawk-db \
  --password=$POSTGRES_PASSWORD \
  --project=PROJECT_ID

# Create the database
gcloud sql databases create slackclone \
  --instance=slawk-db \
  --project=PROJECT_ID
```

The Cloud SQL connection name is: `PROJECT_ID:REGION:slawk-db`

### Step 6: Grant Cloud Build Permissions

```bash
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin" --quiet

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" --quiet
```

### Step 7: Push code and deploy

Make sure all commits are pushed to `main` on GitHub (deploy.sh clones from there).

```bash
export GCP_PROJECT_ID=PROJECT_ID
export REGION=REGION
export DATABASE_URL="postgresql://postgres:PASSWORD@localhost/slackclone?host=/cloudsql/PROJECT_ID:REGION:slawk-db"
export JWT_SECRET=$(openssl rand -hex 32)
export GCS_BUCKET_NAME=slawk-uploads-PROJECT_ID
export VAPID_PUBLIC_KEY=<generated>
export VAPID_PRIVATE_KEY=<generated>
export VAPID_SUBJECT=mailto:admin@slawk.dev
export RUN_SEED=true

chmod +x deploy.sh
bash deploy.sh
```

Generate VAPID keys with `npx web-push generate-vapid-keys` if not already available.

Set `RUN_SEED=true` on first deploy to populate the database with demo data.

### Step 8: Verify

```bash
gcloud run services describe slawk --project=PROJECT_ID --region=REGION --format='value(status.url)'
```

Open the URL in a browser and verify it loads.

---

## Important Notes

- The `deploy.sh` script clones from the `main` branch on GitHub — always push before deploying.
- Cloud SQL instance creation takes 5-10 minutes on first deploy. Be patient.
- The JWT_SECRET should be consistent across deploys. Changing it invalidates all existing sessions.
- Never set `RUN_SEED=true` on a redeploy — it will re-seed the production database.
- Use a 10-minute timeout for the Cloud Build step.
