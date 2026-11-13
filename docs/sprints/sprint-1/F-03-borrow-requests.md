# F-03 Borrow Requests

Product: Lab Equipment Borrowing System
Issue: #16
Owner: @ArmmyC, reviewer @Bank848
Requirements: FR-06, FR-07, FR-10, BR-03, BR-04, BR-06, BR-16, BR-17, NFR-03
Depends on: F-01 (merged), F-02 catalog (@Bank848, which hosts the request form), F-07 history recording (@Bank848, which F-03 calls in each transaction)
Sources: [SRS](../../srs.md) sections 3 and 4, [System-Level SDS](../../system-sds.md) sections 2.4, 2.5, 4, 5, 6.2, and 7, [Traceability](../../traceability.md) section 4

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-07 | @ArmmyC | First contract, written before the tests (#16). |

## 1. Feature-Level SDS

### 1.1 Purpose

A borrower asks for one copy of an equipment type, sees their own requests and loans, and cancels a request that is still Pending. The request rules, one Available copy at submit and at most one Pending request or active loan per type, are checked inside the same transaction as the insert. Two parallel submits from one borrower therefore cannot both pass.

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Request service | `server/src/requests/service.ts` | Submit and cancel. Each change runs in one transaction and calls the F-07 history recorder inside it. Reads time only from the clock. |
| Loan list | `server/src/loans/service.ts` | Read-only list of the caller's loans. F-04 is the first feature that writes loans. |
| Routes | `server/src/requests/routes.ts`, `server/src/loans/routes.ts` | Translate HTTP to service calls, validate bodies with the shared schemas, and return the response shapes in section 2. |
| Route table | `server/src/routes.ts` | Adds four `BORROWER` entries (SR-01). |
| Shared schemas | `shared/src/requests.ts` | `createRequestSchema`, `requestSchema`, and `loanSchema`, used by the API and the UI. |
| History recorder | `server/src/history/` (F-07) | One call per change, in the same transaction. |
| UI | `client/src/` | The request form on the equipment detail page (F-02 owns the page), the My requests and loans page, and the cancel action. |

### 1.3 Transactions

**Submit** (`POST /api/requests`):

1. Validate the body. An unknown or malformed field returns 400 before the database is touched.
2. Start a transaction and lock the borrower's row with `SELECT id FROM "user" WHERE id = :borrowerId FOR UPDATE` (SDS 2.5). This is the same lock that checkout takes in F-04, so the lock order is the same everywhere.
3. Look up the equipment type. A missing type returns 404 `NOT_FOUND`.
4. Refuse with 409 `DUPLICATE_REQUEST` when the borrower has a Pending request for the type, or an active loan of a copy of the type (BR-04).
5. Count the copies of the type with `status = 'AVAILABLE'`. Refuse with 409 `NO_AVAILABLE_COPY` when there are none (BR-03). The count only decides whether the request is accepted. Nothing is reserved (BR-17).
6. Insert the request as `PENDING`. The purpose is trimmed, and an empty purpose is stored as null.
7. Call the F-07 recorder with the new status in the same transaction.

The partial unique index on `borrow_request(borrower_id, equipment_type_id) WHERE status = 'PENDING'` is the second guard. A violation maps to 409 `DUPLICATE_REQUEST` through the error mapper (SDS 2.5), never to a 500.

**Cancel** (`POST /api/requests/:id/cancel`):

1. Start a transaction and take the same borrower lock as step 2 of submit.
2. Find the request by `id` and `borrower_id = session user`. A missing request, or another borrower's request, returns 404 `NOT_FOUND`, and nothing changes (BR-16, D-08).
3. `UPDATE borrow_request SET status = 'CANCELLED', decided_at = now, decided_by_id = :borrowerId WHERE id = :requestId AND status = 'PENDING'`. If 0 rows change, refuse with 409 `INVALID_STATUS` and roll back (BR-06).
4. Call the F-07 recorder in the same transaction.

**Lists.** `GET /api/requests` and `GET /api/loans` filter on `borrower_id = session user` in the query. A record outside that scope is not found by the same code path that handles a missing record (SDS 6.2).

### 1.4 Rules

- A request is accepted only for a type with an Available copy at that moment (BR-03). It reserves nothing, so the count can change before checkout (BR-17).
- A borrower has at most one Pending request or active loan per type (BR-04, D-10). A Cancelled, Fulfilled, or Rejected request does not block a new one.
- Cancel is allowed only from Pending, and Cancelled is final (BR-06, D-12).
- A borrower sees and acts only on their own records. The catalog never shows holders (BR-16).
- Custodians get 403 on every route in this feature (NFR-03). A caller with no session gets 401.

### 1.5 Data

No migration. The feature uses `borrow_request`, `loan`, `copy`, `equipment_type`, and `status_history`, all created by SR-03 and F-07. The partial unique index on `borrow_request` is part of SR-03, so F-03 relies on it without adding it.

## 2. API specification

| Method and path | Access | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /api/requests` | Borrower | `{ "equipmentTypeId": integer, "purpose"?: string, at most 500 characters }` | 201 with the request, status `PENDING` | 400 `VALIDATION_ERROR`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN` for a custodian, 403 `INVALID_ORIGIN`, 404 `NOT_FOUND`, 409 `DUPLICATE_REQUEST`, 409 `NO_AVAILABLE_COPY`, 503 `SERVICE_BUSY` |
| `GET /api/requests` | Borrower | None | 200 with the caller's requests, newest first | 401 `UNAUTHENTICATED`, 403 `FORBIDDEN` |
| `POST /api/requests/:id/cancel` | Borrower | No body | 200 with the request, status `CANCELLED` | 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 403 `INVALID_ORIGIN`, 404 `NOT_FOUND`, 409 `INVALID_STATUS` |
| `GET /api/loans` | Borrower | None | 200 with the caller's loans, newest first. The list is empty until F-04 creates loans. | 401 `UNAUTHENTICATED`, 403 `FORBIDDEN` |

Response shapes, defined in `shared/src/requests.ts`:

- Request: `{ id, equipmentType: { id, name }, lab: { name }, purpose: string | null, status, createdAt, decidedAt: string | null }`.
- Loan: `{ id, equipmentType: { id, name }, assetTag, checkedOutAt, dueDate, status }`, where `dueDate` is a calendar date in `YYYY-MM-DD` form (SDS 8).

The shared error shape and the codes come from SDS 5.3. `equipmentTypeId` in the body is a positive integer. Validation errors list each field in `fields`.

## 3. UI specification

| Area | Specification |
| --- | --- |
| Request form | On the equipment detail page `/catalog/:typeId`, which F-02 owns. The form has an optional purpose field, up to 500 characters, and a Submit request button that is disabled while the request is in flight. A type with no Available copy shows "No copies of this equipment are available right now." in place of the form. |
| Purpose field message | Over 500 characters: "Use a purpose of at most 500 characters.", shown under the field. The request is not sent. |
| Submit success | Shows "Request submitted. It stays Pending until a custodian checks it out." with a link to My requests. |
| Submit refused | The API message shows above the form. 409 `DUPLICATE_REQUEST` shows "You already have a Pending request or an active loan for this equipment type." 409 `NO_AVAILABLE_COPY` shows "No copies of this equipment are available right now." |
| My requests and loans, `/my` | Borrower only. Requests table: equipment, lab, purpose or "None", status, requested on, and a Cancel button on Pending rows. Loans table: equipment, asset tag, checked out, due date, status. Empty states: "You have no requests yet." and "You have no loans." Loading and error states follow SR-02. |
| Cancel | Disables the button while the request is in flight, then reloads the list. 409 shows "This request can no longer be cancelled." above the list. |
| Navigation | Borrowers get a "My requests" link in the header. The route guard from F-01 sends a custodian to their home page. |

## 4. Acceptance criteria

These are the AC from [traceability.md](../../traceability.md) section 4, unchanged.

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F03-01 | FR-06 | A borrower submits a request with an optional purpose note, and it is stored as Pending. |
| AC-F03-02 | BR-03 | A request for a type with no Available copy is refused, and nothing is stored. |
| AC-F03-03 | BR-04 | A second request for a type the borrower already has Pending or on an active loan is refused. Two requests for the same type sent in parallel give one 201 and one 409 `DUPLICATE_REQUEST`, and only one Pending request is stored. |
| AC-F03-04 | FR-07, BR-16 | A borrower sees their own requests and loans with status and dates, and asset tag and due date for loans. The list contains no other borrower's records. The loan part is verified once F-04 exists. |
| AC-F03-05 | BR-16, NFR-03 | A borrower who reads or cancels another borrower's request, or reads another borrower's loan, gets 404, receives no data, and nothing changes. |
| AC-F03-06 | FR-10, BR-06 | A borrower cancels their own Pending request, it becomes Cancelled, and they can request that type again. |
| AC-F03-07 | BR-06 | Cancelling a request that is not Pending is refused, and its status does not change. |
| AC-F03-08 | BR-17 | Submitting a request does not change the Available count of the type. |
| AC-F03-09 | NFR-03 | A custodian who calls the submit request, cancel request, or my requests and loans endpoint gets 403. |

## 5. Test specifications

API tests run against the test database with the fixed clock from F-01. Each test creates its own borrowers, labs, types, and copies. Loans are inserted directly in the test until F-04 provides checkout.

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-F03-01 | AC-F03-01 | API, UI | A borrower, and a type with one Available copy | Submit once with a purpose and once without. In the UI, submit the form with a purpose. | Both API calls return 201 with status `PENDING`. The purpose is stored as given, or as null when omitted. The UI shows the success message. |
| TEST-F03-02 | AC-F03-02 | API | A type whose copies are all On loan or In maintenance | Submit a request for the type | 409 `NO_AVAILABLE_COPY`. No request row is created, and the copy statuses do not change. |
| TEST-F03-03 | AC-F03-03 | API | A borrower with a Pending request for a type, a second borrower with an active loan of a copy of a type, and a type with two Available copies for the parallel case | Submit again for the first type. Submit for the second type. Send two parallel submits from one borrower for the third type. | Both repeats return 409 `DUPLICATE_REQUEST`. The parallel pair gives one 201 and one 409 `DUPLICATE_REQUEST`, and exactly one Pending request is stored. |
| TEST-F03-04 | AC-F03-04 | API, UI | A borrower with requests in several statuses, another borrower with requests, and a loan inserted for the first borrower | Call `GET /api/requests` and `GET /api/loans`. Open `/my`. | Each list contains only the caller's records, newest first, with the fields in section 2. The UI shows both tables. |
| TEST-F03-05 | AC-F03-05 | API | Another borrower's Pending request and loan | Cancel the other request, and read the other loan by listing | Cancel returns 404 `NOT_FOUND`. The other request keeps its status. The other loan is not in the caller's list. |
| TEST-F03-06 | AC-F03-06 | API, UI | A borrower with a Pending request | Cancel it, then submit again for the same type. In the UI, click Cancel on the row. | Cancel returns 200 with `CANCELLED`, and the new submit returns 201. The UI row shows Cancelled after the list reloads. |
| TEST-F03-07 | AC-F03-07 | API | A borrower with a Cancelled request, and one with a Fulfilled request inserted for the test | Cancel each | Both return 409 `INVALID_STATUS`, and both statuses stay the same. |
| TEST-F03-08 | AC-F03-08 | API | A type with two Available copies | Submit a request, then count the Available copies of the type | The count is still 2. |
| TEST-F03-09 | AC-F03-09 | API | A custodian session, and no session | Call submit, cancel, `GET /api/requests`, and `GET /api/loans` with each | The custodian gets 403 on each, and no request is created. Without a session each gets 401. |
| TEST-E2E-01 (borrower part) | AC-F03-01, AC-F03-04, AC-F03-06 | E2E | A seeded borrower and an equipment type with an Available copy | Log in, open the type from the catalog, submit a request with a purpose, open My requests and loans, then cancel the request | The new request shows Pending, then Cancelled. The custodian checkout part of TEST-E2E-01 is added with F-04. |

Supporting checks that have no AC of their own:

| Check | Level | Expected result |
| --- | --- | --- |
| Validation | API | A missing or non-integer `equipmentTypeId` returns 400 `VALIDATION_ERROR` with a field message. A purpose over 500 characters returns the same. |
| Unknown type | API | An `equipmentTypeId` that does not exist returns 404 `NOT_FOUND`, and no request is created. |
| Blank purpose | API | A purpose of spaces only is stored as null. |
| History entries | API, after F-07 | Each accepted submit and each cancel writes one history entry in the same transaction. A refused submit or cancel writes none. |
| Purpose field validation | UI | A purpose over 500 characters shows "Use a purpose of at most 500 characters." under the field and sends no request. |

## 6. SR rules this feature must satisfy

- SR-01: the four routes in this feature are `BORROWER` in the route table, so AC-SR01-01 covers them. Each one returns 401 without a session and 403 for a custodian (NFR-03).
- SR-02: every error above uses the shared shape, and the form shows field messages next to the fields (AC-SR02-02). The request and loan lists show loading, empty, and error states (AC-SR02-03).
- SR-07: the purpose note is user text and is never logged. Logs show the error code and the request id only.

## 7. Definition of Done

- The contract is committed before the tests, and the tests fail before the implementation.
- TEST-F03-01 to TEST-F03-09, the borrower part of TEST-E2E-01, and the supporting checks pass. AC-F03-04's loan part is checked again once F-04 exists.
- Lint, format, build, and all existing tests pass.
- Reviewed by @Bank848 and merged into `sprint-1`.
