# F-09 Loan Return

Product: Lab Equipment Borrowing System
Issue: to confirm (not created yet)
Owner: @ArmmyC (plan), drafted for the owner by Claude on 2026-11-22. Reviewer: teammate review pending.
Requirements: FR-12, BR-07, BR-08 (return), BR-15, NFR-03
Depends on: F-04 checkout (merged), F-07 history recording (merged)
Sources: [SRS](../../srs.md) FR-12, BR-07, BR-08; [System-Level SDS](../../system-sds.md) sections 2.5, 3.2, 3.4, 5.2, 6.1

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-22 | draft for owner | First contract, written before tests. Not yet reviewed by the teammate. |

## 1. Feature-Level SDS

### 1.1 Purpose

A custodian records the return of an active loan in an assigned lab, with a condition note. The loan becomes Returned, and the copy becomes Available, or In maintenance when the custodian marks it damaged.

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Return service | `server/src/loans/service.ts` | `returnLoan`: one transaction that checks scope and state, updates loan and copy, and writes two history rows. |
| Loan routes | `server/src/loans/routes.ts` | `POST /api/custodian/loans/:id/return`, body validation, response. |
| Shared schemas | `shared/src/loans.ts` | `returnLoanBodySchema`: `{ note: string 1..500, damaged: boolean }`. |
| Migration | `server/prisma/migrations/<new>` | Adds `loan.returned_at`, `loan.returned_by_id`, `loan.return_note` (SDS 3.2). |
| UI | `client/src/ActiveLoansPage.tsx` | A "Return" button per row, and a dialog with the note and a damaged checkbox. |

### 1.3 Transaction

1. Look up the loan within the custodian's assigned labs. Missing, non-integer id, or out of scope: 404 `NOT_FOUND` (D-08, NFR-03).
2. Conditionally update the loan `WHERE id = :id AND status = 'ACTIVE'` and set `RETURNED`, `returned_at` from the injected clock, `returned_by_id`, `return_note`. Zero rows updated: 409 `INVALID_STATUS`. BR-07 says a return is recorded once, so two parallel returns give exactly one 200.
3. Set the copy from `ON_LOAN` to `AVAILABLE`, or to `IN_MAINTENANCE` when `damaged` is true (BR-08).
4. Write history rows for the loan (ACTIVE to RETURNED) and the copy, with the custodian as actor, in the same transaction (F-07). A refused return writes nothing.

### 1.4 Rules

- Custodian role only. A borrower gets 403, no session gets 401.
- `note` is required, 1 to 500 characters after trimming. `damaged` is a boolean and defaults to false. Invalid input: 400 `VALIDATION_ERROR` with `fields`.
- A returned loan frees the borrower's BR-04 slot for that type, because the loan is no longer Active.

### 1.5 Data

The migration adds three nullable loan columns. Existing rows keep NULL. A check constraint requires `returned_at` to be set when `status = 'RETURNED'`.

## 2. API specification

| Method and path | Access | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /api/custodian/loans/:id/return` | Custodian | `{ "note": "...", "damaged": false }` | 200 `{ id, status: "RETURNED", returnedAt, copy: { id, assetTag, status } }` | 400 `VALIDATION_ERROR`, 401, 403 borrower, 404 `NOT_FOUND`, 409 `INVALID_STATUS` |

## 3. UI specification

| Area | Specification |
| --- | --- |
| Active loans | A "Return" button on each row opens a dialog with a required note field, a "Copy is damaged" checkbox, Cancel and "Confirm return". |
| Success | The dialog closes, the message "Returned <asset tag>." appears and the row disappears. |
| Errors | A field message under the note on 400. "This loan was already returned." on 409 and the list reloads. 404 shows "Loan not found." |

## 4. Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F09-01 | FR-12, BR-08 | A custodian returns an active loan in an assigned lab. The loan becomes Returned with time, actor and note, and the copy becomes Available. |
| AC-F09-02 | FR-12, BR-08 | Returning with `damaged: true` makes the copy In maintenance. |
| AC-F09-03 | BR-07 | A second return of the same loan is refused with 409 and changes nothing. Parallel returns give exactly one 200. |
| AC-F09-04 | BR-15, NFR-03 | A loan in an unassigned lab, or a missing or non-integer id, returns 404 and changes nothing. A borrower gets 403 and no session gets 401. |
| AC-F09-05 | FR-12 | A missing, blank, or over-500-character note returns 400 `VALIDATION_ERROR` with `fields.note`, and changes nothing. |
| AC-F09-06 | FR-17 | The return writes a history row for the loan and for the copy with the custodian as actor, and a refused return writes none. |
| AC-F09-07 | FR-12, SR-02 | The UI return dialog works and shows the success, validation, and 409 states. |

## 5. Test specifications

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-F09-01 | AC-F09-01 | API, DB | An active loan in the custodian's lab, copy On loan | Return with a note | 200. Loan RETURNED with `returned_at`, `returned_by_id`, `return_note`. Copy AVAILABLE. The borrower can request the type again. |
| TEST-F09-02 | AC-F09-02 | API, DB | Same | Return with `damaged: true` | Copy IN_MAINTENANCE |
| TEST-F09-03 | AC-F09-03 | API, DB | An active loan | Return twice in sequence, then 10 parallel returns of another loan | 409 `INVALID_STATUS` on the repeat. Exactly one 200 among the parallel calls, one history pair only. |
| TEST-F09-04 | AC-F09-04 | API | A loan in Lab B, a custodian of Lab A, a borrower, no session | Return as each, and call `/loans/abc/return` and `/loans/99999/return` | 404, 403, 401, 404, 404. The loan is still ACTIVE. |
| TEST-F09-05 | AC-F09-05 | API | An active loan | Return with no note, a blank note, a 501-character note | 400 with `fields.note` each. The loan is still ACTIVE. |
| TEST-F09-06 | AC-F09-06 | API, DB | An active loan | Return, then a refused return of another lab's loan | Two history rows (LOAN and COPY) with the actor, none for the refused call |
| TEST-F09-07 | AC-F09-07 | UI | Active loans page with one row | Open the dialog, submit empty, then a valid note. Stub a 409. | Field message. Success message and row removed. 409 message and reload. |

## 6. SR rules

SR-01 (the route is `CUSTODIAN`), SR-02 (error shape and UI states), SR-04 (the new columns survive a restart, covered by the existing durability check).

## 7. Definition of Done

- Contract committed before tests, tests failing before implementation.
- TEST-F09-01 to TEST-F09-07 executed and passing. Lint, format, build, existing tests pass. The migration applies on a fresh and an existing database.
- Teammate review and merge into `sprint-2` (pending).
