# Sprint 1 System Checks

Product: Lab Equipment Borrowing System
Sources: [Feature inventory](../../features.md) section 2, [Traceability](../../traceability.md) section 4, [System-Level SDS](../../system-sds.md)

This file is the contract for the Sprint 1 system responsibilities (SR-xx). It holds their acceptance criteria and test specifications. Each SR section is added by the Issue that builds it.

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-06 | @ArmmyC | SR-03 section, written before its tests (#12). Adds AC-SR03-04 for the BR-01 and BR-04 database guards. |

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
- It only creates missing rows, found by natural keys (email, lab name, type name in a lab, asset tag), and never updates an existing row (NFR-10).
- Passwords come from `SEED_USER_PASSWORD`, which must be at least 12 characters. The seed refuses to run without it and never prints it.
- When `SMOKE_EMAIL` and `SMOKE_PASSWORD` are both set, the seed also creates the smoke borrower (SDS section 3.5).
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
| TEST-SR03-01 | AC-SR03-01 | Database integration | A copy with asset tag `EMB-0001` exists | Insert another copy with asset tag `EMB-0001`, for the same type and for another type | Both inserts fail with a unique violation on `asset_tag`, and one copy with that tag remains |
| TEST-SR03-02 | AC-SR03-02 | Database integration | A lab exists | Insert equipment types with loan periods 1, 30, 0, and 31, and one without a loan period | 1 and 30 are stored. 0 and 31 fail the check constraint and store nothing. The one without a value has 7. |
| TEST-SR03-03 | AC-SR03-03 | Manual, recorded for the release | A fresh clone with Docker running | Follow the README setup and run commands | The app opens on port 5190, and a seeded borrower and custodian can see the seeded catalog once F-01 and F-02 exist. The count of commands is recorded and is at most 6. |
| TEST-SR03-04 | AC-SR03-04 | Database integration | A borrower, a type, two copies, and requests to link the loans to | Insert a second `ACTIVE` loan for a copy that has one. Then mark the first loan `RETURNED` and insert again. Insert a second `PENDING` request for the same borrower and type. Then mark the first `CANCELLED` and insert again. | The second active loan and the second Pending request fail with unique violations. After the first record changes status, the new insert succeeds. A Pending request for another type or another borrower is never refused. |

Supporting checks that have no AC of their own:

| Check | Level | Expected result |
| --- | --- | --- |
| Seed is repeatable | Database integration | Running the seed twice gives the same row counts. A copy status changed between the runs is not reset. |
| Seed refuses a missing or short password | Unit | The seed stops with a clear message when `SEED_USER_PASSWORD` is unset or shorter than 12 characters, and writes nothing. |
| Password hash format | Unit | `hashPassword` returns `scrypt$16384$8$1$salt$hash` with a 16-byte salt and a 64-byte key, and hashing one password twice gives different strings. |
| Lower-case email | Database integration | Inserting a user whose email has upper-case letters fails the check constraint. |

### Definition of Done

- The migration applies to an empty database with `prisma migrate deploy`, and `prisma migrate diff` shows no drift from `schema.prisma`.
- TEST-SR03-01, TEST-SR03-02, TEST-SR03-04, and the supporting checks pass, and they failed before the schema existed.
- The README lists the setup commands, and TEST-SR03-03 is recorded for the Sprint 1 release.
- Lint, format, build, and all existing tests pass.
