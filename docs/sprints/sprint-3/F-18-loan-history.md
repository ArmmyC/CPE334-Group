# F-18 Copy and Borrower Loan History

Product: Lab Equipment Borrowing System
Issue: to confirm (not created yet)
Owner: @ArmmyC (plan), drafted for the owner by Claude on 2026-11-22. Reviewer: teammate review pending.
Requirements: FR-20, BR-15, NFR-03
Depends on: F-07 history recording, F-09 loan return
Sources: [SRS](../../srs.md) FR-20; [System-Level SDS](../../system-sds.md) sections 5.1, 5.2

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-22 | draft for owner | First contract, written before tests. Contract only, not implemented in this round. Not yet reviewed by the teammate. |

## 1. Feature-Level SDS

### 1.1 Purpose

A custodian sees every loan of one copy, and every loan of one borrower, limited to assigned labs. Each row shows the dates, the status, and the return note.

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Loan history service | `server/src/loans/history.ts` | `forCopy`, `forBorrower`: one query each, filtered by the assigned labs. |
| Shared schemas | `shared/src/loans.ts` | `loanHistoryItemSchema`, response schema, cursor query like F-14. |
| UI | `CopiesPage.tsx`, `ActiveLoansPage.tsx` | A "History" link per copy and per borrower name opens a list page `/custodian/copies/:id/loans` and `/custodian/borrowers/:id/loans`. |

### 1.3 Rules

- Newest checkout first, ties by id, paged with the same cursor rule as F-14 (default 50, max 100).
- The copy route: a copy outside the assigned labs, or a missing or non-integer id, returns 404. A copy in scope with no loans returns an empty list.
- The borrower route: a borrower exists across labs and the labs are what is scoped, so it returns only loans of copies in assigned labs, and an empty list when there are none.

## 2. API specification

| Method and path | Access | Query | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /api/custodian/copies/:id/loans` | Custodian | `limit`, `beforeId` | 200 `{ items, nextBeforeId }`, each item `{ id, borrower, assetTag, equipmentType, lab, checkedOutAt, dueDate, status, returnedAt, returnNote, renewed }` | 400, 401, 403, 404 |
| `GET /api/custodian/borrowers/:id/loans` | Custodian | `limit`, `beforeId` | 200, same shape | 400, 401, 403 |

## 3. UI specification

Two list pages with the columns above, the empty sentence "No loans yet.", Load more, and the error and Retry states of F-14.

## 4. Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F18-01 | FR-20 | The copy route lists all loans of the copy, newest first, with return data. |
| AC-F18-02 | FR-20, BR-15 | The borrower route lists only loans in assigned labs. |
| AC-F18-03 | NFR-03 | A copy in another lab, or a bad id, returns 404. A borrower gets 403, no session 401. |
| AC-F18-04 | FR-20 | Paging gives no gaps or repeats. |
| AC-F18-05 | SR-02 | The pages show loading, empty, error, and Load more. |

## 5. Test specifications

| Test | AC | Level | Expected result |
| --- | --- | --- | --- |
| TEST-F18-01 | AC-F18-01 | API | Three loans of one copy (one returned with a note) listed newest first. |
| TEST-F18-02 | AC-F18-02 | API | A borrower with loans in Lab A and Lab B shows only Lab A to the Lab A custodian. |
| TEST-F18-03 | AC-F18-03 | API | 404, 403, 401 as listed. |
| TEST-F18-04 | AC-F18-04 | API | Pages of 3, 3, 1 with equal times, no repeats. |
| TEST-F18-05 | AC-F18-05 | UI | All four states. |

## 6. SR rules

SR-01, SR-02. Reads only, so no migration (SR-03).

## 7. Definition of Done

- Contract committed before tests, tests failing before implementation. TEST-F18-01 to TEST-F18-05 passing, lint, format, build, existing tests pass.
- Teammate review and merge (pending). Not started in this round.
