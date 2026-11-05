# Traceability Matrix

Product: Lab Equipment Borrowing System
Sources: [SRS v0.5](srs.md), [Feature inventory v0.1](features.md)
Issue: #2

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-04 | @ArmmyC | First matrix for teammate review. Every FR, BR, and NFR mapped to a feature or system responsibility and a sprint. Sprint 1 rows have planned AC and TEST IDs. Includes fixes from an independent check against the SRS and Part B, and from the PR #9 review. |

## How to read this matrix

- Sections 1 to 3 map every requirement in the SRS to the feature (F-xx) or system responsibility (SR-xx) that implements it, and the sprint that establishes it.
- Sprint 1 rows list planned acceptance criteria (AC) and tests. Section 4 defines them. Each Sprint 1 contract in `docs/sprints/sprint-1/` is the source of truth and may refine them. A contract that changes an ID updates this file in the same pull request.
- Later sprint rows have a feature and sprint now. Their AC and tests are written in that sprint's contracts.
- ID pattern: `AC-F04-05` is acceptance criterion 5 of feature F-04, and `TEST-F04-05` is the test that verifies it. `TEST-E2E-xx` tests are end-to-end journeys that cover several AC.
- Every Sprint 1 feature relies on SR-01 (authorization) and SR-02 (error shape and UI states), which are built with F-01.
- Test levels: Unit (Vitest, no database), API (Vitest and Supertest against the test database), UI (Vitest and Testing Library), E2E (Playwright), Database integration (Vitest against the test database without an API endpoint), Manual (a recorded check, used only where automation does not fit).

## 1. Functional requirements

| Requirement | Summary | Feature or responsibility | Sprint | Planned AC | Planned tests |
| --- | --- | --- | --- | --- | --- |
| FR-01 | Log in with email and password, generic refusal | F-01 | 1 | AC-F01-01, AC-F01-02 | TEST-F01-01, TEST-F01-02, TEST-E2E-02 |
| FR-02 | Log out | F-01 | 1 | AC-F01-03 | TEST-F01-03, TEST-E2E-02 |
| FR-03 | Current-user endpoint, 401 without session, identity kept after reload | F-01 | 1 | AC-F01-04 | TEST-F01-04, TEST-E2E-02 |
| FR-04 | Catalog grouped by lab with available counts | F-02 | 1 | AC-F02-01, AC-F04-09 | TEST-F02-01, TEST-F04-09 |
| FR-05 | Equipment type details | F-02 | 1 | AC-F02-02 | TEST-F02-02 |
| FR-06 | Submit a borrow request | F-03 | 1 | AC-F03-01 | TEST-F03-01, TEST-E2E-01 |
| FR-07 | View own requests and loans | F-03 | 1 | AC-F03-04 | TEST-F03-04, TEST-E2E-01 |
| FR-08 | Custodian pending request list | F-04 | 1 | AC-F04-01 | TEST-F04-01 |
| FR-09 | Custodian records checkout | F-04 | 1 | AC-F04-02, AC-F04-09 | TEST-F04-02, TEST-F04-09, TEST-E2E-01 |
| FR-10 | Borrower cancels own pending request | F-03 | 1 | AC-F03-06 | TEST-F03-06 |
| FR-11 | Custodian rejects a request with a reason | F-08 | 2 | Sprint 2 contract | Sprint 2 contract |
| FR-12 | Custodian records a return | F-09 | 2 | Sprint 2 contract | Sprint 2 contract |
| FR-13 | Overdue status shown | F-10 | 2 | Sprint 2 contract | Sprint 2 contract |
| FR-14 | Custodian active loan list (Sprint 1), overdue status and filter (Sprint 2) | F-05 (active loans), F-10 (overdue) | 1, 2 | AC-F05-01 | TEST-F05-01 |
| FR-15 | Create and edit equipment types | F-12 | 2 | Sprint 2 contract | Sprint 2 contract |
| FR-16 | Copy Available and In maintenance (Sprint 1), add and retire copies (Sprint 2) | F-06 (status), F-13 (add, retire) | 1, 2 | AC-F06-01 | TEST-F06-01 |
| FR-17 | History recording (Sprint 1), history view (Sprint 2) | F-07 (recording), F-14 (view) | 1, 2 | AC-F07-01, AC-F07-02 | TEST-F07-01, TEST-F07-02 |
| FR-18 | Loan renewal | F-16 | 3 | Sprint 3 contract | Sprint 3 contract |
| FR-19 | Search and filter | F-17 | 3 | Sprint 3 contract | Sprint 3 contract |
| FR-20 | Copy and borrower loan history | F-18 | 3 | Sprint 3 contract | Sprint 3 contract |
| FR-21 | Inventory summary | F-19 | 3 | Sprint 3 contract | Sprint 3 contract |

