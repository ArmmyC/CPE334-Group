# F-06 Copy Maintenance Status

Product: Lab Equipment Borrowing System
Issue: #23
Owner: @Bank848, reviewer @ArmmyC
Requirements: FR-16 (Available and In maintenance), BR-08 (maintenance switch), BR-15, NFR-03
Depends on: F-01 (merged), F-07 (history recorder, draft PR #25), SR-03 (merged)
Sources: [SRS](../../srs.md) section 3 (FR-16), [System-Level SDS](../../system-sds.md) sections 2.4, 2.5, 4, 5, 6, and 7.4, [F-07 contract](F-07-history-recording.md) section 1.5, [Traceability](../../traceability.md) section 4

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-08 | @Bank848 | First contract, written before the tests (#23). |

## 1. Feature-Level SDS

### 1.1 Purpose

A custodian sees the copies in the labs they are assigned to and switches a copy between Available and In maintenance. A copy that is On loan cannot be changed, and Sprint 1 cannot set a copy to On loan or Retired. Checkout (F-04) is the only way a copy becomes On loan, and Retired comes with F-13 in Sprint 2. Every switch writes one history entry (F-07).

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Copy service | `server/src/copies/service.ts` | `listForCustodian` reads the copies in the custodian's assigned labs. `changeStatus` switches one copy in a transaction and records the change. |
| Copy routes | `server/src/copies/routes.ts` | Rejects unknown query parameters, parses the id, validates the body with the shared schema, calls the service, and returns the shapes in section 2. |
| Route table | `server/src/routes.ts` | Adds `GET /api/custodian/copies` and `PATCH /api/custodian/copies/:id`, both with access `CUSTODIAN` (SR-01). |
| Shared schemas | `shared/src/copies.ts` | `copyStatusSchema`, `updateCopyStatusRequestSchema`, `custodianCopySchema`, and `custodianCopiesResponseSchema`, used by the API and the UI. |
| History recorder | `server/src/history/service.ts` | From F-07. `changeStatus` calls `recordStatusChange` and does not change it. |
| UI | `client/src/` | The Copies page at `/custodian/copies`, a header link for custodians, and the two fetch calls. |

### 1.3 Switch path

`PATCH /api/custodian/copies/:id` runs one transaction at the default isolation level (SDS 2.5):

1. Look up the copy within the custodian's assigned labs. A missing copy, a copy in an unassigned lab, and a non-integer id all return 404 `NOT_FOUND` (D-08, SDS 5.1).
2. Run the conditional update `UPDATE copy SET status = :target WHERE id = :id AND status = :expected`. `expected` is the other Sprint 1 status: `IN_MAINTENANCE` when the target is `AVAILABLE`, and `AVAILABLE` when the target is `IN_MAINTENANCE`. The transition table is therefore two entries, `AVAILABLE` to `IN_MAINTENANCE` and back.
3. If 0 rows change, refuse with 409 `INVALID_STATUS` and roll back. This covers an On loan copy, a Retired copy, a copy that already has the target status, and a copy that another transaction changed after step 1.
4. Call `recordStatusChange` with `entityType: 'COPY'`, the copy id, the custodian's id as `actorId`, and the old and new status, as in F-07 section 1.5. The call comes after the update changed a row and inside the same transaction.
5. Read the copy again and commit.

The copy status is changed only by the conditional update, so a checkout and a switch that race on one copy cannot both succeed. The refusal in step 3 happens before the recorder is called, so a refused change stores no history entry (AC-F07-02). If the recorder throws, the transaction rolls back and the status is unchanged.

The scoped lookup in step 1 is only for the 404. The lab filter is part of its query, so a copy in another lab is never read and then dropped.

Interactive transactions use `maxWait` 5 seconds and `timeout` 10 seconds (SDS 2.5).

### 1.4 Rules

- A custodian reads and changes only copies in the labs they are assigned to (BR-15, SR-01). The API applies that filter on every request, and the UI does not decide what is shown.
- The API ignores any client-supplied lab, user, or old status. The actor comes from the session and the old status from the database (SDS 2.4).
- A custodian with no assigned lab gets an empty list from the list endpoint. A switch on any copy returns 404.
- A copy that is On loan cannot be changed in either direction (BR-08, AC-F06-02).
- The target status is `AVAILABLE` or `IN_MAINTENANCE`. `ON_LOAN` and `RETIRED` are refused with 400 `VALIDATION_ERROR`, the same as any other value. Sprint 2 adds `RETIRED` to the allowed targets in F-13 and keeps `ON_LOAN` refused (SDS 5.2).
- A switch to the status the copy already has is refused with 409 `INVALID_STATUS` and records nothing.
- A refused change changes nothing and records nothing.
- Q-05 (lab-scoped custodian access) is still open with the TA. This contract follows BR-15 as written. If the answer changes BR-15, AC-F06-03 and the scoping here change with it.

### 1.5 Data

No migration. The feature reads and writes `copy` and reads `equipment_type`, `lab`, and `lab_assignment`. It writes `status_history` only through the F-07 recorder. All tables come from SR-03.

## 2. API specification

| Method and path | Access | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /api/custodian/copies` | Custodian | No query parameters | 200 `{ "items": [...] }` with the copies in the custodian's labs, sorted by lab name, then type name, then asset tag | 400 `VALIDATION_ERROR` for any query parameter, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN` for a borrower |
| `PATCH /api/custodian/copies/:id` | Custodian | `{ "status": "AVAILABLE" or "IN_MAINTENANCE" }` | 200 with the changed copy | 400 `VALIDATION_ERROR` with `fields.status`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN` for a borrower, 403 `INVALID_ORIGIN`, 404 `NOT_FOUND`, 409 `INVALID_STATUS`, 503 `SERVICE_BUSY` (arrives with #17: `sprint-1` has no `P2028` mapping before it, so until then a pool timeout returns 500) |

Copy shape, defined in `shared/src/copies.ts`:

`{ id, assetTag, status, equipmentType: { id, name }, lab: { id, name } }`

`status` is one of `AVAILABLE`, `ON_LOAN`, `IN_MAINTENANCE`, and `RETIRED`. The list shows every status, so the custodian sees which copies are out.

Error codes and messages added by this feature, all in the shared shape:

| Status | Code | Message |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | "Check the highlighted fields.", with `fields.status` set to "Choose Available or In maintenance." |
| 400 | `VALIDATION_ERROR` | For a query parameter on the list: "Check the highlighted fields.", with `fields` naming each parameter as "Unknown parameter." |
| 404 | `NOT_FOUND` | "Copy not found." |
| 409 | `INVALID_STATUS` | "A copy that is on loan cannot be changed." for an On loan copy, "This copy already has that status." for the same status, and "This copy cannot be changed to that status." for anything else |

## 3. UI specification

| Area | Specification |
| --- | --- |
| Copies, `/custodian/copies` | Custodian only. A table with lab, equipment, asset tag, status, and an action column. A status is shown as "Available", "On loan", "In maintenance", or "Retired". |
| Action | An Available copy has a "Set In maintenance" button, and an In maintenance copy has a "Set Available" button. An On loan or Retired copy has no button, and shows "Cannot change". |
| Confirmation | The button opens a confirmation in the row: "Change <asset tag> to <status>?" with Confirm and Cancel buttons. Confirm sends the PATCH and is disabled while the request is in flight (SDS 4.2). |
| Success | A message "<asset tag> is now <status>." and the list reloads from the API. |
| Refusal | A 409 shows the API `message` above the table. A 400 with `fields.status` shows the message next to the status control in the row (AC-SR02-02). The list reloads after a 409, because the copy probably changed. |
| Loading | "Loading..." while the list request is in flight (SR-02). |
| Empty | "No copies in your labs." when the list is empty. |
| Error | "Could not load copies." with a Retry button. The Retry button sends the request again. A 401 sends the user to login. |
| Navigation | Custodians get a "Copies" link in the header. The route guard from F-01 sends a borrower to their home page. |

## 4. Acceptance criteria

These are the AC from [traceability.md](../../traceability.md) section 4, unchanged.

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F06-01 | FR-16, BR-08 | A custodian switches a copy in an assigned lab from Available to In maintenance and back. |
| AC-F06-02 | BR-08 | Changing the status of a copy that is On loan is refused, and the status endpoint refuses On loan or Retired as a target status. |
| AC-F06-03 | BR-15, NFR-03 | A borrower who changes a copy status gets 403, and a custodian acting on an unassigned lab gets 404. |

AC-F07-01 and AC-F07-02 apply to F-06 as well. F-06 records one entry for each switch and none for a refused change, and the tests below assert both.

## 5. Test specifications

API tests run against the test database with a fixed clock. Each test creates its own labs, custodians, borrowers, types, and copies, and signs in through the login endpoint. An On loan copy is created with a request and a loan inserted directly, because F-04 is not merged.

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-F06-01 | AC-F06-01, AC-F07-01 | API, UI | A custodian assigned to Lab A and an Available copy in Lab A | `PATCH` the status to `IN_MAINTENANCE`, then to `AVAILABLE`. In the UI, open `/custodian/copies` and switch a copy with the confirmation step. | Each call returns 200 with the copy and its new status, and the database row matches. Two `status_history` rows exist, each with `entity_type` `COPY`, the copy id, the custodian as actor, the old and new status, the lab, and the clock time. The UI sends the PATCH only after Confirm, shows "<asset tag> is now In maintenance.", and reloads the list. |
| TEST-F06-02 | AC-F06-02, AC-F07-02 | API | An On loan copy with an active loan, an Available copy, and a Retired copy, all in the custodian's lab | `PATCH` the On loan copy to `IN_MAINTENANCE` and to `AVAILABLE`. `PATCH` the Available copy to `ON_LOAN` and to `RETIRED`. `PATCH` the Retired copy to `AVAILABLE`. | The On loan copy gets 409 `INVALID_STATUS` both times and stays On loan. The two forbidden targets get 400 `VALIDATION_ERROR` with `fields.status`, and the Available copy stays Available. The Retired copy gets 409 and stays Retired. No `status_history` row exists for any of these copies. |
| TEST-F06-03 | AC-F06-03 | API | A custodian assigned to Lab A only, a borrower, and an Available copy in Lab B | `PATCH` the Lab B copy as the custodian, as the borrower, and with no session. `PATCH` an id that does not exist and the id `abc`. | The custodian gets 404 `NOT_FOUND`, the same as the missing id and the id `abc`. The borrower gets 403 `FORBIDDEN`, and the call with no session gets 401 `UNAUTHENTICATED`. The Lab B copy is unchanged and no history row exists. |

Supporting checks that have no AC of their own:

| Check | Level | Expected result |
| --- | --- | --- |
| List scope | API | The list holds the copies of every assigned lab, in the order in section 2, with every status. A copy in an unassigned lab is not listed. |
| No assigned lab | API | A custodian with no `lab_assignment` row gets 200 with an empty list. A switch returns 404. |
| List access | API | A borrower gets 403 `FORBIDDEN` and a call with no session gets 401 `UNAUTHENTICATED`. |
| Unknown query parameter | API | `GET /api/custodian/copies?status=AVAILABLE` returns 400 `VALIDATION_ERROR`, as SDS 5.1 requires. |
| Body validation | API | A missing body, a missing `status`, a lower-case value, and a non-string value return 400 `VALIDATION_ERROR` with `fields.status`, and change nothing. |
| Same status | API | Setting an Available copy to `AVAILABLE` returns 409 `INVALID_STATUS` and records nothing. |
| Concurrent switches | API | Two parallel calls that set one Available copy to `IN_MAINTENANCE` return one 200 and one 409, and exactly one history row exists. |
| Origin check | API | A PATCH with `Origin: https://evil.example` returns 403 `INVALID_ORIGIN` and changes nothing. |
| Route table | API | Both routes are in the route table with access `CUSTODIAN`, so TEST-SR01-01 returns 401 for them without a session. |
| Loading, empty, and error states | UI | The page shows "Loading...", "No copies in your labs.", and "Could not load copies." with a Retry button, as TEST-SR02-03 requires. A 401 returns the user to the login page. |
| Refusal messages | UI | A 409 shows the API message above the table and reloads the list. A 400 with `fields.status` shows the message in the row (TEST-SR02-02). |
| Actions by status | UI | An Available copy offers "Set In maintenance", an In maintenance copy offers "Set Available", and On loan and Retired copies offer no button. Cancel closes the confirmation and sends nothing. |
| Header link and guard | UI | A custodian sees "Copies" in the header and a borrower does not. A borrower at `/custodian/copies` is sent to `/catalog`. |

## 6. SR rules this feature must satisfy

- SR-01: both routes are `CUSTODIAN` in the route table, so AC-SR01-01 covers them. The wrong-role check (AC-F06-03) is tested on the PATCH endpoint, and the list endpoint has its own check.
- SR-02: the page shows loading, empty, and error states (AC-SR02-03), and the status change shows field messages next to the field (AC-SR02-02). Errors use the shared error shape (AC-SR02-01).
- SR-07: nothing secret is shown or logged. A history entry stores ids and statuses only.

## 7. Definition of Done

- The contract is committed before the tests, and the tests fail before the implementation.
- TEST-F06-01, TEST-F06-02, TEST-F06-03, and the supporting checks pass. The UI parts pass in the client tests.
- Each switch stores one history entry and a refused switch stores none (AC-F07-01 and AC-F07-02 for F-06).
- Lint, format, build, and all existing tests pass.
- Reviewed by @ArmmyC and merged into `sprint-1`, after F-07 (#25) is merged.
