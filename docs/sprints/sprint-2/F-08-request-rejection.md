# F-08 Request Rejection

Product: Lab Equipment Borrowing System
Issue: to confirm (not created yet)
Owner: @Bank848 (plan), drafted for the owner by Claude on 2026-11-22. Reviewer: teammate review pending.
Requirements: FR-11, BR-06 (Rejected), BR-13, BR-15, NFR-03
Depends on: F-04 checkout (merged), F-07 (merged)
Sources: [SRS](../../srs.md) FR-11, BR-06, BR-13; [System-Level SDS](../../system-sds.md) sections 3.2, 3.4, 5.2, 6.1

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-22 | draft for owner | First contract, written before tests. Not yet reviewed by the teammate. |

## 1. Feature-Level SDS

### 1.1 Purpose

A custodian rejects a Pending request in an assigned lab with a required reason. The borrower sees the request as Rejected with the reason and can request the type again.

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Request service | `server/src/requests/service.ts` | `rejectRequest`: conditional update `PENDING` to `REJECTED`, sets `decided_at`, `decided_by_id`, `rejection_reason`, and writes history in the same transaction. |
| Routes | `server/src/requests/routes.ts` | `POST /api/custodian/requests/:id/reject`. |
| Shared schemas | `shared/src/requests.ts` | `rejectRequestBodySchema`: `{ reason: string 1..500 }`. `rejectionReason` is added to the borrower's request item. |
| Migration | `server/prisma/migrations/<new>` | Adds `borrow_request.rejection_reason varchar(500)`, nullable. |
| UI | `client/src/PendingRequestsPage.tsx`, `MyRequestsPage.tsx` | A "Reject" button and dialog. The reason is shown on the borrower's rejected row. |

### 1.3 Rules

- Lookup within assigned labs. Missing, non-integer, or out of scope is 404 (NFR-03).
- Only `PENDING` can be rejected. Otherwise 409 `INVALID_STATUS` (BR-06). Rejected is final.
- The reason is trimmed and must be 1 to 500 characters (BR-13).
- A Rejected request does not count as Pending, so the borrower can request the type again (BR-04).
- The decision time comes from the injected clock.

## 2. API specification

| Method and path | Access | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /api/custodian/requests/:id/reject` | Custodian | `{ "reason": "..." }` | 200 `{ id, status: "REJECTED", rejectionReason, decidedAt }` | 400 `VALIDATION_ERROR` (`fields.reason`), 401, 403 borrower, 404, 409 `INVALID_STATUS` |
| `GET /api/requests` | Borrower | none | existing list. Items now include `rejectionReason`, null unless Rejected. | unchanged |

## 3. UI specification

| Area | Specification |
| --- | --- |
| Pending requests | A "Reject" button per row opens a dialog with a required reason, Cancel and "Confirm reject". |
| Success | The dialog closes, "Rejected the request from <borrower>." shows, and the row is removed. |
| Errors | A field message for 400. "This request is no longer pending." for 409, and the list reloads. |
| My requests | A Rejected request shows its status and the reason. |

## 4. Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F08-01 | FR-11, BR-06 | A custodian rejects a Pending request in an assigned lab. It becomes Rejected with reason, time and actor. |
| AC-F08-02 | BR-13 | A missing, blank, or over-500-character reason returns 400 with `fields.reason` and changes nothing. A 500-character reason is accepted. |
| AC-F08-03 | BR-06 | Rejecting a request that is not Pending (Fulfilled, Cancelled, Rejected) returns 409 and changes nothing. |
| AC-F08-04 | BR-15, NFR-03 | A request in an unassigned lab or an unknown id returns 404. A borrower gets 403 and no session gets 401. |
| AC-F08-05 | FR-11, BR-04 | The borrower sees the Rejected status and reason, and can submit a new request for the same type. |
| AC-F08-06 | FR-17 | The rejection writes a history entry (PENDING to REJECTED) with the custodian as actor, and a refused rejection writes none. |
| AC-F08-07 | SR-02 | The UI dialog shows the success, validation, and 409 states. |

## 5. Test specifications

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-F08-01 | AC-F08-01 | API, DB | A Pending request in the custodian's lab | Reject with a reason | 200. Row REJECTED with `rejection_reason`, `decided_at`, `decided_by_id`. No loan created, copy unchanged. |
| TEST-F08-02 | AC-F08-02 | API | Separate Pending requests | Reasons: missing, three spaces, 501 characters, 500 characters | 400, 400, 400, 200. Nothing stored on 400. |
| TEST-F08-03 | AC-F08-03 | API | Fulfilled, Cancelled, and already Rejected requests | Reject each | 409 `INVALID_STATUS`. Statuses unchanged. |
| TEST-F08-04 | AC-F08-04 | API | A request in Lab B, a custodian of Lab A, a borrower, no session, id `abc` | Reject as each | 404, 403, 401, 404. The request is still PENDING. |
| TEST-F08-05 | AC-F08-05 | API, UI | A rejected request | The borrower lists requests, then submits the same type again | `rejectionReason` shown. The new request returns 201. |
| TEST-F08-06 | AC-F08-06 | API, DB | A Pending request | Reject, then a refused reject | One REQUEST history row PENDING to REJECTED with the actor, none for the refused call |
| TEST-F08-07 | AC-F08-07 | UI | Pending page with one row | Submit an empty reason, then a valid one. Stub a 409. | Field message. Success message and row removed. 409 message and reload. |

## 6. SR rules

SR-01 (the route is `CUSTODIAN`), SR-02, SR-04 (the new column is durable).

## 7. Definition of Done

- Contract committed before tests, tests failing before implementation.
- TEST-F08-01 to TEST-F08-07 executed and passing. Lint, format, build, existing tests pass. The migration applies.
- Teammate review and merge into `sprint-2` (pending).
