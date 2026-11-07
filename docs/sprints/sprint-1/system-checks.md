# Sprint 1 System Checks

Product: Lab Equipment Borrowing System
Sources: [Feature inventory](../../features.md) section 2, [Traceability](../../traceability.md) section 4, [System-Level SDS](../../system-sds.md)

This file is the contract for the Sprint 1 system responsibilities (SR-xx). It holds their acceptance criteria and test specifications. Each SR section is added by the Issue that builds it.

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-06 | @ArmmyC | SR-03 section, written before its tests (#12). Adds AC-SR03-04 for the BR-01 and BR-04 database guards. |
| 0.2 | 2026-11-07 | @ArmmyC | SR-01 and SR-02 sections, written with the F-01 contract before their tests (#14). |
| 0.3 | 2026-11-07 | @ArmmyC | SR-04 and SR-07 sections, written before their checks are run (#19). |

## SR-01 Authorization

Requirements: NFR-02, NFR-03
Issue: #14, built with F-01
Design: SDS sections 6.2 and 7.2

### Design

- `server/src/routes.ts` is the one route table. Each entry names its method, path, and access: `public`, `signed-in`, `BORROWER`, or `CUSTODIAN`. The app registers API routes only from this table.
- A route that is not `public` gets `requireSession`, which returns 401 `UNAUTHENTICATED` for a missing, unknown, or expired session before any validation or service code runs.
- A route with a role gets `requireRole` after `requireSession`, which returns 403 `FORBIDDEN` for the other role.
- The public routes are `GET /api/health` and `POST /api/auth/login`. `/api/ready` joins them in Lab 5.
- Ownership and lab scope (the 404 part of NFR-03) are applied in each feature's service queries and tested by the AC that traceability lists for NFR-03.

### Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-SR01-01 | NFR-02 | Every protected endpoint returns 401 and no private data when called without a session. |

### Test specifications

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-SR01-01 | AC-SR01-01 | API | The route table, with path parameters replaced by `1` and an empty JSON body for `POST` and `PATCH` | Call every entry that is not `public`, with no cookie | Each returns 401 with exactly the shared error shape and code `UNAUTHENTICATED`, and no other data. The test fails if the table has no protected entry. |

Supporting checks that have no AC of their own:

| Check | Level | Expected result |
| --- | --- | --- |
| Wrong role | API | A route registered for one role returns 403 `FORBIDDEN` to a signed-in user with the other role. F-02 to F-06 test this again on their own endpoints. |
| Public routes | API | The only public entries are `GET /api/health` and `POST /api/auth/login`. |

## SR-02 Error shape and UI states

Requirements: NFR-07
Issue: #14 builds the API part and the login form. F-02 to F-06 add their forms and list screens.
Design: SDS sections 4.2 and 5.3

### Design

- Request bodies are checked with the shared Zod schemas. A failure returns 400 `VALIDATION_ERROR` with `fields`, keyed by field name, holding the first message for each field.
- One error mapper writes every error. Known errors keep their status and code. Invalid JSON is 400 `INVALID_JSON`, a body over 100kb is 413 `PAYLOAD_TOO_LARGE`, an unknown `/api` route is 404 `NOT_FOUND`, and anything else is 500 `INTERNAL_ERROR` with no stack trace or SQL. The details go to the server log.
- The UI parses every error with `apiErrorSchema`, shows `fields` under the matching inputs, and shows `message` for other errors.

### Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-SR02-01 | NFR-07 | Every API error, including validation errors with `fields`, uses the shared error shape. |
| AC-SR02-02 | NFR-07 | Every Sprint 1 form (login, borrow request, checkout copy selection, and copy status change) shows field messages next to the fields. |
| AC-SR02-03 | NFR-07 | The catalog, my requests and loans, pending requests, and active loans screens show loading, empty, and error states. |

### Test specifications

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-SR02-01 | AC-SR02-01 | API | None | Send a login body with missing fields, a malformed JSON body, a body over 100kb, a call to an unknown `/api` route, and a request that makes a handler throw | 400 `VALIDATION_ERROR` with `fields` for `email` and `password`, 400 `INVALID_JSON`, 413 `PAYLOAD_TOO_LARGE`, 404 `NOT_FOUND`, and 500 `INTERNAL_ERROR`. Every body matches `apiErrorSchema`, and the 500 body has no stack trace. |
| TEST-SR02-02 | AC-SR02-02 | UI | Each Sprint 1 form | Submit invalid input, and render an API response with `fields` | The message appears under the matching field. F-01 covers the login form, and F-03, F-04, and F-06 add theirs. |
| TEST-SR02-03 | AC-SR02-03 | UI | Each Sprint 1 list screen | Render while loading, with an empty list, and with an API error | A loading message, the empty sentence, and the error message with a Retry button. F-02 to F-05 add one test per screen. |

## SR-03 Data model, migrations, and reproducible seed

Requirements: BR-01 and BR-04 (database guards), BR-05 (database constraint), BR-12, NFR-09
Issue: #12
Design: SDS sections 3.2 and 3.5

### Design

- One migration creates the Sprint 1 tables from SDS section 3.2: `user`, `session`, `lab`, `lab_assignment`, `equipment_type`, `copy`, `borrow_request`, `loan`, and `status_history`. Sprint 2 and 3 columns and `login_attempt` are added by their features as additive migrations.
- Prisma expresses the primary keys, foreign keys, enums, plain unique constraints, and the loan period default. The same migration adds the rest in SQL, each with a comment naming its rule:

| Constraint | SQL | Rule |
| --- | --- | --- |
| Loan period range | `CHECK (loan_period_days BETWEEN 1 AND 30)` on `equipment_type` | BR-05 |
| One active loan per copy | Unique index on `loan(copy_id) WHERE status = 'ACTIVE'` | BR-01 |
| One Pending request per borrower and type | Unique index on `borrow_request(borrower_id, equipment_type_id) WHERE status = 'PENDING'` | BR-04 |
| Lower-case email | `CHECK (email = lower(email))` on `user` | SDS 3.2 |

- Timestamp columns have no database default. Services write them from the injected clock (SDS section 8).
- BR-04 also counts an active loan of the same type. That part needs a query across two tables, so the F-03 request service enforces it, and AC-F03-03 tests it.

### Seed

- `npm run db:seed` loads the A-04 catalog: Embedded Systems Lab and Network Lab, one custodian assigned to each, three borrowers, six equipment types, and copies in Available and In maintenance states.
- It only creates missing rows, found by natural keys (email, lab name, type name in a lab, asset tag), and never updates an existing row, except the smoke borrower's password hash below (NFR-10). Each insert skips rows that already exist in the same statement, so two overlapping runs both finish.
- Passwords come from `SEED_USER_PASSWORD`, which must be at least 12 characters and not the `replace-` placeholder from `.env.example`. The seed refuses to run otherwise and never prints it.
- When `SMOKE_EMAIL` and `SMOKE_PASSWORD` are both set, the seed also creates the smoke borrower (SDS section 3.5). Its password hash is the one value the seed updates on every run, so the secret can be rotated. Setting only one of the two, or a smoke email that is a demo account, stops the seed before any write.
- The On loan copy and its sample loan are not in this seed. SDS section 3.5 creates the sample loan through the checkout service, so F-04 adds it.

### Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-SR03-01 | BR-12 | The database refuses a second copy with an existing asset tag. |
| AC-SR03-02 | BR-05 | The database accepts loan periods of 1 and 30 days, refuses 0 and 31, and sets 7 days when none is given. |
| AC-SR03-03 | NFR-09 | A fresh clone reaches the running app with seed data in at most 6 documented commands. |
| AC-SR03-04 | BR-01, BR-04 | The database refuses a second active loan for one copy and a second Pending request for one borrower and type. It accepts a new one once the earlier loan is returned or the earlier request is no longer Pending. |

### Test specifications

All database integration tests run against the test database. Each test file starts from an empty, migrated database and creates its own fixtures.

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-SR03-01 | AC-SR03-01 | Database integration | A copy with asset tag `EMB-0001` exists | Insert another copy with asset tag `EMB-0001`, for the same type and for another type | Both inserts fail with `P2002` on `asset_tag`, and one copy with that tag remains |
| TEST-SR03-02 | AC-SR03-02 | Database integration | A lab exists | Insert equipment types with loan periods 1, 30, 0, and 31, and one without a loan period | 1 and 30 are stored. 0 and 31 fail the check constraint and store nothing. The one without a value has 7. |
| TEST-SR03-03 | AC-SR03-03 | Manual, recorded for the release | A fresh clone with Docker running | Follow the README setup and run commands | The app opens on port 5190, and a seeded borrower and custodian can see the seeded catalog once F-01 and F-02 exist. The count of commands is recorded and is at most 6. |
| TEST-SR03-04 | AC-SR03-04 | Database integration | A borrower, a type, two copies, and requests to link the loans to | Insert a second `ACTIVE` loan for a copy that has one. Then mark the first loan `RETURNED` and insert again. Insert a second `PENDING` request for the same borrower and type. Then mark the first `CANCELLED` and insert again. | The second active loan and the second Pending request fail with unique violations. After the first record changes status, the new insert succeeds. A Pending request for another type or another borrower is never refused. |

Supporting checks that have no AC of their own:

| Check | Level | Expected result |
| --- | --- | --- |
| Seed is repeatable | Database integration | Running the seed twice gives the same row counts. A copy status changed between the runs is not reset. |
| Seed runs overlap | Database integration | Two seed runs started together both finish without an error. Together they create each row once, and the row counts match a single run. |
| Seed refuses bad configuration | Database integration | The seed stops with a clear message, and writes nothing, when `SEED_USER_PASSWORD` is unset, shorter than 12 characters, or the example placeholder, when only one smoke variable is set, or when the smoke email is a demo account. |
| Smoke password rotation | Database integration | A second run with a new `SMOKE_PASSWORD` changes only the smoke account's hash. Row counts and demo account hashes stay the same. |
| Password hash format | Unit | `hashPassword` returns `scrypt$16384$8$1$salt$hash` with a 16-byte salt and a 64-byte key, and hashing one password twice gives different strings. |
| Lower-case email | Database integration | Inserting a user whose email has upper-case letters fails the check constraint. |

### Definition of Done

- The migration applies to an empty database with `prisma migrate deploy`, and `prisma migrate diff` shows no drift from `schema.prisma`.
- TEST-SR03-01, TEST-SR03-02, TEST-SR03-04, and the supporting checks pass, and they failed before the schema existed.
- The README lists the setup commands, and TEST-SR03-03 is recorded for the Sprint 1 release.
- Lint, format, build, and all existing tests pass.

## SR-04 Durable storage

Requirements: NFR-10
Issue: #19
Design: SDS sections 4 and 7.2, and the Lab 5 durability rule in section 10

### Design

- Every record is in PostgreSQL: users, sessions, requests, loans, copy statuses, and history. The API keeps nothing in memory between requests, so a restart loses no state.
- The local database keeps its files in the named volume `cpe334-group-db-data` in `docker-compose.yml`. `docker compose down` without `-v` keeps the volume, and so keeps the data.
- The seed only creates missing rows and never resets a changed status (SR-03), so a redeploy does not undo user changes.
- Google Cloud durability (Cloud SQL, redeploy) is checked in Sprint 2 (Lab 5) and repeated in Sprint 3, as the traceability sheet records.

### Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-SR04-01 | NFR-10 | A request, a loan, and a copy status change made before an API and database restart are still there after it. |

### Test specifications

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-SR04-01 | AC-SR04-01 | Manual, recorded for the release | A local stack on the release commit, with F-03, F-04, and F-06 merged, a borrower session, and a custodian session | 1. As the borrower, submit a request. As the custodian, set one copy of another type to In maintenance, and check out a copy for a Pending request. Note the record ids and the borrower's cookie. 2. Stop the API, run `docker compose restart db`, and start the API again. 3. Read the request and the loan, read the copy status, and call `GET /api/auth/me` with the same cookie. | The request, the loan, and the copy status are unchanged. The cookie still returns the borrower, so the session survived the restart. |

Supporting checks that have no AC of their own:

| Check | Level | Expected result |
| --- | --- | --- |
| Named volume | Review | `docker-compose.yml` mounts `cpe334-group-db-data` on the `db` service, and nothing else holds the data. Checked for the release. |
| Sessions survive restart | Manual | Part of TEST-SR04-01 step 3. |

### Definition of Done

- TEST-SR04-01 is recorded against the release commit, with the record ids and the result.
- F-03, F-04, and F-06 are merged before the check runs. Before they are, the same steps run for the request and the session only, and that partial result is recorded as partial.

## SR-07 Secret handling

Requirements: NFR-13
Issue: #19
Design: SDS sections 9.1 and 9.2

### Design

- `.env` and `.env.test` are ignored by Git. Only `.env.example` and `.env.test.example` are committed, and they hold placeholders or local development values that the README documents.
- The client bundle reads no secrets. Vite exposes only variables with the `VITE_` prefix, and the project defines none that are secret.
- GitHub secret scanning and push protection are on for the public repository.
- In Sprint 2 and later, runtime secrets live in Google Secret Manager, not in Git or the image (Lab 5).

### Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-SR07-01 | NFR-13 | `.env.example` has placeholders only, the built client files contain no secret, and GitHub secret scanning is on with no open alerts. |

### Test specifications

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-SR07-01 | AC-SR07-01 | Manual review for the release | The release commit on `main`, and a local build from it | 1. Run `git ls-files`, and confirm that no `.env` or `.env.test` file is listed. Read `.env.example` and `.env.test.example`, and confirm each value is a placeholder or a documented local value. 2. Run `npm run build`, and search `client/dist` for the values of `SEED_USER_PASSWORD`, `SMOKE_PASSWORD`, and the password in `DATABASE_URL`. 3. Run both commands below as @ArmmyC, the repository owner, because both need admin rights. A 404 from either command means the check did not run, so it is recorded as not checked, not as a pass. Run `gh api repos/ArmmyC/CPE334-Group --jq .security_and_analysis`, and confirm secret scanning and push protection are enabled. Run `gh api "repos/ArmmyC/CPE334-Group/secret-scanning/alerts?state=open" --jq length`, and confirm it prints 0. | All checks pass, and each result is recorded against the release commit. |

Supporting checks that have no AC of their own:

| Check | Level | Expected result |
| --- | --- | --- |
| Client environment reads | Review | `grep -rn "import.meta.env" client/src` lists no secret variable. |
| Ignore rules | Review | `git check-ignore .env .env.test` prints both file names, and `git check-ignore .env.example` prints nothing. |

### Definition of Done

- TEST-SR07-01 is recorded against the release commit, with each command and its output.
- Any finding is fixed before the release PR is merged. A secret that was pushed is changed at once, as SDS 9.2 requires.