## 2. Business rules

| Requirement | Summary | Feature or responsibility | Sprint | Planned AC | Planned tests |
| --- | --- | --- | --- | --- | --- |
| BR-01 | At most one active loan per copy, even under concurrent checkout | F-04 | 1 | AC-F04-05 | TEST-F04-05 |
| BR-02 | Checkout only of an Available copy of the requested type in the same lab | F-04 | 1 | AC-F04-04 | TEST-F04-04 |
| BR-03 | A request needs at least one Available copy | F-03 | 1 | AC-F03-02 | TEST-F03-02 |
| BR-04 | One Pending request or active loan per type per borrower | F-03 | 1 | AC-F03-03 | TEST-F03-03 |
| BR-05 | Due date is the Bangkok checkout date plus the loan period. Default loan period 7 days, allowed 1 to 30. | F-04 (due date), SR-03 (database constraint), F-12 (edit form, Sprint 2) | 1, 2 | AC-F04-03, AC-SR03-02 | TEST-F04-03, TEST-SR03-02 |
| BR-06 | Allowed request transitions: Fulfilled and Cancelled (Sprint 1), Rejected (Sprint 2) | F-04 (Fulfilled), F-03 (Cancelled), F-08 (Rejected) | 1, 2 | AC-F04-02, AC-F04-08, AC-F03-06, AC-F03-07 | TEST-F04-02, TEST-F04-08, TEST-F03-06, TEST-F03-07 |
| BR-07 | A loan is returned only once | F-09 | 2 | Sprint 2 contract | Sprint 2 contract |
| BR-08 | Allowed copy transitions: checkout and maintenance switch (Sprint 1), return and Retired (Sprint 2) | F-04 (checkout), F-06 (maintenance), F-09 (return), F-13 (Retired) | 1, 2 | AC-F04-02, AC-F06-01, AC-F06-02 | TEST-F04-02, TEST-F06-01, TEST-F06-02 |
| BR-09 | Overdue is calculated from the Bangkok date | F-10 | 2 | Sprint 2 contract | Sprint 2 contract |
| BR-10 | At most 3 active loans, Pending requests counted | F-11 | 2 | Sprint 2 contract | Sprint 2 contract |
| BR-11 | An overdue loan blocks new requests and checkouts | F-11 | 2 | Sprint 2 contract | Sprint 2 contract |
| BR-12 | Asset tags are unique | SR-03 (database constraint), F-13 (create path, Sprint 2) | 1, 2 | AC-SR03-01 | TEST-SR03-01 |
| BR-13 | Rejection reason of 1 to 500 characters | F-08 | 2 | Sprint 2 contract | Sprint 2 contract |
| BR-14 | One renewal, not while overdue | F-16 | 3 | Sprint 3 contract | Sprint 3 contract |
| BR-15 | Custodians act only in assigned labs | SR-01, applied in F-04, F-05, F-06 | 1, every sprint | AC-F04-01, AC-F04-07, AC-F05-02, AC-F06-03 | TEST-F04-01, TEST-F04-07, TEST-F05-02, TEST-F06-03 |
| BR-16 | Borrowers see only their own records, and the catalog hides holders | SR-01, applied in F-02, F-03 | 1, every sprint | AC-F02-03, AC-F03-04, AC-F03-05 | TEST-F02-03, TEST-F03-04, TEST-F03-05 |
| BR-17 | Pending requests do not reserve a copy, and availability is checked again at checkout | F-03, F-04 | 1 | AC-F03-08, AC-F04-04 | TEST-F03-08, TEST-F04-04 |

