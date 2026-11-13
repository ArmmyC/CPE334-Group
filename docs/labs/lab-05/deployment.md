# Deployment (Lab 5)

How the Equipment Lending app is built, configured, deployed, and released. The design is in [SDS section 10](../../system-sds.md). This page records what actually exists and where it differs from the reference setup.

## Stack

| Part | Choice |
| --- | --- |
| App | One Node 24 image holding the Express API and the built React app (`Dockerfile`, multi-stage, non-root, listens on `PORT`) |
| Database | Cloud SQL for PostgreSQL 16, smallest tier, zonal, no backups, storage auto-increase off |
| Hosting | Cloud Run service `cpe334-app` (min 0, max 3 instances, 1 CPU, 512 Mi) |
| Migrations | Cloud Run job `cpe334-migrate`: `prisma migrate deploy`, then the seed, before the new revision starts |
| Images | Artifact Registry repository `cpe334`, tagged with the full commit SHA, deployed by digest |
| Secrets | Secret Manager: `DATABASE_URL`, `SEED_USER_PASSWORD`, `SMOKE_PASSWORD` |
| Pipeline | GitHub Actions: `ci.yml` on every pull request, `deploy.yml` on a merge into `main` |
| Sign-in to GCP | Workload Identity Federation, no key file anywhere |

## GCP names

| Item | Value |
| --- | --- |
| Project | `cpe334-lab-equipment` |
| Region | `asia-southeast1` |
| Cloud SQL instance, database, user | `cpe334-db`, `cpe334_group`, `app` |
| Cloud Run service and job | `cpe334-app`, `cpe334-migrate` |
| Service accounts | `run-runtime` (service), `run-migrate` (job), `github-deployer` (GitHub Actions) |
| Workload Identity pool and provider | `github`, `github-actions` |
| GitHub environment | `demo` (its required reviewers are the manual approval) |

The resources come from `infra/gcp/01-resources.sh` (billable and stateful parts) and `infra/gcp/02-ci-identity.sh` (service accounts, grants, GitHub sign-in). Both are safe to run again and are run by the project owner in Cloud Shell.

## Environment variables

| Variable | Purpose | Secret | Where the value comes from |
| --- | --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection for the API, migrations, and seed. Carries `connection_limit=5`. | Yes | Local: `.env` and `.env.test`. Cloud: Secret Manager `DATABASE_URL`, read by the service and the job. |
| `APP_ORIGIN` | Origins the API accepts for state-changing requests. The API will not start without it. | No | Local: `.env`. Cloud: set by the deploy step to `https://cpe334-app-<project number>.asia-southeast1.run.app`, which Cloud Run fixes from the service name, project number, and region. |
| `PORT` | Port the API listens on | No | Local: `.env` (4100). Cloud: set by Cloud Run (8080 in the image). |
| `NODE_ENV` | Secure cookie and log format | No | `production` in the image. Unset locally. |
| `CLIENT_DIR` | Folder with the built client, only if it is not the default | No | Unset everywhere. |
| `SEED_USER_PASSWORD` | Password of every seeded account (at least 12 characters) | Yes | Local: `.env`. Cloud: Secret Manager, read by the job only. |
| `SMOKE_EMAIL` | Dedicated smoke borrower | No | Plain variable on the job and in the deploy workflow. |
| `SMOKE_PASSWORD` | Smoke borrower password | Yes | Secret Manager, read by the job and by the smoke step. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Local Docker Compose database only | Yes (password) | `.env` and `.env.test`. Not used in the cloud. |
| `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA` | Tell the deploy workflow where to deploy and how to sign in | No | GitHub environment variables on `demo` (printed by `02-ci-identity.sh`). |

No real secret is committed. Only `.env.example` and `.env.test.example` with placeholders are in Git.

## Commands

From a fresh clone (details in the README):

```bash
npm ci
cp .env.example .env            # replace the placeholders
npm run db:setup                # start the dev database, migrate, seed
npm run dev                     # API and client
npm run build                   # shared, server, client
npm test                        # unit and integration tests
npm run test:e2e                # Playwright, needs .env.test
docker build -t cpe334-group .  # the image that is deployed
```

Migrate and seed with the same image the service runs:

