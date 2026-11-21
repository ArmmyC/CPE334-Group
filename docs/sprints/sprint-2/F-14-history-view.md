# F-14 Status History View

Product: Lab Equipment Borrowing System
Issue: to confirm (not created yet)
Owner: @Bank848 (plan), drafted for the owner by Claude on 2026-11-22. Reviewer: teammate review pending.
Requirements: FR-17 (view), BR-15, BR-16
Depends on: F-07 history recording (merged)
Sources: [SRS](../../srs.md) FR-17, BR-15, D-11; [System-Level SDS](../../system-sds.md) sections 3.4, 5.1, 6

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-22 | draft for owner | First contract, written before tests. Not yet reviewed by the teammate. |

## 1. Feature-Level SDS

### 1.1 Purpose

A custodian reads the history entries that F-07 records for requests, loans, and copies in the labs they are assigned to: who changed what, from which status to which, and when. The view is read only and newest first.

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Shared schemas | `shared/src/history.ts` (new) | `historyEntrySchema`, `historyResponseSchema`. |
| Service | `server/src/history/view.ts` (new) | `listHistory(custodianId, query)`: one scoped query plus batched lookups for the subject text. |
| Routes | `server/src/history/routes.ts` (new), `server/src/routes.ts` | `GET /api/custodian/history` (CUSTODIAN). |
| UI | `client/src/HistoryPage.tsx` (new), `client/src/App.tsx`, `client/src/api.ts` | A page at `/custodian/history` with a type filter and a Load more button. |

No migration: `status_history` and its (`lab_id`, `created_at`) index exist.

### 1.3 Rules

- Scope (BR-15): the query filters on `status_history.lab_id` in the labs the custodian is assigned to. An entry of another lab is never read.
- Order: `created_at` descending, then `id` descending.
- Query parameters, all optional: `entityType` (`REQUEST`, `LOAN`, or `COPY`), `limit` (integer 1 to 100, default 50), `beforeId` (positive integer: only entries with an id below it). Any other parameter or a bad value returns 400 `VALIDATION_ERROR` with the parameter in `fields`.
- The response has `items` and `nextBeforeId`: the id of the last item when more entries exist, otherwise null. A client asks for the next page with `beforeId`.
- Each item: `id`, `entityType`, `entityId`, `subject`, `oldStatus` (null when the record was created), `newStatus`, `createdAt` (ISO), `actor` `{ id, name }`, `lab` `{ id, name }`.
- `subject` is a text for people: a copy is "TAG (type name)", a request is "Request #N: type name for borrower name", a loan is "Loan #N: TAG to borrower name". It is built from the current records with batched queries, not one query per entry.
- No borrower password hash, email, or session data is read. Borrower names appear only inside `subject` (a custodian already sees borrower names in F-04 and F-05).
- Entries are never changed or deleted by this feature.

## 2. API specification

| Method and path | Access | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /api/custodian/history` | CUSTODIAN | query as in section 1.3 | 200 `{ items: [...], nextBeforeId }` | 400 `VALIDATION_ERROR` |

A BORROWER or no session gets 403 or 401 from the route table (SR-01).

## 3. UI specification

A custodian page "History" with a select "Type" (All, Requests, Loans, Copies) and a table: time, type, subject, change ("Pending to Fulfilled", or "New: Available" when there was no old status), actor, lab. Statuses use the same labels as the rest of the UI. A "Load more" button shows while `nextBeforeId` is not null and appends the next page. Loading, empty ("No history yet."), and error with Retry states follow SR-02.

## 4. Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F14-01 | FR-17 | The custodian sees the entries of request, loan, and copy changes in their labs, newest first, with actor, old and new status, time, and lab. |
| AC-F14-02 | BR-15 | Entries of a lab the custodian is not assigned to are never returned, including when filtering. |
| AC-F14-03 | FR-17 | `entityType` filters the list. A bad value returns 400. |
| AC-F14-04 | FR-17 | `limit` and `beforeId` page the list without gaps or repeats, and `nextBeforeId` is null on the last page. Bad values return 400. |
| AC-F14-05 | FR-17 | An entry made at creation has `oldStatus` null. `subject` names the copy, request, or loan. |
| AC-F14-06 | SR-01 | A borrower gets 403, no session 401. |
| AC-F14-07 | SR-02 | The page shows the table, the filter, Load more, and the loading, empty, and error states. |

## 5. Test specifications

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-F14-01 | AC-F14-01, AC-F14-05 | API, DB | Entries for a request, a loan, and a copy in Lab A, one with null old status, at different times | GET | All entries, newest first, with the fields in section 1.3 and the `subject` text of each type. |
| TEST-F14-02 | AC-F14-02 | API | Entries in Lab A (assigned) and Lab B | GET, then GET with `entityType` | Only Lab A entries, both times. |
| TEST-F14-03 | AC-F14-03 | API | Entries of all three types | `entityType=COPY`, `LOAN`, `REQUEST`, `BOGUS` | Only that type each time. 400 for `BOGUS`. |
| TEST-F14-04 | AC-F14-04 | API | 7 entries, 3 with the same time | `limit=3` three times following `nextBeforeId`. Bad `limit` (0, 101, "x") and `beforeId` ("x", 0). An unknown parameter | Pages of 3, 3, 1 with every id once in order. `nextBeforeId` null on the last. 400 for the bad values. |
| TEST-F14-05 | AC-F14-06 | API | A borrower and no session | GET | 403 and 401. |
| TEST-F14-06 | AC-F14-01 | API | A real flow: request, checkout, return | Run them through the API, then GET | The entries of that flow appear in order with the custodian as actor. |
| TEST-F14-07 | AC-F14-07 | UI | Page with stubbed API | Open the page, filter by Loans, press Load more | Rows and change text show. The filter sends `entityType`. Load more sends `beforeId` and appends. Empty and error states show. |

## 6. SR rules

SR-01 (the new route is in the route table). SR-02 (states and error shape). SR-03: no migration. SR-08 does not apply (not a listed endpoint).

## 7. Definition of Done

- Contract committed before tests, tests failing before implementation.
- TEST-F14-01 to TEST-F14-07 executed and passing. Lint, format, build, existing tests pass.
- Teammate review and merge into `sprint-2` (pending).