## 3. Non-functional requirements

| Requirement | Summary | Feature or responsibility | Established | Verified | Planned AC | Planned tests |
| --- | --- | --- | --- | --- | --- | --- |
| NFR-01 | Salted scrypt password hashes | F-01 | 1 | 1 | AC-F01-05 | TEST-F01-05 |
| NFR-02 | Every protected endpoint returns 401 without a session | SR-01 | 1 | Every sprint | AC-SR01-01 | TEST-SR01-01 |
| NFR-03 | Wrong role gets 403, another owner's record or unassigned lab gets 404 | SR-01, applied in F-03, F-04, F-05, F-06 | 1 | Every sprint | AC-F03-05, AC-F03-09, AC-F04-06, AC-F04-07, AC-F05-02, AC-F06-03 | TEST-F03-05, TEST-F03-09, TEST-F04-06, TEST-F04-07, TEST-F05-02, TEST-F06-03 |
| NFR-04 | Hashed session token in an httpOnly cookie, 8 hour idle and 24 hour absolute expiry, logout deletes it | F-01 | 1 | 1 | AC-F01-03, AC-F01-06, AC-F01-07, AC-F01-08 | TEST-F01-03, TEST-F01-06, TEST-F01-07, TEST-F01-08 |
| NFR-05 | 10 simultaneous checkouts of one copy create exactly 1 loan | F-04 | 1 | 1 | AC-F04-05 | TEST-F04-05 |
| NFR-06 | Login rate limit, HTTP 429 | F-15 | 2 | 2 | Sprint 2 contract | Sprint 2 contract |
| NFR-07 | One error shape, field messages, list loading, empty, and error states | SR-02 | 1 | Every sprint | AC-SR02-01, AC-SR02-02, AC-SR02-03 | TEST-SR02-01, TEST-SR02-02, TEST-SR02-03 |
| NFR-08 | Correct dates at the Bangkok day boundary | F-04 (due date), F-10 (overdue) | 1 | 1, 2 | AC-F04-03 | TEST-F04-03 |
| NFR-09 | Fresh clone to running app with seed data in at most 6 commands | SR-03 | 1 | Each release | AC-SR03-03 | TEST-SR03-03 |
| NFR-10 | Data survives restart and redeployment | SR-04 | 1 (local) | 2 (GCP, Lab 5), 3 | AC-SR04-01 | TEST-SR04-01 |
| NFR-11 | CI on every pull request blocks a failing merge | SR-05 | 2 (Lab 5) | 3 | Sprint 2 contract | Sprint 2 contract |
| NFR-12 | At least 80% line coverage of domain services | SR-06 | 2 | 2 | Sprint 2 contract | Sprint 2 contract |
| NFR-13 | No real secrets in Git or the client bundle | SR-07 | 1 | Each release | AC-SR07-01 | TEST-SR07-01 |
| NFR-14 | Catalog and request list within 1 second at p95 on the deployed app | SR-08 | 3 | 3 | Sprint 3 contract | Sprint 3 contract |

## 4. Sprint 1 planned acceptance criteria and tests

The Sprint 1 contracts refine the wording, inputs, and expected results. This list fixes the IDs and the intended coverage. Feature AC belong to their feature contract. SR AC belong to `docs/sprints/sprint-1/system-checks.md`, which holds their test specifications (see [features.md](features.md), section 3).

### F-01 Sign-in, session, and current user

