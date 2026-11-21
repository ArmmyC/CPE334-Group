# F-10 Overdue Status

Product: Lab Equipment Borrowing System
Issue: to confirm (not created yet)
Owner: @ArmmyC (plan), drafted for the owner by Claude on 2026-11-22. Reviewer: teammate review pending.
Requirements: FR-13, FR-14 (overdue), BR-09, NFR-08 (overdue)
Depends on: F-05 active loan list (merged)
Sources: [SRS](../../srs.md) FR-13, FR-14, BR-09, NFR-08; [System-Level SDS](../../system-sds.md) sections 5.1, 5.2, 8; [F-05 contract](../sprint-1/F-05-active-loans.md)

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-22 | draft for owner | First contract, written before tests. Not yet reviewed by the teammate. |

## 1. Feature-Level SDS

### 1.1 Purpose

Show which active loans are past their due date, to the borrower (their own loans) and to the custodian (active loans in assigned labs), and let the custodian list only overdue loans. Overdue is calculated when read and never stored (BR-09).

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Overdue rule | `server/src/loans/overdue.ts` (new) | `isOverdue(dueDate, now)`: true when the Asia/Bangkok calendar date of `now` is after `dueDate`. A loan is not overdue on its due date. |
| Loan service | `server/src/loans/service.ts` | Adds `overdue` to every loan row returned to the borrower and the custodian. Adds the overdue filter to `listActiveForCustodian`. |
| Loan routes | `server/src/loans/routes.ts` | Accepts `overdue=true` on `GET /api/custodian/loans`. |
| Shared schemas | `shared/src/loans.ts` | Adds `overdue: boolean` to the loan schemas and `overdue` to `custodianLoansQuerySchema`. |
| UI | `client/src/` | Overdue badge on My requests and loans and on Active loans, and an "Overdue only" toggle on Active loans. |

### 1.3 Rules

- A loan is Overdue when it is `ACTIVE` and the Asia/Bangkok date of the injected clock is later than `due_date`. On the due date it is not overdue. The comparison uses calendar dates, never timestamps (NFR-08).
- Overdue is derived on read. No column, no job, no migration.
- Returned loans are never overdue (F-09 sets `RETURNED`).
- Scope, ownership, and roles do not change: the custodian sees assigned labs only (BR-15), the borrower sees their own loans only (BR-16).

### 1.4 Data

No migration.

## 2. API specification

| Method and path | Access | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /api/custodian/loans` | Custodian | Optional `status=ACTIVE` (default) and optional `overdue=true` | 200 `{ "items": [...] }`; each item gains `overdue: boolean`. With `overdue=true`, only overdue loans. | 400 `VALIDATION_ERROR` for `overdue` with any value other than `true`, 400 for unknown parameters, 401, 403 for a borrower |
| `GET /api/loans` | Borrower | none | 200, each loan gains `overdue: boolean` | 401, 403 for a custodian |

The F-05 `status` field stays `ACTIVE`. `overdue` is a separate field so the status enum does not change.

## 3. UI specification

| Area | Specification |
| --- | --- |
| My requests and loans | An active loan past its due date shows an "Overdue" badge next to the due date. Other loans show no badge. |
| Active loans | Same badge. An "Overdue only" checkbox reloads the list with `overdue=true`. |
| Empty (overdue only) | "No overdue loans in your labs." |
| Loading and error | Unchanged from F-05 ("Loading...", "Could not load active loans." with Retry). |

## 4. Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F10-01 | BR-09, NFR-08 | `isOverdue` is false on the due date and true on the next Bangkok calendar day, including at 23:59 and 00:00 Bangkok time. |
| AC-F10-02 | FR-13 | A borrower's loan list marks an active loan past its due date as overdue and a loan due today or later as not overdue. |
| AC-F10-03 | FR-13, FR-14 | The custodian's active loan list carries `overdue` for each loan, and `overdue=true` returns only overdue loans in assigned labs. |
| AC-F10-04 | BR-15, NFR-03 | `overdue=true` never returns a loan in an unassigned lab. A borrower calling the custodian endpoint gets 403. |
| AC-F10-05 | BR-09 | A returned loan is not marked overdue, and no overdue value is stored in the database. |
| AC-F10-06 | SR-02 | `overdue=false` or an unknown parameter returns 400 `VALIDATION_ERROR`. The UI shows the badge and the "Overdue only" filter. |

## 5. Test specifications

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-F10-01 | AC-F10-01 | Unit | Due date 2026-11-10 | `isOverdue` with clock 2026-11-10 16:59 UTC (23:59 Bangkok), 2026-11-10 17:00 UTC (00:00 on 11 Nov Bangkok), and 2026-11-09 | false, true, false |
| TEST-F10-02 | AC-F10-02 | API | A borrower with active loans due 2026-11-09, 2026-11-10, and 2026-11-12; clock fixed at 2026-11-10 12:00 Bangkok | `GET /api/loans` | the 11-09 loan has `overdue: true`, the other two `false` |
| TEST-F10-03 | AC-F10-03 | API, UI | A custodian in Lab A, one overdue and one not overdue active loan in Lab A | List with and without `overdue=true`. In the UI toggle "Overdue only". | Without the filter both rows carry the right `overdue`. With it only the overdue row. The UI shows the badge and the filtered list. |
| TEST-F10-04 | AC-F10-04 | API | An overdue loan in Lab B, a borrower session | `overdue=true` as the custodian of Lab A, then as the borrower | The Lab B loan is absent. The borrower gets 403. |
| TEST-F10-05 | AC-F10-05 | API, DB | A `RETURNED` loan with a past due date | List loans, and read the `loan` table columns | The returned loan is not listed as overdue and the table has no overdue column. |
| TEST-F10-06 | AC-F10-06 | API | none | `overdue=false`, `overdue=1`, `foo=1` | 400 `VALIDATION_ERROR` each |

## 6. SR rules

SR-01 (existing routes keep their roles), SR-02 (states and error shape), NFR-08 (fixed-clock unit tests).

## 7. Definition of Done

- Contract committed before tests, tests failing before implementation.
- TEST-F10-01 to TEST-F10-06 executed and passing. Lint, format, build, existing tests pass.
- Teammate review and merge into `sprint-2` (pending, not yet done).
