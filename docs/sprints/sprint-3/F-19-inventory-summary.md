# F-19 Inventory Summary

Product: Lab Equipment Borrowing System
Issue: to confirm (not created yet)
Owner: @ArmmyC (plan), drafted for the owner by Claude on 2026-11-22. Reviewer: teammate review pending.
Requirements: FR-21, BR-09, BR-15, NFR-03
Depends on: F-05 active loans, F-10 overdue rule, F-13 copy inventory
Sources: [SRS](../../srs.md) FR-21; [System-Level SDS](../../system-sds.md) sections 5.1, 5.2, 8

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-22 | draft for owner | First contract, written before tests. Contract only, not implemented in this round. Not yet reviewed by the teammate. |
| 0.2 | 2026-11-22 | draft for owner | Implemented. `from` and `to` are each optional: `to` defaults to today in Bangkok and `from` to 29 days before `to` (30 days inclusive). A reversed or over-long range is a 400 on field `to`. Figures use three grouped SQL queries for all assigned labs. |

## 1. Feature-Level SDS

### 1.1 Purpose

For each assigned lab, a custodian sees copies by status, the number of active loans, the number of overdue loans, and the 5 equipment types with the most checkouts in a chosen date range.

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Summary service | `server/src/summary/service.ts` | One grouped query per figure, no per-row loops. |
| Shared schemas | `shared/src/summary.ts` | Query (`from`, `to` as YYYY-MM-DD) and response schemas. |
| UI | `client/src/SummaryPage.tsx` | `/custodian/summary`: a card per lab, a date range, and a top-5 table. |

### 1.3 Rules

- `from` and `to` are calendar dates in Asia/Bangkok, inclusive, `from` <= `to`, at most 366 days apart. The default range is the last 30 days ending today in Bangkok.
- A checkout counts by the Bangkok date of `checked_out_at`. Returned loans count too, because the range is about checkouts.
- Overdue uses the same rule as F-10 (BR-09), calculated on read.
- The top 5 are ordered by checkouts descending, then type name ascending. Types with no checkouts in the range are left out.
- Only assigned labs appear (BR-15). A custodian with no assignment gets `{ labs: [] }`.

## 2. API specification

| Method and path | Access | Query | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /api/custodian/summary` | Custodian | `from`, `to` | 200 `{ range: { from, to }, labs: [{ lab, copies: { AVAILABLE, ON_LOAN, IN_MAINTENANCE, RETIRED }, activeLoans, overdueLoans, topTypes: [{ equipmentType, checkouts }] }] }` | 400, 401, 403 |

## 3. UI specification

A card per lab with the four copy counts, active and overdue loans (overdue in the warning colour), and the top-5 table. From and To date inputs with an Apply button. Loading, error with Retry, and "No assigned labs." states.

## 4. Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F19-01 | FR-21 | Copy counts per status match the database for each assigned lab. |
| AC-F19-02 | FR-21, BR-09 | Active and overdue loan counts match, with the due date itself not overdue. |
| AC-F19-03 | FR-21 | The top 5 follows the range, the tie rule, and counts returned loans. |
| AC-F19-04 | BR-15, NFR-03 | Other labs never appear. A borrower gets 403, no session 401. |
| AC-F19-05 | SR-02 | A bad or reversed range, or over 366 days, returns 400 `VALIDATION_ERROR`. |
| AC-F19-06 | FR-21, SR-02 | The page shows the cards and the states. |

## 5. Test specifications

| Test | AC | Level | Expected result |
| --- | --- | --- | --- |
| TEST-F19-01 | AC-F19-01 | API | Known counts in two labs. |
| TEST-F19-02 | AC-F19-02 | API | Loans due yesterday, today, tomorrow give 1 overdue, 3 active. |
| TEST-F19-03 | AC-F19-03 | API | Seven types, ties, a checkout at 17:30 UTC counted on the next Bangkok day. |
| TEST-F19-04 | AC-F19-04 | API | Lab B absent, 403, 401. |
| TEST-F19-05 | AC-F19-05 | API | 400 for bad dates, reversed, 367 days. |
| TEST-F19-06 | AC-F19-06 | UI | Cards, range change, empty and error states. |

## 6. SR rules

SR-01, SR-02, SR-08 (the summary uses grouped queries so it stays fast with seed data).

## 7. Definition of Done

- Contract committed before tests, tests failing before implementation. TEST-F19-01 to TEST-F19-06 passing, lint, format, build, existing tests pass.
- Teammate review and merge (pending). Not started in this round.
