# F-05 Active Loan List

Product: Lab Equipment Borrowing System
Issue: #18
Owner: @ArmmyC, reviewer @Bank848
Requirements: FR-14, BR-15, NFR-03
Depends on: F-01 (merged), F-04 checkout (@Bank848, which writes the loans this list shows). The contract can be written before F-04 merges, but the tests that use the checkout path wait for it.
Sources: [SRS](../../srs.md) section 3 (FR-14), [System-Level SDS](../../system-sds.md) sections 4, 5.1, 5.2, 6.2, and 7, [Traceability](../../traceability.md) section 4

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-07 | @ArmmyC | First contract, written before the tests (#18). |
| 0.2 | 2026-11-07 | @ArmmyC | Review fixes on #20: unknown query parameters return 400, and the SDS 5.1 source is cited. |

## 1. Feature-Level SDS

### 1.1 Purpose

A custodian sees the loans that are still out in the labs they are assigned to, with who has each copy and when it is due. The list is read only. Returning a loan is Sprint 2 (F-09), and the overdue filter is Sprint 2 (F-10).

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Loan service | `server/src/loans/service.ts` | Adds `listActiveForCustodian`, which reads the custodian's assigned labs and returns the matching active loans. |
| Loan routes | `server/src/loans/routes.ts` | Validates the `status` query, calls the service, and returns the response shape in section 2. |
| Route table | `server/src/routes.ts` | Adds `GET /api/custodian/loans` with access `CUSTODIAN` (SR-01). |
| Shared schemas | `shared/src/loans.ts` | `custodianLoanSchema` and `custodianLoansQuerySchema`, used by the API and the UI. |
| UI | `client/src/` | The Active loans page at `/custodian/loans`, a header link for custodians, and the fetch call. |

### 1.3 Read path

`GET /api/custodian/loans` runs one query. It reads the custodian's rows in `lab_assignment`, then returns the `ACTIVE` loans whose copy's equipment type is in one of those labs. The lab filter is part of the query, so a loan in another lab is never read into memory and then dropped. No transaction is needed because nothing is written.

### 1.4 Rules

- A custodian sees only loans in the labs they are assigned to (BR-15, SR-01). The API applies that filter on every request, and the UI does not decide what is shown.
- A custodian with no assigned lab gets an empty list, not an error.
- The list shows only `ACTIVE` loans in Sprint 1. A `RETURNED` loan is not listed, because returns are Sprint 2.
- A borrower or a request with no session gets the same refusals as every other custodian route (NFR-03).
- Q-05 (lab-scoped custodian access) is still open with the TA. This contract follows BR-15 as written. If the answer changes BR-15, AC-F05-02 and this read path change with it.

### 1.5 Data

No migration. The feature reads `loan`, `copy`, `equipment_type`, `lab`, `lab_assignment`, and `user`, all created by SR-03 and F-04.

## 2. API specification

| Method and path | Access | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /api/custodian/loans` | Custodian | Optional query `status`. Only `ACTIVE` is allowed in Sprint 1, and it is the default. | 200 with the active loans in the custodian's labs, sorted by `dueDate` ascending, then `checkedOutAt` ascending, then `id` | 400 `VALIDATION_ERROR` with `fields.status` for another value, 400 `VALIDATION_ERROR` for an unknown query parameter, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN` for a borrower |

Response shape, defined in `shared/src/loans.ts`:

`{ id, borrower: { id, name }, equipmentType: { id, name }, lab: { id, name }, assetTag, checkedOutAt, dueDate, status }`

`checkedOutAt` is an ISO timestamp. `dueDate` is a calendar date in `YYYY-MM-DD` form (SDS 8). `status` is always `ACTIVE` in Sprint 1.

## 3. UI specification

| Area | Specification |
| --- | --- |
| Active loans, `/custodian/loans` | Custodian only. A table with borrower, equipment, lab, asset tag, checked out, and due date. Checked out is shown in Asia/Bangkok time, and due date as the calendar date. |
| Loading | "Loading..." while the request is in flight (SR-02). |
| Empty | "No active loans in your labs." when the list is empty. |
| Error | "Could not load active loans." with a Retry button. The Retry button sends the request again. |
| Navigation | Custodians get an "Active loans" link in the header. The route guard from F-01 sends a borrower to their home page. |

## 4. Acceptance criteria

These are the AC from [traceability.md](../../traceability.md) section 4, unchanged.

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F05-01 | FR-14 | A custodian sees active loans in assigned labs with borrower, asset tag, checkout date, and due date. |
| AC-F05-02 | BR-15, NFR-03 | Loans in unassigned labs are not listed, and a borrower who calls the endpoint gets 403. |

## 5. Test specifications

API tests run against the test database with the fixed clock from F-01. Each test creates its own labs, custodians, borrowers, types, copies, and loans. Loans are inserted directly, because F-04 is not merged when these tests are written. The E2E checkout journey is added to TEST-E2E-01 with F-04.

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-F05-01 | AC-F05-01 | API, UI | A custodian assigned to Lab A. Two `ACTIVE` loans in Lab A with due dates 2026-11-13 and 2026-11-10, one `RETURNED` loan in Lab A, and one `ACTIVE` loan in Lab B. | Call `GET /api/custodian/loans`. Open `/custodian/loans`. | The API returns the two Lab A `ACTIVE` loans, the 2026-11-10 one first, with the fields in section 2. The returned loan and the Lab B loan are not listed. The UI shows the same two rows. |
| TEST-F05-02 | AC-F05-02 | API | An `ACTIVE` loan in Lab B, which the custodian is not assigned to, and a borrower and a session-less caller | Call the endpoint as the custodian, as the borrower, and with no session | The Lab B loan is not in the custodian's list. The borrower gets 403 `FORBIDDEN`, and the session-less call gets 401 `UNAUTHENTICATED`. |

Supporting checks that have no AC of their own:

| Check | Level | Expected result |
| --- | --- | --- |
| Two assigned labs | API | A custodian assigned to two labs sees the active loans of both, in one list. |
| No assigned lab | API | A custodian with no `lab_assignment` row gets 200 with an empty list. |
| Status query | API | Omitting `status` and `status=ACTIVE` both return the same list. Any other value returns 400 `VALIDATION_ERROR` with `fields.status`. |
| Unknown query parameter | API | A request with `?overdue=true`, a Sprint 2 filter, or any other unknown parameter returns 400 `VALIDATION_ERROR`, as SDS 5.1 requires. |
| Sort order | API | Loans with the same due date are ordered by checkout time, then by id. |
| Loading, empty, and error states | UI | The page shows "Loading...", "No active loans in your labs.", and "Could not load active loans." with a Retry button, as TEST-SR02-03 requires. |
| Header link | UI | A custodian sees "Active loans" in the header, and a borrower does not. |
| Route guard | UI | A borrower at `/custodian/loans` is sent to `/catalog`. |

## 6. SR rules this feature must satisfy

- SR-01: `GET /api/custodian/loans` is `CUSTODIAN` in the route table, so AC-SR01-01 covers it. The wrong-role check (AC-F05-02) is tested on this endpoint.
- SR-02: the page shows loading, empty, and error states (AC-SR02-03). Errors use the shared error shape (AC-SR02-01).
- SR-07: nothing secret is shown or logged.

## 7. Definition of Done

- The contract is committed before the tests, and the tests fail before the implementation.
- TEST-F05-01, TEST-F05-02, and the supporting checks pass. The UI part of TEST-F05-01 and the header link pass in the client tests.
- Lint, format, build, and all existing tests pass.
- Reviewed by @Bank848 and merged into `sprint-1`.
