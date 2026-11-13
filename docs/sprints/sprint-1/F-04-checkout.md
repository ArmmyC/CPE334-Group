# F-04 Custodian Checkout

Product: Lab Equipment Borrowing System
Issue: #24
Owner: @Bank848, reviewer @ArmmyC
Requirements: FR-08, FR-09, BR-01, BR-02, BR-05, BR-06 (Fulfilled), BR-08 (checkout), BR-15, BR-17, NFR-03, NFR-05, NFR-08 (due date)
Depends on: F-03 borrow requests (@ArmmyC, PR #17, not merged when this was written), F-07 history recording (PR #25, not merged when this was written), F-01 (merged)
Sources: [SRS](../../srs.md) section 3 (FR-08, FR-09), [System-Level SDS](../../system-sds.md) sections 2.5, 4, 5, 6.2, and 8, [Traceability](../../traceability.md) section 4, [F-07 contract](F-07-history-recording.md) section 1.5

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-08 | @Bank848 | First contract, written before the tests (#24). |
| 0.2 | 2026-11-13 | @ArmmyC | F-02 and F-03 are merged, so TEST-F04-09 reads the catalog count and TEST-E2E-01 submits the request through the form, as agreed at the retarget in #28. |

## 1. Feature-Level SDS

### 1.1 Purpose

A custodian sees the Pending requests in the labs they are assigned to, oldest first. For one request they see the Available copies of the requested type and choose one. Checkout then creates an active loan, marks the copy On loan, and marks the request Fulfilled, all in one transaction, with a due date counted in Asia/Bangkok days. Ten simultaneous checkouts of one copy create exactly one loan.

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Due date | `server/src/loans/due-date.ts` | `dueDateFor(now, loanPeriodDays)`: the Asia/Bangkok calendar date of `now` plus whole days, built with `Date.UTC` (SDS 8). |
| Checkout service | `server/src/checkout/service.ts` | `listPending`, `listAvailableCopies`, and `checkout`. Checkout runs the SDS 2.5 transaction and calls the F-07 recorder three times inside it. Reads time only from the clock. |
| Checkout routes | `server/src/checkout/routes.ts` | Validates the query, route id, and body, calls the service, and returns the shapes in section 2. |
| Route table | `server/src/routes.ts` | Adds three `CUSTODIAN` entries (SR-01). |
| Shared schemas | `shared/src/checkout.ts` | `pendingRequestSchema`, `availableCopySchema`, `checkoutBodySchema`, and `checkoutResultSchema`, used by the API and the UI. |
| UI | `client/src/` | The Pending requests page at `/custodian/requests` with the copy selection dialog, and the fetch calls in `api.ts`. |

### 1.3 Checkout transaction

The order is SDS 2.5. Any refusal throws, which rolls back everything, including the history entries already written.

1. Find the request where the request's lab is one of the custodian's assigned labs. Missing or out of scope: 404 `NOT_FOUND`. Then lock the borrower's row with `SELECT id FROM "user" WHERE id = :borrowerId FOR UPDATE`.
2. `UPDATE borrow_request SET status = 'FULFILLED', decided_at = now, decided_by_id = custodian WHERE id = :id AND status = 'PENDING'`. Zero rows: 409 `INVALID_STATUS`.
3. Find the copy where the copy's lab is assigned to the custodian. Missing or out of scope: 404 `NOT_FOUND`. A copy of another type, or in another lab than the request's lab: 409 `COPY_MISMATCH`.
4. `UPDATE copy SET status = 'ON_LOAN' WHERE id = :copyId AND status = 'AVAILABLE'`. Zero rows: 409 `COPY_NOT_AVAILABLE`.
5. Insert the loan with `status = 'ACTIVE'`, `checked_out_at = now`, `checked_out_by_id`, and `due_date = dueDateFor(now, loan_period_days)`. Record three history entries through `recordStatusChange` (F-07 section 1.5), actor is the custodian: `REQUEST` `PENDING` to `FULFILLED`, `COPY` `AVAILABLE` to `ON_LOAN`, and `LOAN` `null` to `ACTIVE`.
6. Commit.

The transaction uses `maxWait` 5 seconds and `timeout` 10 seconds, as F-03 does. Prisma error `P2028` becomes 503 `SERVICE_BUSY` in the shared error mapper, and nothing is changed. A unique violation `P2002` from the partial unique index on active loans or the unique `loan.request_id` is the second guard, and is reported as 409 `COPY_NOT_AVAILABLE`.

### 1.4 Rules

- Pending requests, available copies, and checkout work only for labs the custodian is assigned to (BR-15). A request or copy in another lab is 404, the same as a missing one (NFR-03, D-08).
- A custodian with no assigned lab gets an empty pending list, and 404 on any request id.
- The list shows only `PENDING` requests, oldest `created_at` first, then by id. Another `status` value is a 400 in Sprint 1. Unknown query parameters are 400 (SDS 5.1).
- Available copies are the copies of the request's type with status `AVAILABLE`, sorted by asset tag. The list is only a help for the dialog. Checkout checks the copy again (BR-17).
- Only a `PENDING` request can be checked out (BR-06). Fulfilled is final in Sprint 1.
- A copy that is not Available, is of another type, or is in another lab is refused and nothing changes (BR-02).
- The due date is the Asia/Bangkok date of the checkout time plus `loan_period_days` (BR-05). The checkout time is stored in UTC and shown in Asia/Bangkok time (NFR-08).
- Two checkouts for one request, or for one copy, give exactly one success. Every other call gets 409 (BR-01, NFR-05).
- A borrower gets 403 on every route in this feature, and a caller with no session gets 401 (NFR-03).
- The F-11 limits (3 active loans, overdue block) are Sprint 2 and are not checked here.

### 1.5 Data

No migration. The feature reads `lab_assignment`, `borrow_request`, `equipment_type`, `copy`, and `user`, and writes `borrow_request`, `copy`, `loan`, and `status_history`, all from SR-03 and F-07.

### 1.6 F-03 history calls

F-03 left a `TODO(F-07)` in `server/src/requests/service.ts`. This branch resolves it in a separate commit, so @ArmmyC can take that commit alone. Submit records `REQUEST` `null` to `PENDING` with the borrower as actor, and cancel records `REQUEST` `PENDING` to `CANCELLED` with the borrower as actor. The service signature does not change.

## 2. API specification

| Method and path | Access | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /api/custodian/requests` | Custodian | Optional query `status`. Only `PENDING` is allowed, and it is the default. | 200 `{ "items": [...] }` with the Pending requests in assigned labs, sorted by `createdAt` ascending, then `id` | 400 `VALIDATION_ERROR` (`fields.status` for another value, no field for an unknown parameter), 401, 403 |
| `GET /api/custodian/requests/:id/available-copies` | Custodian | None | 200 `{ "items": [...] }` with the Available copies of the request's type, sorted by `assetTag` | 401, 403, 404 `NOT_FOUND` (missing, not an integer, or in an unassigned lab) |
| `POST /api/custodian/requests/:id/checkout` | Custodian | `{ "copyId": number }` | 201 with the new loan | 400 `VALIDATION_ERROR` (`fields.copyId`), 401, 403, 404 `NOT_FOUND`, 409 `INVALID_STATUS`, 409 `COPY_MISMATCH`, 409 `COPY_NOT_AVAILABLE`, 503 `SERVICE_BUSY` |

Response shapes, defined in `shared/src/checkout.ts`:

- Pending request: `{ id, borrower: { id, name }, equipmentType: { id, name }, lab: { id, name }, purpose, createdAt }`. `purpose` is a string or null.
- Available copy: `{ id, assetTag }`.
- Checkout result: `{ id, requestId, borrower: { id, name }, equipmentType: { id, name }, lab: { id, name }, assetTag, checkedOutAt, dueDate, status }`. `checkedOutAt` is an ISO timestamp, `dueDate` is `YYYY-MM-DD`, and `status` is `ACTIVE`.

`copyId` must be a positive integer. The messages are "Choose a copy." for a missing, non-integer, or non-positive value.

Rule messages:

| Status | Code | Message |
| --- | --- | --- |
| 404 | `NOT_FOUND` | "This request could not be found." or "This copy could not be found." |
| 409 | `INVALID_STATUS` | "This request is no longer Pending." |
| 409 | `COPY_MISMATCH` | "This copy is not of the requested equipment type or lab." |
| 409 | `COPY_NOT_AVAILABLE` | "This copy is not available." |

## 3. UI specification

| Area | Specification |
| --- | --- |
| Pending requests, `/custodian/requests` | Custodian only. It replaces the F-01 placeholder. A table with borrower, equipment, lab, purpose or "None", requested on (Asia/Bangkok time), and a Check out button on each row. |
| Loading | "Loading..." while the request is in flight (SR-02). |
| Empty | "No pending requests in your labs." |
| Error | "Could not load pending requests." with a Retry button that sends the request again. |
| Copy selection dialog | Check out opens a dialog titled "Check out <equipment name>" for that request. It loads the Available copies and shows them as radio choices by asset tag. While loading it shows "Loading copies...". With none it shows "No copies of this equipment are available right now." and no confirm. A load failure shows "Could not load copies." with a Retry button. |
| Confirm | The Confirm checkout button is disabled until a copy is chosen, and while the request is in flight. A 400 `fields.copyId` message shows under the choices. Any other API message (409) shows above the choices, and the dialog stays open so the custodian can pick another copy. |
| Success | The dialog closes, a message "Checked out <asset tag> to <borrower name>. Due <date>." shows above the table, and the list reloads from the API. |
| Navigation | After login a custodian lands here (SDS 4.1). The route guard from F-01 sends a borrower to their home page. |

## 4. Acceptance criteria

These are the AC from [traceability.md](../../traceability.md) section 4, unchanged.

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F04-01 | FR-08, BR-15 | A custodian sees Pending requests for their assigned labs only, oldest first. |
| AC-F04-02 | FR-09, BR-08 | Checkout with an Available copy creates an active loan, marks the copy On loan, and marks the request Fulfilled, in one transaction. |
| AC-F04-03 | BR-05, NFR-08 | The due date is the Asia/Bangkok checkout date plus the loan period, correct at 23:59 and 00:00 Bangkok time. The checkout time is stored in UTC and shown in Asia/Bangkok time. |
| AC-F04-04 | BR-02, BR-17 | Checkout with a copy that is not Available, is of another type, or is in another lab is refused, and nothing changes. |
| AC-F04-05 | BR-01, NFR-05 | 10 simultaneous checkouts of the same copy create exactly 1 active loan, and the other 9 are refused. |
| AC-F04-06 | NFR-03 | A borrower who calls the pending list or checkout endpoint gets 403. |
| AC-F04-07 | BR-15, NFR-03 | A custodian who acts on a request in an unassigned lab gets 404. |
| AC-F04-08 | BR-06 | Checkout of a request that is not Pending is refused. |
| AC-F04-09 | FR-09, FR-04 | After checkout, the type's Available count in the catalog is 1 lower. |

## 5. Test specifications

API tests run against the test database with the fixed clock from F-01. Each test creates its own labs, custodians, borrowers, types, copies, and requests, and inserts requests directly, except TEST-E2E-01, where the borrower uses the request form.

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-F04-01 | AC-F04-01 | API, UI | A custodian assigned to Lab A. Three Pending requests in Lab A created at different times, one Fulfilled request in Lab A, and one Pending request in Lab B. | Call `GET /api/custodian/requests`. Open `/custodian/requests`. | The API returns the three Lab A Pending requests, oldest first, with the fields in section 2. The Fulfilled and Lab B requests are not listed. The UI shows the same rows in the same order. |
| TEST-F04-02 | AC-F04-02 | API, UI, database | A custodian, a Pending request, and two Available copies of the type | Check out one copy. In the UI, open the dialog, choose a copy, and confirm. | 201 with the loan. One `ACTIVE` loan exists for that request and copy and borrower. The copy is `ON_LOAN`, the other copy is still `AVAILABLE`, and the request is `FULFILLED` with `decided_by_id` set. Three history entries exist (request, copy, loan) with the custodian as actor. The UI shows the success message and the row leaves the list. |
| TEST-F04-03 | AC-F04-03 | Unit with a fixed clock, API | `dueDateFor` with 23:59 and 00:00 Bangkok times, loan periods 1, 7, and 30, a month end, and a year end. A checkout at a fixed clock. | Call the function. Check out at 2026-11-08T16:59:00Z (23:59 Bangkok) and at 2026-11-08T17:00:00Z (00:00 Bangkok, next day). | 23:59 on 8 November counts from 8 November, and 00:00 counts from 9 November. A 7 day period gives 15 and 16 November. Month and year ends roll over. The stored `checked_out_at` equals the clock time in UTC. The stored `due_date` does not depend on the process time zone. |
| TEST-F04-04 | AC-F04-04 | API, database | A Pending request, a copy On loan, a copy In maintenance, a copy of another type in the same lab, a copy of another lab, and a copy id that does not exist | Check out each in turn | On loan and In maintenance: 409 `COPY_NOT_AVAILABLE`. Another type and another lab: 409 `COPY_MISMATCH`. A missing copy id: 404 `NOT_FOUND`. After each, the request is still `PENDING`, no loan exists, no copy changed, and no history entry exists. |
| TEST-F04-05 | AC-F04-05 | API and database | One Available copy and 10 Pending requests from 10 borrowers, in one assigned lab | Send 10 checkouts of the copy in parallel, one per request | Exactly one 201 and nine 409 `COPY_NOT_AVAILABLE`, and no 503. Exactly one `ACTIVE` loan exists for the copy, exactly one request is `FULFILLED`, the nine others are still `PENDING`, and the copy is `ON_LOAN`. A second test sends two checkouts of one request with two copies: one 201 and one 409 `INVALID_STATUS`. |
| TEST-F04-06 | AC-F04-06 | API | A borrower with a session | Call the pending list, the available copies, and checkout | Each returns 403 `FORBIDDEN`, and nothing changes. |
| TEST-F04-07 | AC-F04-07 | API | A custodian assigned to Lab A, and a Pending request in Lab B with a copy in Lab B. A Pending request in Lab A and a copy in Lab B. | Call available copies and checkout for the Lab B request. Check out the Lab A request with the Lab B copy. | The Lab B request gives 404 `NOT_FOUND` on both calls. The Lab B copy on a Lab A request gives 404 `NOT_FOUND`. Nothing changes. |
| TEST-F04-08 | AC-F04-08 | API | A Fulfilled request, a Cancelled request, and a request already checked out once | Check out each with an Available copy | 409 `INVALID_STATUS` for each. The copy stays `AVAILABLE`, and no new loan or history entry exists. |
| TEST-F04-09 | AC-F04-09 | API, database | A type with three Available copies | Count the Available copies of the type, check out one, and count again | The type's `availableCount` from `GET /api/equipment-types`, read as a borrower, drops from 3 to 2. |
| TEST-E2E-01 | AC-F03-01, AC-F04-02, AC-F03-04 | E2E | A seeded borrower and custodian, and a seeded type with Available copies | A borrower logs in, opens the type from the catalog, and submits the request form. A custodian logs in, opens Pending requests, and checks out a copy. The borrower opens My requests. | The request goes through the form on the equipment detail page (F-02, F-03), not through the API. The custodian sees it in Pending requests and checks out a copy, and the borrower sees the loan in My requests. |

Supporting checks that have no AC of their own:

| Check | Level | Expected result |
| --- | --- | --- |
| Not-a-number id | API | A request id such as `abc` or `0` returns 404 `NOT_FOUND`. |
| Body validation | API | A missing, string, zero, or fractional `copyId` returns 400 `VALIDATION_ERROR` with `fields.copyId`, and changes nothing. |
| Status query | API | Omitting `status` and `status=PENDING` return the same list. Another value returns 400 with `fields.status`. An unknown parameter returns 400. |
| No assigned lab | API | A custodian with no `lab_assignment` row gets an empty list and 404 on a request id. |
| Two assigned labs | API | A custodian assigned to two labs sees the Pending requests of both in one list. |
| Available copies | API | Only `AVAILABLE` copies of the request's type are returned, sorted by asset tag. |
| History entries | Database | A checkout writes exactly three entries with the right entity, old status, new status, actor, lab, and the clock time. A refused checkout writes none. |
| Rollback on failure | Database | If the history write fails, the request, copy, and loan changes roll back. |
| F-03 history | API, database | Submit writes one `REQUEST` entry `null` to `PENDING` with the borrower as actor. Cancel writes one `PENDING` to `CANCELLED` entry. A refused submit or cancel writes none. |
| Pool timeout | API | A transaction error with code `P2028` returns 503 `SERVICE_BUSY` (the shared mapper from F-03 already covers it). |
| Loading, empty, and error states | UI | The page shows "Loading...", "No pending requests in your labs.", and "Could not load pending requests." with a Retry button (TEST-SR02-03). |
| Dialog states | UI | The dialog shows its loading, empty, and error states, keeps Confirm disabled until a copy is chosen, and shows a 409 message above the choices with the dialog still open. |
| Route guard | UI | A borrower at `/custodian/requests` is sent to `/catalog`. |

## 6. SR rules this feature must satisfy

- SR-01: the three routes are `CUSTODIAN` in the route table, so AC-SR01-01 covers them, and AC-F04-06 and AC-F04-07 test the wrong role and the unassigned lab.
- SR-02: every error uses the shared shape (AC-SR02-01). The copy selection dialog shows field messages next to the choices (AC-SR02-02), and the page shows loading, empty, and error states (AC-SR02-03).
- SR-03: the checkout relies on the active-loan partial unique index and the unique `loan.request_id`.
- SR-07: nothing secret is shown or logged. History entries hold ids and statuses only.

## 7. Definition of Done

- The contract is committed before the tests, and the tests fail before the implementation.
- TEST-F04-01 to TEST-F04-09 and the supporting checks pass. The display half of AC-F04-03 (checkout time shown in Asia/Bangkok) is checked by `client/tests/requests.test.tsx`, test "shows my requests and loans...", where 03:00 UTC shows as 10:00. The My requests page is F-03.
- Lint, format, build, and all existing tests pass.
- The `TODO(F-07)` calls in F-03 are replaced in their own commit, with tests, and @ArmmyC has been told.
- Reviewed by @ArmmyC and merged into `sprint-1`.
