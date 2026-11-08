# CPE334 Group Project: Lab Equipment Borrowing System

CPE 334 Semester 1/2026 group project, Theme 2: Inventory and Borrowing.

The CPE department lends lab equipment (laptops, development boards, oscilloscopes, cameras) to students. Borrowers request available copies, and custodians record checkout, return, and overdue status.

## Team

| GitHub   | Role in this repository |
| -------- | ----------------------- |
| @ArmmyC  | Developer and reviewer  |
| @Bank848 | Developer and reviewer  |

Both students share requirements, design, testing, implementation, review, deployment, and maintenance work.

## Status

Sprint 1 in progress. The scaffold, the data model, the seed data, and sign-in (F-01) are in place. Seeded users log in, see their name and role, and log out. The login page also reports whether the API and the database are reachable. Domain features are added by their own Issues and contracts.

## Stack

- UI: React, Vite, React Router, Bootstrap (`client/`)
- API: Node.js, Express 5, helmet, Zod validation (`server/`)
- Shared request and response schemas: Zod (`shared/`)
- Database: PostgreSQL 16 with Prisma
- Tests: Vitest and Supertest (server), Vitest and Testing Library (client), Playwright (end to end)
- Quality: ESLint, Prettier, Vitest coverage
- Delivery: Docker, GitHub Actions, GCP (from Lab 5)

## Prerequisites

- Node.js 24 and npm 11 (`.nvmrc` pins Node 24, and `engines` in `package.json` states both)
- Docker Desktop, or Docker Engine inside WSL 2, or any PostgreSQL 16 server you can point `DATABASE_URL` at

## Setup

From a fresh clone to the running app with seed data:

```bash
npm ci
cp .env.example .env
npm run db:setup
npm run dev
```

`npm ci` installs the exact versions in `package-lock.json`, builds `shared/`, and generates the Prisma client. Before `npm run db:setup`, replace the placeholders in `.env`. The user, password, and database name in `DATABASE_URL` must match `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`, and `SEED_USER_PASSWORD` must be at least 12 characters. It is the password of every seeded account. `APP_ORIGIN` lists the origins the web app runs on, and the example value works for `npm run dev`. The API does not start without it.

`npm run db:setup` starts the development database on host port 5435, applies the migrations, and loads the seed data. It is safe to run again: the seed only adds missing rows and never changes existing ones, apart from the optional smoke account's password.

To run the server tests, also create the test database on host port 5436:

```bash
cp .env.test.example .env.test
npm run db:test:up
```

Replace the placeholders in `.env.test` the same way, and keep its `APP_ORIGIN` for the E2E tests. The tests apply the migrations to the test database themselves.

## Docker image and CI

`docker build -t cpe334-group .` builds one image that holds the API and the built web app. It listens on `PORT` (8080 by default) and runs as a non-root user. The image needs `DATABASE_URL` and `APP_ORIGIN`. Run the migration and the seed with the same image before the first start:

```bash
docker run --rm -e DATABASE_URL cpe334-group node node_modules/prisma/build/index.js migrate deploy --schema server/prisma/schema.prisma
docker run --rm -e DATABASE_URL -e SEED_USER_PASSWORD cpe334-group node server/dist/seed-cli.js
```

`GET /api/health` says the database answers, and `GET /api/ready` also says every migration is applied.

GitHub Actions (`.github/workflows/ci.yml`) runs lint, format check, build, tests, end-to-end tests, and the image check on every pull request into `main` and `sprint-*` branches. The design is in [docs/sprints/lab-5/ci-and-image.md](docs/sprints/lab-5/ci-and-image.md).

### Deploy to Google Cloud

A merge into `main` starts `.github/workflows/deploy.yml`. It waits for approval on the `demo` environment, builds the image tagged with the full commit SHA, runs the migration and seed as the Cloud Run job `cpe334-migrate`, deploys `cpe334-app` by image digest, and runs `infra/smoke.sh` against the public URL. The GCP resources come from `infra/gcp/01-resources.sh` and `infra/gcp/02-ci-identity.sh`.

One-time setup by the project owner:

1. On the GitHub environment `demo`, add the variables `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`, and `GCP_DEPLOY_SA` (printed by `02-ci-identity.sh`) and the required reviewers.
2. After the first deploy creates the service, allow public access once (the deploy account may not change IAM):
   `gcloud run services add-iam-policy-binding cpe334-app --region asia-southeast1 --member allUsers --role roles/run.invoker`

Run `BASE_URL=... SMOKE_EMAIL=... SMOKE_PASSWORD=... infra/smoke.sh` to check any instance by hand. After grading, delete the Cloud SQL instance, the Cloud Run service and job, and the project.

### Seeded accounts

| Email                                                                     | Role      | Lab                  |
| ------------------------------------------------------------------------- | --------- | -------------------- |
| `custodian.embedded@example.com`                                          | Custodian | Embedded Systems Lab |
| `custodian.network@example.com`                                           | Custodian | Network Lab          |
| `borrower1@example.com`, `borrower2@example.com`, `borrower3@example.com` | Borrower  | Any                  |

All seeded accounts use the `SEED_USER_PASSWORD` from your `.env`. The data is synthetic.

### Docker Engine inside WSL 2

If Docker runs inside a WSL distribution instead of Docker Desktop, start the databases from a WSL shell in the repository folder. Node can stay on Windows, because WSL forwards the published ports to `localhost`.

```bash
docker compose up -d --wait db
docker compose --env-file .env.test up -d --wait db-test
```

Then run `npm run db:deploy` and `npm run db:seed` on Windows instead of `npm run db:setup`.

WSL stops its virtual machine, and the containers with it, when no WSL process is running. Keep a WSL terminal open while you develop or run tests, or the API reports the database as unreachable.

## Run

```bash
npm run dev
```

The client runs on http://localhost:5190 and proxies `/api` to the API on port 4100.

## Commands

| Command                 | What it does                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `npm run build`         | Builds `shared`, `server`, and `client`                                                 |
| `npm test`              | Runs the shared, server, and client tests. Server tests use the test database.          |
| `npm run test:coverage` | Runs server and client tests with a coverage report                                     |
| `npm run test:e2e`      | Resets and seeds the test database, starts the API and the client, then runs Playwright |
| `npm run lint`          | Runs ESLint                                                                             |
| `npm run format:check`  | Checks formatting with Prettier                                                         |
| `npm run db:setup`      | Starts the development database, applies migrations, and loads the seed                 |
| `npm run db:migrate`    | Creates and applies a new migration after a `schema.prisma` change                      |
| `npm run db:deploy`     | Applies committed migrations to the development database                                |
| `npm run db:seed`       | Adds any missing seed rows                                                              |
| `npm run db:down`       | Stops the database containers                                                           |

Server tests, the E2E seed, and the E2E API refuse to run unless `DATABASE_URL` in `.env.test` names a database ending in `_test`. The E2E seed uses a fixed test-only password from `e2e/seed-data.ts`, never your `SEED_USER_PASSWORD`. The first `npm run test:e2e` needs `npx playwright install chromium`.

## Engineering documents

| Document                            | Path                                             |
| ----------------------------------- | ------------------------------------------------ |
| Software Requirements Specification | [docs/srs.md](docs/srs.md)                       |
| Feature inventory                   | [docs/features.md](docs/features.md)             |
| Traceability matrix                 | [docs/traceability.md](docs/traceability.md)     |
| System-Level SDS                    | [docs/system-sds.md](docs/system-sds.md)         |
| Three-sprint plan                   | [docs/sprints/plan.md](docs/sprints/plan.md)     |
| Sprint 1 contracts                  | [docs/sprints/sprint-1/](docs/sprints/sprint-1/) |
| AI-use declaration                  | [docs/ai-use.md](docs/ai-use.md)                 |

## Workflow

1. Open an Issue linked to its requirement, feature, and contract.
2. Branch from the current sprint staging branch (`sprint-1`).
3. Open a Pull Request into the staging branch and link it to the Issue.
4. The teammate reviews and merges. Authors do not approve or merge their own PRs.
5. A reviewed release PR moves the staging branch into `main`, and the release is tagged.

Do not commit real secrets. Copy `.env.example` to `.env` for local configuration.