| AC | Requirements | Observable outcome | Test | Level |
| --- | --- | --- | --- | --- |
| AC-F01-01 | FR-01 | A seeded user with the correct email and password gets a session cookie and sees their name and role. | TEST-F01-01 | API, UI |
| AC-F01-02 | FR-01 | A wrong email or a wrong password returns the same generic message, and no session is created. | TEST-F01-02 | API |
| AC-F01-03 | FR-02, NFR-04 | After logout the session row is deleted, and reusing the old cookie returns 401. | TEST-F01-03 | API |
| AC-F01-04 | FR-03 | The current-user endpoint returns id, name, email, and role with a valid session, and 401 without one. After a page reload the UI still shows the logged-in user. | TEST-F01-04, TEST-E2E-02 | API, E2E |
| AC-F01-05 | NFR-01 | The stored password is a salted scrypt hash, and the same password hashed twice gives different hashes. | TEST-F01-05 | Unit, API |
| AC-F01-06 | NFR-04 | A session used just before 8 hours of inactivity is still accepted. A session is refused after 8 hours without use, and after 24 hours from login even when used. | TEST-F01-06 | API with a controllable clock |
| AC-F01-07 | NFR-04 | The session cookie is httpOnly and `SameSite=Lax`, and also `Secure` when `NODE_ENV=production`. The session row stores a hash of the token, not the cookie value. | TEST-F01-07 | API and database, Unit for the production cookie options |
| AC-F01-08 | NFR-04 | A state-changing request whose `Origin` header is not in `APP_ORIGIN` gets 403 `INVALID_ORIGIN` and changes nothing. The same request with an allowed `Origin` succeeds, and one with no `Origin` header is not refused by this check. | TEST-F01-08 | API |

### F-02 Equipment catalog

| AC | Requirements | Observable outcome | Test | Level |
| --- | --- | --- | --- | --- |
| AC-F02-01 | FR-04 | The catalog lists equipment types grouped by lab with the number of Available copies. Copies that are On loan, In maintenance, or Retired are not counted. | TEST-F02-01 | API, UI |
| AC-F02-02 | FR-05 | A type's detail shows description, lab, loan period, and Available count. | TEST-F02-02 | API, UI |
| AC-F02-03 | BR-16 | Catalog and detail responses contain no borrower, loan, or holder data. | TEST-F02-03 | API |

### F-03 Borrow requests

| AC | Requirements | Observable outcome | Test | Level |
| --- | --- | --- | --- | --- |
| AC-F03-01 | FR-06 | A borrower submits a request with an optional purpose note, and it is stored as Pending. | TEST-F03-01 | API, UI |
| AC-F03-02 | BR-03 | A request for a type with no Available copy is refused, and nothing is stored. | TEST-F03-02 | API |
| AC-F03-03 | BR-04 | A second request for a type the borrower already has Pending or on an active loan is refused. Two requests for the same type sent in parallel give one 201 and one 409 `DUPLICATE_REQUEST`, and only one Pending request is stored. | TEST-F03-03 | API |
| AC-F03-04 | FR-07, BR-16 | A borrower sees their own requests and loans with status and dates, and asset tag and due date for loans. The list contains no other borrower's records. The loan part is verified once F-04 exists. | TEST-F03-04 | API, UI |
| AC-F03-05 | BR-16, NFR-03 | A borrower who reads or cancels another borrower's request, or reads another borrower's loan, gets 404, receives no data, and nothing changes. | TEST-F03-05 | API |
| AC-F03-06 | FR-10, BR-06 | A borrower cancels their own Pending request, it becomes Cancelled, and they can request that type again. | TEST-F03-06 | API, UI |
| AC-F03-07 | BR-06 | Cancelling a request that is not Pending is refused, and its status does not change. | TEST-F03-07 | API |
| AC-F03-08 | BR-17 | Submitting a request does not change the Available count of the type. | TEST-F03-08 | API |
| AC-F03-09 | NFR-03 | A custodian who calls the submit request, cancel request, or my requests and loans endpoint gets 403. | TEST-F03-09 | API |

