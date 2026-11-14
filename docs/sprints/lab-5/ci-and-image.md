# Lab 5: CI gate, container image, and readiness check

Product: Lab Equipment Borrowing System
Issues: #32 (cloud-ready application), #33 (container image), #34 (CI on every pull request)
Sources: [System-Level SDS](../../system-sds.md) section 10, [Feature inventory](../../features.md) SR-05, [SRS](../../srs.md) NFR-10 and NFR-11

This file is the contract for the first Lab 5 change. The GCP deployment workflow and the cloud setup follow in a later change, once the GCP project exists.

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-08 | @Bank848 | CI gate (SR-05), image, `/api/ready`, and SPA serving, written before the code. |

## Scope

| Part | What it adds |
| --- | --- |
| `GET /api/ready` | A public route that answers 200 once the database answers and every Prisma migration is finished. |
| SPA serving | The server serves `client/dist` and falls back to `index.html` for client-side routes, so one image serves the UI and `/api` (SDS 10). |
| `Dockerfile` | The multi-stage image from SDS 10. Non-root, listens on `PORT`, holds the migration and seed commands. |
| `.github/workflows/ci.yml` | Lint, format check, build, unit and API tests, Playwright, and a container check on every pull request (SR-05, NFR-11). |

## Design

- `/api/ready` differs from `/api/health`. Health says the database answers. Ready also says the schema is in place, so the deploy smoke test and Cloud Run do not send traffic to an instance whose migrations have not run. It reads `_prisma_migrations`: ready needs at least one row and no row that is unfinished or rolled back.
- The failure reason is never sent. The body is `{ "status": "not_ready" }` with status 503, as SDS 5.2 says, and the check shares the health timeout.
- The server serves the SPA only when `clientDir` is set. `server.ts` sets it in production to `client/dist` next to `server/dist`, and `CLIENT_DIR` overrides it. Tests pass a temporary folder.
- A path under `/api` is never answered with `index.html`, and neither is a path with a file extension that is not on disk.
- The image runs these commands. The migration job (SDS 10) uses the first two:
  - `node node_modules/prisma/build/index.js migrate deploy --schema server/prisma/schema.prisma`
  - `node server/dist/seed-cli.js`
  - `node server/dist/server.js` (the default command)
- CI job names are `Lint, build, and tests`, `End-to-end tests`, and `Docker image`. Branch protection on `main` and `sprint-*` requires all three.

## Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-SR05-01 | NFR-11 | Every pull request into `main` or a `sprint-*` branch runs lint, format check, build, tests, end-to-end tests, and the image check. A failing job shows as a failed check. |
| AC-SR05-02 | NFR-11 | The three jobs are required status checks, so a failing one blocks the merge. |
| AC-LAB5-01 | NFR-10 | `GET /api/ready` answers 200 with `{ "status": "ready", "database": "connected" }` on a migrated database, and 503 with `{ "status": "not_ready" }` when the check fails or times out. It needs no session. |
| AC-LAB5-02 | NFR-10 | One container serves `/`, a client-side route such as `/catalog/4`, `/api/health`, and `/api/ready`, and runs as a user other than root. |

## Test specifications

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-LAB5-01 | AC-LAB5-01 | API | Migrated test database | `GET /api/ready` without a cookie | 200 and `{ "status": "ready", "database": "connected" }`. |
| TEST-LAB5-02 | AC-LAB5-01 | API | A readiness check that throws, or never settles with a 50 ms timeout | `GET /api/ready` | 503 and `{ "status": "not_ready" }`. The error text is not in the body. |
| TEST-LAB5-03 | AC-LAB5-02 | API | A folder with `index.html` and `assets/app.js` | `GET /`, `/assets/app.js`, `/catalog/4` | `index.html`, the script, and `index.html`. |
| TEST-LAB5-04 | AC-LAB5-02 | API | The same folder | `GET /api/does-not-exist`, `/assets/missing.js` | JSON 404 `NOT_FOUND`, and a plain 404 that is not the SPA page. |
| TEST-LAB5-05 | AC-LAB5-02 | Container | The image, a migrated and seeded database | Start the container and call `/api/ready`, `/api/health`, `/`, `/catalog/4`, then `id -u` | All answer 200 with the SPA root, and the user id is not 0. This is the `Docker image` CI job. |
| TEST-SR05-01 | AC-SR05-01 | CI | A pull request | Open it | The three jobs run. A deliberate lint error turns `Lint, build, and tests` red. |
