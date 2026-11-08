#!/usr/bin/env bash
# Lab 5, SDS section 10: the billable and stateful GCP resources.
# Run it in Cloud Shell, signed in as the project owner. Safe to run again: it never
# replaces an existing instance, user, or secret. Secret values are generated here and are
# never printed.
set -euo pipefail

PROJECT="${PROJECT:-cpe334-lab-equipment}"
REGION="${REGION:-asia-southeast1}"
INSTANCE="${INSTANCE:-cpe334-db}"
REPO="${REPO:-cpe334}"
DB_NAME="cpe334_group"
DB_USER="app"

gcloud config set project "$PROJECT" --quiet

if [ "$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)')" != "True" ]; then
  echo "Billing is not linked to $PROJECT. Link it in the console, then run this again." >&2
  exit 1
fi

echo "== APIs"
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  cloudresourcemanager.googleapis.com

echo "== Artifact Registry"
gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$REPO" \
    --repository-format docker --location "$REGION" \
    --description "CPE334 group project images"

echo "== Cloud SQL (smallest tier, no storage auto-increase, no backups)"
if ! gcloud sql instances describe "$INSTANCE" >/dev/null 2>&1; then
  gcloud sql instances create "$INSTANCE" \
    --database-version POSTGRES_16 \
    --edition ENTERPRISE \
    --tier db-f1-micro \
    --region "$REGION" \
    --availability-type zonal \
    --storage-type SSD \
    --storage-size 10 \
    --no-storage-auto-increase \
    --no-backup
fi
gcloud sql databases describe "$DB_NAME" --instance "$INSTANCE" >/dev/null 2>&1 ||
  gcloud sql databases create "$DB_NAME" --instance "$INSTANCE"

echo "== Secrets"
make_secret() { # name, value from stdin
  gcloud secrets describe "$1" >/dev/null 2>&1 ||
    gcloud secrets create "$1" --replication-policy automatic --data-file=-
}
CONNECTION="$(gcloud sql instances describe "$INSTANCE" --format='value(connectionName)')"
if ! gcloud secrets describe DATABASE_URL >/dev/null 2>&1; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  if gcloud sql users list --instance "$INSTANCE" --format='value(name)' | grep -qx "$DB_USER"; then
    gcloud sql users set-password "$DB_USER" --instance "$INSTANCE" --password "$DB_PASSWORD"
  else
    gcloud sql users create "$DB_USER" --instance "$INSTANCE" --password "$DB_PASSWORD"
  fi
  printf '%s' "postgresql://$DB_USER:$DB_PASSWORD@localhost/$DB_NAME?host=/cloudsql/$CONNECTION&schema=public" |
    make_secret DATABASE_URL
  unset DB_PASSWORD
fi
openssl rand -hex 16 | tr -d '\n' | make_secret SEED_USER_PASSWORD
openssl rand -hex 16 | tr -d '\n' | make_secret SMOKE_PASSWORD

echo
echo "Done. Connection name: $CONNECTION"
gcloud secrets list --format='table(name)'