### F-04 Custodian checkout

| AC | Requirements | Observable outcome | Test | Level |
| --- | --- | --- | --- | --- |
| AC-F04-01 | FR-08, BR-15 | A custodian sees Pending requests for their assigned labs only, oldest first. | TEST-F04-01 | API, UI |
| AC-F04-02 | FR-09, BR-08 | Checkout with an Available copy creates an active loan, marks the copy On loan, and marks the request Fulfilled, in one transaction. | TEST-F04-02 | API, UI |
| AC-F04-03 | BR-05, NFR-08 | The due date is the Asia/Bangkok checkout date plus the loan period, correct at 23:59 and 00:00 Bangkok time. The checkout time is stored in UTC and shown in Asia/Bangkok time. | TEST-F04-03 | Unit with a fixed clock |
| AC-F04-04 | BR-02, BR-17 | Checkout with a copy that is not Available, is of another type, or is in another lab is refused, and nothing changes. | TEST-F04-04 | API |
| AC-F04-05 | BR-01, NFR-05 | 10 simultaneous checkouts of the same copy create exactly 1 active loan, and the other 9 are refused. | TEST-F04-05 | API and database |
| AC-F04-06 | NFR-03 | A borrower who calls the pending list or checkout endpoint gets 403. | TEST-F04-06 | API |
| AC-F04-07 | BR-15, NFR-03 | A custodian who acts on a request in an unassigned lab gets 404. | TEST-F04-07 | API |
| AC-F04-08 | BR-06 | Checkout of a request that is not Pending is refused. | TEST-F04-08 | API |
| AC-F04-09 | FR-09, FR-04 | After checkout, the type's Available count in the catalog is 1 lower. | TEST-F04-09 | API |

### F-05 Active loan list

| AC | Requirements | Observable outcome | Test | Level |
| --- | --- | --- | --- | --- |
| AC-F05-01 | FR-14 | A custodian sees active loans in assigned labs with borrower, asset tag, checkout date, and due date. | TEST-F05-01 | API, UI |
| AC-F05-02 | BR-15, NFR-03 | Loans in unassigned labs are not listed, and a borrower who calls the endpoint gets 403. | TEST-F05-02 | API |

### F-06 Copy maintenance status

| AC | Requirements | Observable outcome | Test | Level |
| --- | --- | --- | --- | --- |
| AC-F06-01 | FR-16, BR-08 | A custodian switches a copy in an assigned lab from Available to In maintenance and back. | TEST-F06-01 | API, UI |
| AC-F06-02 | BR-08 | Changing the status of a copy that is On loan is refused, and the status endpoint refuses On loan or Retired as a target status. | TEST-F06-02 | API |
| AC-F06-03 | BR-15, NFR-03 | A borrower who changes a copy status gets 403, and a custodian acting on an unassigned lab gets 404. | TEST-F06-03 | API |

### F-07 Status history recording

| AC | Requirements | Observable outcome | Test | Level |
| --- | --- | --- | --- | --- |
| AC-F07-01 | FR-17 | Each request, loan, and copy status change in F-03, F-04, and F-06 stores one history entry with actor, old status, new status, and time. | TEST-F07-01 | API and database |
| AC-F07-02 | FR-17 | A refused change stores no history entry. | TEST-F07-02 | API and database |

### System responsibilities in Sprint 1

