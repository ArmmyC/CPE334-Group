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

Sprint 1 in progress. The scaffold, the data model, and the seed data are in place. The home page reports whether the API and the database are reachable. Authentication and domain features are added by their own Issues and contracts.

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

`npm ci` installs the exact versions in `package-lock.json`, builds `shared/`, and generates the Prisma client. Before `npm run db:setup`, replace the placeholders in `.env`. The user, password, and database name in `DATABASE_URL` must match `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`, and `SEED_USER_PASSWORD` must be at least 12 characters. It is the password of every seeded account.

`npm run db:setup` starts the development database on host port 5435, applies the migrations, and loads the seed data. It is safe to run again: the seed only adds missing rows and never changes existing ones, apart from the optional smoke account's password.

To run the server tests, also create the test database on host port 5436:

```bash
cp .env.test.example .env.test
npm run db:test:up
```

Replace the placeholders in `.env.test` the same way. The tests apply the migrations to the test database themselves.

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

| Command                 | What it does                                                                   |
| ----------------------- | ------------------------------------------------------------------------------ |
| `npm run build`         | Builds `shared`, `server`, and `client`                                        |
| `npm test`              | Runs the shared, server, and client tests. Server tests use the test database. |
| `npm run test:coverage` | Runs server and client tests with a coverage report                            |
| `npm run test:e2e`      | Starts the API on the test database and the client, then runs Playwright       |
| `npm run lint`          | Runs ESLint                                                                    |
| `npm run format:check`  | Checks formatting with Prettier                                                |
| `npm run db:setup`      | Starts the development database, applies migrations, and loads the seed        |
| `npm run db:migrate`    | Creates and applies a new migration after a `schema.prisma` change             |
| `npm run db:deploy`     | Applies committed migrations to the development database                       |
| `npm run db:seed`       | Adds any missing seed rows                                                     |
| `npm run db:down`       | Stops the database containers                                                  |

Server tests and the E2E API refuse to run unless `DATABASE_URL` in `.env.test` names a database ending in `_test`. The first `npm run test:e2e` needs `npx playwright install chromium`.

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
