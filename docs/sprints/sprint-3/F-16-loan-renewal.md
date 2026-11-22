# F-16 Loan Renewal

Product: Lab Equipment Borrowing System
Issue: to confirm (not created yet)
Owner: @ArmmyC (plan), drafted for the owner by Claude on 2026-11-22. Reviewer: teammate review pending.
Requirements: FR-18, BR-14, BR-15, NFR-03, NFR-08
Depends on: F-09 loan return (same branch), F-10 overdue rule, F-07 history recording (merged)
Sources: [SRS](../../srs.md) FR-18, BR-14, D-09; [System-Level SDS](../../system-sds.md) sections 3.2, 5.2, 8

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-22 | draft for owner | First contract, written before tests. Not yet reviewed by the teammate. |

## 1. Feature-Level SDS

### 1.1 Purpose

A custodian renews an active loan in an assigned lab once. The due date moves forward by the loan period of the equipment type, counted from the current due date, and only while the loan is not overdue.

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Renew service | `server/src/loans/service.ts` | `renewLoan`: one transaction that checks scope, then a conditional update that enforces active, not renewed, not overdue. |
| Due date helper | `server/src/loans/due-date.ts` | `addDays(dueDate, days)` on a calendar date, no time zone step. |
| Loan routes | `server/src/loans/routes.ts` | `POST /api/custodian/loans/:id/renew`, id check, response. |
| Shared schemas | `shared/src/loans.ts` | `renewLoanResultSchema`; `renewed` flag on `custodianLoanSchema`. |
| Migration | `server/prisma/migrations/<new>` | Adds `loan.renewed_at` (SDS 3.2). |
| UI | `client/src/ActiveLoansPage.tsx` | A "Renew" button per row, disabled with "Renewed" once used. |

### 1.3 Transaction

1. Look up the loan within the custodian's assigned labs with its equipment type. Missing, non-integer id, or out of scope: 404 `NOT_FOUND` (NFR-03).
2. Read the state and refuse in this order: not Active gives 409 `INVALID_STATUS`; already renewed gives 409 `ALREADY_RENEWED`; overdue (BR-09, today in Asia/Bangkok after the due date) gives 409 `LOAN_OVERDUE`. The due date itself can still be renewed (BR-14).
3. Conditionally update `WHERE id = :id AND status = 'ACTIVE' AND renewed_at IS NULL AND due_date = :readDueDate`, setting `due_date = readDueDate + loanPeriodDays` and `renewed_at` from the injected clock. Zero rows: 409 `ALREADY_RENEWED`. Parallel renewals give exactly one 200.
4. Write one history row for the loan with `oldStatus` and `newStatus` both `ACTIVE`, with the custodian as actor, in the same transaction (F-07). A refused renewal writes nothing.

### 1.4 Rules

- Custodian role only. A borrower gets 403, no session gets 401.
- The new due date is the current due date plus the loan period of the type (D-09), as a calendar date. It does not depend on the renewal time.
- A renewed loan stays Active and the copy stays On loan.

### 1.5 Data

`loan.renewed_at` is a nullable `timestamptz`. NULL means not renewed. Existing rows keep NULL.

## 2. API specification

| Method and path | Access | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /api/custodian/loans/:id/renew` | Custodian | no body | 200 `{ id, dueDate, renewedAt }` | 401, 403 borrower, 404 `NOT_FOUND`, 409 `INVALID_STATUS`, `ALREADY_RENEWED`, `LOAN_OVERDUE` |

`GET /api/custodian/loans` items gain `renewed: boolean`.

## 3. UI specification

| Area | Specification |
| --- | --- |
| Active loans | A "Renew" button on each row. A renewed row shows "Renewed" instead of the button. |
| Success | "Renewed <asset tag>. New due date <date>." and the list reloads. |
| Errors | 409 shows the server message ("This loan was already renewed.", "An overdue loan cannot be renewed.") and the list reloads. 404 shows "Loan not found." |

## 4. Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F16-01 | FR-18, BR-14 | An active, not renewed, not overdue loan in an assigned lab is renewed. The due date becomes the old due date plus the loan period. The loan stays Active. |
| AC-F16-02 | BR-14 | A second renewal is refused with 409 `ALREADY_RENEWED` and nothing changes. Parallel renewals give exactly one 200. |
| AC-F16-03 | BR-14, BR-09 | A loan whose due date is today can be renewed. A loan whose due date was yesterday is refused with 409 `LOAN_OVERDUE`. |
| AC-F16-04 | BR-14 | A returned loan is refused with 409 `INVALID_STATUS`. |
| AC-F16-05 | BR-15, NFR-03 | A loan in an unassigned lab, or a missing or non-integer id, returns 404 and changes nothing. A borrower gets 403 and no session gets 401. |
| AC-F16-06 | FR-17 | A renewal writes a loan history row with the custodian as actor. A refused renewal writes none. |
| AC-F16-07 | FR-18, SR-02 | The UI renew button works and shows the success, 409, and renewed states. |

## 5. Test specifications

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-F16-01 | AC-F16-01 | API, DB | Active loan, due 2026-11-13, type period 7 days, clock 2026-11-10 | Renew | 200, due date 2026-11-20, `renewed_at` set, loan ACTIVE, copy ON_LOAN |
| TEST-F16-02 | AC-F16-02 | API, DB | Active loan | Renew twice in sequence, then 10 parallel on another loan | Repeat is 409 `ALREADY_RENEWED` and due date moved once. Exactly one 200 in parallel, one history row. |
| TEST-F16-03 | AC-F16-03 | API | Clock 2026-11-13 (Bangkok), due 2026-11-13; another loan due 2026-11-12 | Renew each | 200 for the first. 409 `LOAN_OVERDUE` for the second, unchanged. A clock at 17:30 UTC on 11-13 is already 11-14 in Bangkok and refuses. |
| TEST-F16-04 | AC-F16-04 | API | A returned loan | Renew | 409 `INVALID_STATUS` |
| TEST-F16-05 | AC-F16-05 | API | Loan in Lab B, custodian of Lab A, a borrower, no session | Renew as each, and `/loans/abc/renew`, `/loans/99999/renew` | 404, 403, 401, 404, 404. Loan unchanged. |
| TEST-F16-06 | AC-F16-06 | API, DB | Active loan | Renew, then a refused renew | One history row (LOAN, ACTIVE to ACTIVE) with the actor, none for the refused call |
| TEST-F16-07 | AC-F16-07 | UI | Active loans page, one renewable row, one renewed row | Click Renew, stub a 409 | Success message and reload. 409 message and reload. Renewed row has no button. |

## 6. SR rules

SR-01 (the route is `CUSTODIAN`), SR-02 (error shape and UI states), SR-03 (the new column is a migration), SR-06 (domain rules covered by TEST-F16-01 to 04).

## 7. Definition of Done

- Contract committed before tests, tests failing before implementation.
- TEST-F16-01 to TEST-F16-07 executed and passing. Lint, format, build, existing tests pass. The migration applies on a fresh and an existing database.
- Teammate review and merge into the Sprint 3 branch (pending).
