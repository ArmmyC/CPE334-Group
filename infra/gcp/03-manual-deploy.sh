#!/usr/bin/env bash
# Lab 5: the same steps as .github/workflows/deploy.yml, run by hand from Cloud Shell as the
# project owner. Use it to try the deploy before the workflow can run, or as a fallback.
# It does not make the service public: that is one separate IAM command (see README).
set -euo pipefail

PROJECT="${PROJECT:-cpe334-lab-equipment}"
REGION="${REGION:-asia-southeast1}"
SERVICE=cpe334-app
JOB=cpe334-migrate
SMOKE_EMAIL="${SMOKE_EMAIL:-smoke.borrower@example.com}"

# The image is labelled with the commit SHA, so the folder must be exactly main: no local
# changes and no other branch, or the SHA would not describe the code that runs (R-08).
git fetch -q origin main
if [ -n "$(git status --porcelain)" ]; then
  echo "Stop: the working folder has uncommitted changes." >&2
  exit 1
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "Stop: HEAD is not origin/main. Run: git checkout main && git pull" >&2
  exit 1
fi
SHA="$(git rev-parse HEAD)"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/cpe334/app"
CONNECTION="$PROJECT:$REGION:cpe334-db"
NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
APP_ORIGIN="https://$SERVICE-$NUMBER.$REGION.run.app"

# Cloud Shell cannot always push to Artifact Registry over its Docker proxy, so Cloud Build
# builds and pushes the image from this folder instead.
gcloud services enable cloudbuild.googleapis.com --project "$PROJECT"
gcloud builds submit --project "$PROJECT" --region "$REGION" --tag "$IMAGE:$SHA" .
DIGEST="$IMAGE@$(gcloud artifacts docker images describe "$IMAGE:$SHA" --project "$PROJECT" --format='value(image_summary.digest)')"
echo "Image: $DIGEST"

gcloud run jobs deploy "$JOB" --project "$PROJECT" --region "$REGION" --image "$DIGEST" \
  --service-account "run-migrate@$PROJECT.iam.gserviceaccount.com" \
  --set-cloudsql-instances "$CONNECTION" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,SEED_USER_PASSWORD=SEED_USER_PASSWORD:latest,SMOKE_PASSWORD=SMOKE_PASSWORD:latest" \
  --set-env-vars "SMOKE_EMAIL=$SMOKE_EMAIL" --update-labels "git-sha=$SHA" \
  --command sh \
  --args=-c,"node node_modules/prisma/build/index.js migrate deploy --schema server/prisma/schema.prisma && node server/dist/seed-cli.js" \
  --max-retries 0 --task-timeout 600s --quiet
gcloud run jobs execute "$JOB" --project "$PROJECT" --region "$REGION" --wait

gcloud run deploy "$SERVICE" --project "$PROJECT" --region "$REGION" --image "$DIGEST" \
  --service-account "run-runtime@$PROJECT.iam.gserviceaccount.com" \
  --set-cloudsql-instances "$CONNECTION" --set-secrets "DATABASE_URL=DATABASE_URL:latest" \
  --set-env-vars "APP_ORIGIN=$APP_ORIGIN" --update-labels "git-sha=$SHA" \
  --port 8080 --min-instances 0 --max-instances 3 --cpu 1 --memory 512Mi --quiet

echo "Deployed $SHA at $APP_ORIGIN"
echo "Public access is off. To open it, run the add-iam-policy-binding command from the README,"
echo "then: SMOKE_PASSWORD=\$(gcloud secrets versions access latest --secret SMOKE_PASSWORD) BASE_URL=$APP_ORIGIN SMOKE_EMAIL=$SMOKE_EMAIL infra/smoke.sh"