```bash
docker run --rm -e DATABASE_URL cpe334-group node node_modules/prisma/build/index.js migrate deploy --schema server/prisma/schema.prisma
docker run --rm -e DATABASE_URL -e SEED_USER_PASSWORD cpe334-group node server/dist/seed-cli.js
```

In the cloud the job `cpe334-migrate` runs the same two commands, with the secrets above, before every new revision.

## Release procedure

Only a reviewed release reaches `main`, and only `main` deploys (plan section 2, R-09).

1. Feature and fix pull requests go into the sprint staging branch (`sprint-1`, `sprint-2`, `sprint-3`). CI (lint, format check, build, tests, end-to-end tests, Docker build) must pass, and the teammate reviews and merges. Authors do not approve or merge their own pull requests.
2. A release pull request moves the staging branch into `main`. The member who did not write it reviews it. Its description lists what is merged and the recorded build and test results.
3. The release commit on `main` gets a version tag (`v0.1.0`, `v0.2.0-rc.1`, and so on, as plan section 2 lists them). The tag is pushed to GitHub.
4. The merge into `main` starts `deploy.yml`, which waits on the `demo` environment. A required reviewer approves the run. The workflow then builds the image tagged with the commit SHA, pushes it, runs the migration job, deploys the service by image digest, and runs `infra/smoke.sh` against the public URL. Only one deploy runs at a time and a running one is never cancelled.
5. The run summary lists the commit, the image digest, and the URL.

Find the commit that is running, and the release tag that names it:

```bash
sha=$(gcloud run services describe cpe334-app --region asia-southeast1 --project cpe334-lab-equipment \
  --format='value(metadata.labels.git-sha)')
echo "$sha"
git fetch --tags && git tag --points-at "$sha"
```

The label holds the full commit SHA of the deployed image, and the tag printed next to it is the release (for example `v0.2.0-rc.1`). The image tag in Artifact Registry is the same SHA, and `infra/smoke.sh` can be run by hand against any instance.

Roll back by redeploying the image of an earlier release. Set the `git-sha` label in the same command, or the command above would keep naming the commit that was rolled back:

```bash
old=<full commit sha of the earlier release>
image=asia-southeast1-docker.pkg.dev/cpe334-lab-equipment/cpe334/app
digest=$image@$(gcloud artifacts docker images describe "$image:$old" --project cpe334-lab-equipment \
  --format='value(image_summary.digest)')
gcloud run deploy cpe334-app --project cpe334-lab-equipment --region asia-southeast1 \
  --image "$digest" --update-labels "git-sha=$old"
```

Migrations are additive within a sprint, so an older image still works with the current database.

`infra/gcp/03-manual-deploy.sh` does the same build, migrate, and deploy by hand in Cloud Shell. It stops unless the folder is clean and at `origin/main`, so the SHA label stays true.

## First deploy

- Set the four variables and the required reviewers on the `demo` environment.
- After the first deploy creates the service, open it to the public once. The deploy account may not change IAM, on purpose:

```bash
gcloud run services add-iam-policy-binding cpe334-app --region asia-southeast1 --member allUsers --role roles/run.invoker
```

- `01-resources.sh` does not replace a `DATABASE_URL` secret made by an older run. If that secret has no `connection_limit=5`, add a new version that does.

## Differences from the reference setup

| Reference | Here | Why |
| --- | --- | --- |
| The deployer account reads no secret | `github-deployer` reads `SMOKE_PASSWORD` | The smoke step logs in as the smoke borrower. The value is masked in the log, and the account has no other secret. |
| The service URL is read after the first deploy | `APP_ORIGIN` is built from the service name, project number, and region | A Cloud Run URL is fixed by those three values, so the very first revision already has the right origin. |
| One way to build the image | The workflow builds on the runner. The manual script builds with Cloud Build. | Cloud Shell cannot always push through its Docker proxy. |
| Public access set by the pipeline | One IAM command run once by the owner | The deploy account cannot change IAM, so a stolen deploy token cannot open or close the service. |

GitHub sign-in is limited to this repository (by name and by ID), the `main` branch, the `deploy.yml` workflow on `main`, and the `demo` environment. A workflow file on another branch cannot deploy, and the approval cannot be skipped.

## Cost and teardown

A budget alert is set on the billing account before any resource exists. After the course ends, delete the Cloud SQL instance, the Cloud Run service and job, the Artifact Registry repository, and the project.
