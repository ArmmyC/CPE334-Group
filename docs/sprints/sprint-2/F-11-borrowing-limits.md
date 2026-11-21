# F-11 Borrowing Limits

Product: Lab Equipment Borrowing System
Issue: to confirm (not created yet)
Owner: @Bank848 (plan), drafted for the owner by Claude on 2026-11-22. Reviewer: teammate review pending.
Requirements: BR-10, BR-11
Depends on: F-03 borrow requests (merged), F-04 checkout (merged), F-10 overdue status
Sources: [SRS](../../srs.md) BR-10, BR-11, D-10; [System-Level SDS](../../system-sds.md) section 2.5; [F-10 contract](F-10-overdue-status.md)

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-22 | draft for owner | First contract, written before tests. Not yet reviewed by the teammate. |

## 1. Feature-Level SDS

### 1.1 Purpose

Two rules are added to the request and checkout paths. A borrower holds at most 3 active loans, with Pending requests counted (BR-10). A borrower with any overdue loan cannot make new requests, and no checkout is made for them (BR-11).

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Limit rules | `server/src/loans/limits.ts` (new) | `MAX_ACTIVE_LOANS = 3`. `hasOverdueLoan(tx, borrowerId, now)` and `countActiveAndPending(tx, borrowerId)`, both read inside the caller's transaction. |
| Request service | `server/src/requests/service.ts` | `submit` applies the rules after the BR-04 check and before the copy availability check. |
| Checkout service | `server/src/checkout/service.ts` | `checkout` applies the rules after the request is found, locked, and still Pending. |
| UI | none | The existing message area on the request page and the copy dialog already show the API message. |

### 1.3 Rules

- Both rules run inside the transaction that holds the borrower row lock (SDS 2.5), so two parallel requests or a request and a checkout cannot both pass at 2.
- Request creation checks in this order: BR-04 duplicate (409 `DUPLICATE_REQUEST`), BR-11 overdue (409 `HAS_OVERDUE_LOAN`), BR-10 limit (409 `LOAN_LIMIT_REACHED`), then copy availability (409 `NO_AVAILABLE_COPY`).
- BR-10 on request: refused when active loans plus Pending requests already total 3 or more.
- BR-10 on checkout: refused when the borrower already has 3 active loans. Pending requests do not count, because the request being fulfilled is one of them.
- BR-11 on checkout: refused when the borrower has any overdue loan. Overdue is the F-10 rule with the injected clock.
- A refused checkout changes nothing: the request stays Pending, no loan, no copy change, no history.
- Returning the overdue loan (F-09) lifts the block at the next request.

## 2. API specification

| Method and path | Change | New errors |
| --- | --- | --- |
| `POST /api/requests` | Applies BR-11 and BR-10 | 409 `HAS_OVERDUE_LOAN`, 409 `LOAN_LIMIT_REACHED` |
| `POST /api/custodian/requests/:id/checkout` | Applies BR-11 and BR-10 | 409 `HAS_OVERDUE_LOAN`, 409 `LOAN_LIMIT_REACHED` |

Messages: "You have an overdue loan. Return it before you borrow more." and "You already have 3 active loans or Pending requests."

## 3. UI specification

No new UI. The existing error display shows the message.

## 4. Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F11-01 | BR-10 | With 2 active loans and 1 Pending request, a request for a fourth type is refused with 409 `LOAN_LIMIT_REACHED`. With 2 in total, it is accepted. |
| AC-F11-02 | BR-10 | A checkout for a borrower with 3 active loans is refused with 409 `LOAN_LIMIT_REACHED`. With 2 active loans and 2 Pending requests it is accepted. |
| AC-F11-03 | BR-11 | A borrower with an overdue loan is refused a new request with 409 `HAS_OVERDUE_LOAN`. A loan due today is not overdue, so it does not block. |
| AC-F11-04 | BR-11 | A checkout for a borrower with an overdue loan is refused with 409 `HAS_OVERDUE_LOAN`, and the request stays Pending. |
| AC-F11-05 | BR-11 | After the overdue loan is returned, the borrower can request again. |
| AC-F11-06 | BR-10, NFR-05 | Parallel requests for different types by a borrower with 2 slots used give exactly one 201. |

## 5. Test specifications

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-F11-01 | AC-F11-01 | API, DB | 2 active loans, then 1 active and 1 Pending, then 3 total | Request a new type each time | 201 at 2 in total, 409 `LOAN_LIMIT_REACHED` at 3. No new row on 409. |
| TEST-F11-02 | AC-F11-02 | API, DB | 3 active loans and a Pending request, then 2 active loans and 2 Pending requests | Checkout | 409 `LOAN_LIMIT_REACHED` with the request still Pending, then 201 |
| TEST-F11-03 | AC-F11-03 | API | An active loan due yesterday (Bangkok), then one due today | Request | 409 `HAS_OVERDUE_LOAN`, then 201 |
| TEST-F11-04 | AC-F11-04 | API, DB | An overdue loan and a Pending request | Checkout | 409 `HAS_OVERDUE_LOAN`. Request Pending, no loan, copy Available, no history row. |
| TEST-F11-05 | AC-F11-05 | API | An overdue loan | Request (409), return the loan (F-09), request again | 409, 200, 201 |
| TEST-F11-06 | AC-F11-06 | API | 2 slots used, 5 different types with copies | 5 parallel requests | Exactly one 201 and four 409 `LOAN_LIMIT_REACHED` |

## 6. SR rules

SR-02 (error shape).

## 7. Definition of Done

- Contract committed before tests, tests failing before implementation.
- TEST-F11-01 to TEST-F11-06 executed and passing. Lint, format, build, existing tests pass.
- Teammate review and merge into `sprint-2` (pending).
