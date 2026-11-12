#!/usr/bin/env bash
# Lab 5, SDS sections 9 and 10: service accounts, least-privilege grants, and GitHub sign-in
# through Workload Identity Federation (no key file). These are security settings, so the
# project owner runs this script and reads it first. Safe to run again.
set -euo pipefail

PROJECT="${PROJECT:-cpe334-lab-equipment}"
REGION="${REGION:-asia-southeast1}"
INSTANCE="${INSTANCE:-cpe334-db}"
REPO="${REPO:-cpe334}"
GITHUB_REPO="${GITHUB_REPO:-ArmmyC/CPE334-Group}"
POOL="github"
PROVIDER="github-actions"

gcloud config set project "$PROJECT" --quiet
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"

sa() { echo "$1@$PROJECT.iam.gserviceaccount.com"; }
ensure_sa() {
  gcloud iam service-accounts describe "$(sa "$1")" >/dev/null 2>&1 ||
    gcloud iam service-accounts create "$1" --display-name "$2"
}

ensure_sa run-runtime "Cloud Run service (reads DATABASE_URL only)"
ensure_sa run-migrate "Cloud Run job (migrate and seed)"
ensure_sa github-deployer "GitHub Actions deploy"

secret_reader() { # secret, service account name
  gcloud secrets add-iam-policy-binding "$1" \
    --member "serviceAccount:$(sa "$2")" --role roles/secretmanager.secretAccessor --quiet >/dev/null
}
project_role() { # service account name, role
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member "serviceAccount:$(sa "$1")" --role "$2" --condition=None --quiet >/dev/null
}

# The service: DATABASE_URL and the Cloud SQL connector, nothing else.
secret_reader DATABASE_URL run-runtime
project_role run-runtime roles/cloudsql.client
# The migration job: the same, plus the seed passwords.
secret_reader DATABASE_URL run-migrate
secret_reader SEED_USER_PASSWORD run-migrate
secret_reader SMOKE_PASSWORD run-migrate
project_role run-migrate roles/cloudsql.client
# The deploy account: push images, update Cloud Run, read SMOKE_PASSWORD for the smoke step.
secret_reader SMOKE_PASSWORD github-deployer
project_role github-deployer roles/run.developer
gcloud artifacts repositories add-iam-policy-binding "$REPO" --location "$REGION" \
  --member "serviceAccount:$(sa github-deployer)" --role roles/artifactregistry.writer --quiet >/dev/null
for runner in run-runtime run-migrate; do
  gcloud iam service-accounts add-iam-policy-binding "$(sa "$runner")" \
    --member "serviceAccount:$(sa github-deployer)" --role roles/iam.serviceAccountUser --quiet >/dev/null
done

# GitHub Actions signs in without a key. A token is accepted only from this repository (by
# name and by numeric ID, so a renamed or recreated repository does not match), on main, from
# the deploy workflow on main, in a job that uses the demo environment. That means the demo
# approval cannot be skipped by a workflow file on another branch.
REPO_ID="${REPO_ID:-1444383581}"
OWNER_ID="${OWNER_ID:-186667389}"
CONDITION="assertion.repository == '$GITHUB_REPO'"
CONDITION="$CONDITION && assertion.repository_id == '$REPO_ID' && assertion.repository_owner_id == '$OWNER_ID'"
CONDITION="$CONDITION && assertion.ref == 'refs/heads/main'"
CONDITION="$CONDITION && assertion.sub == 'repo:$GITHUB_REPO:environment:demo'"
CONDITION="$CONDITION && assertion.job_workflow_ref == '$GITHUB_REPO/.github/workflows/deploy.yml@refs/heads/main'"
MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository"

gcloud iam workload-identity-pools describe "$POOL" --location global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location global --display-name "GitHub"
if gcloud iam workload-identity-pools providers describe "$PROVIDER"   --workload-identity-pool "$POOL" --location global >/dev/null 2>&1; then
  # Running again also tightens a provider that an earlier version of this script created.
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER"     --workload-identity-pool "$POOL" --location global     --attribute-mapping "$MAPPING" --attribute-condition "$CONDITION"
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER"     --workload-identity-pool "$POOL" --location global     --issuer-uri "https://token.actions.githubusercontent.com"     --attribute-mapping "$MAPPING" --attribute-condition "$CONDITION"
fi
gcloud iam service-accounts add-iam-policy-binding "$(sa github-deployer)"   --role roles/iam.workloadIdentityUser --quiet   --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$GITHUB_REPO" >/dev/null

echo
echo "Done. Set these as GitHub environment variables on the demo environment:"
echo "  GCP_PROJECT_ID=$PROJECT"
echo "  GCP_REGION=$REGION"
echo "  GCP_WIF_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
echo "  GCP_DEPLOY_SA=$(sa github-deployer)"