| AC | Requirements | Observable outcome | Test | Level |
| --- | --- | --- | --- | --- |
| AC-SR01-01 | NFR-02 | Every protected endpoint returns 401 and no private data when called without a session. | TEST-SR01-01 | API, one test that loops over the endpoint list |
| AC-SR02-01 | NFR-07 | Every API error, including validation errors with `fields`, uses the shared error shape. | TEST-SR02-01 | API |
| AC-SR02-02 | NFR-07 | Every Sprint 1 form (login, borrow request, checkout copy selection, and copy status change) shows field messages next to the fields. | TEST-SR02-02 | UI |
| AC-SR02-03 | NFR-07 | The catalog, my requests and loans, pending requests, and active loans screens show loading, empty, and error states. | TEST-SR02-03 | UI |
| AC-SR03-01 | BR-12 | The database refuses a second copy with an existing asset tag. | TEST-SR03-01 | Database integration |
| AC-SR03-02 | BR-05 | The database accepts loan periods of 1 and 30 days, refuses 0 and 31, and sets 7 days when none is given. | TEST-SR03-02 | Database integration |
| AC-SR03-03 | NFR-09 | A fresh clone reaches the running app with seed data in at most 6 documented commands. | TEST-SR03-03 | Manual, recorded for the release |
| AC-SR04-01 | NFR-10 | A request, a loan, and a copy status change made before an API and database restart are still there after it. | TEST-SR04-01 | Manual, recorded for the release |
| AC-SR07-01 | NFR-13 | `.env.example` has placeholders only, the built client files contain no secret, and GitHub secret scanning is on with no open alerts. | TEST-SR07-01 | Manual review for the release |

### End-to-end journeys

| Test | Covers | Journey | Level |
| --- | --- | --- | --- |
| TEST-E2E-01 | AC-F03-01, AC-F04-02, AC-F03-04 | A borrower logs in and requests a type. A custodian logs in and records checkout. The borrower sees the active loan with its asset tag and due date. | E2E |
| TEST-E2E-02 | AC-F01-01, AC-F01-03, AC-F01-04 | A user logs in, sees their name and role, reloads the page and still sees them, logs out, and is sent back to the login page. | E2E |

## 5. Coverage check

| Requirement set | Count | Mapped to a feature or responsibility | Sprint 1 rows with planned AC and tests |
| --- | --- | --- | --- |
| FR | 21 (FR-01 to FR-21) | 21 | 13 (FR-01 to FR-10, FR-14, FR-16, FR-17) |
| BR | 17 (BR-01 to BR-17) | 17 | 11 (BR-01 to BR-06, BR-08, BR-12, BR-15 to BR-17) |
| NFR | 14 (NFR-01 to NFR-14) | 14 | 10 (NFR-01 to NFR-05, NFR-07 to NFR-10, NFR-13) |

Uncovered requirements: none. Every FR, BR, and NFR has a feature or system responsibility and a sprint.

Partly covered in Sprint 1, completed later:

| Requirement | Sprint 1 part | Later part |
| --- | --- | --- |
| FR-14 | Active loan list (F-05) | Overdue status and filter (F-10, Sprint 2) |
| FR-16 | Available and In maintenance (F-06) | Add and retire copies (F-13, Sprint 2) |
| FR-17 | Recording (F-07) | View (F-14, Sprint 2) |
| BR-05 | Due date and database constraint (F-04, SR-03) | Edit form validation (F-12, Sprint 2) |
| BR-06 | Fulfilled and Cancelled (F-04, F-03) | Rejected (F-08, Sprint 2) |
| BR-08 | Checkout and maintenance switch (F-04, F-06) | Return and Retired (F-09, F-13, Sprint 2) |
| BR-12 | Database constraint (SR-03) | Copy creation path (F-13, Sprint 2) |
| NFR-08 | Due date (F-04) | Overdue (F-10, Sprint 2) |
| NFR-10 | Local restart (SR-04) | GCP restart and redeploy (Lab 5, Sprint 2) |

## 6. Approved changes and open items

Approved changes are listed in [features.md](features.md), section 4. The only open item is Q-05 (lab-scoped custodian access), which waits for the TA. If the answer changes BR-15, the rows for BR-15, NFR-03, AC-F04-01, AC-F04-07, AC-F05-02, and AC-F06-03 change with it.
