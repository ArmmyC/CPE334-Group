# Feature Inventory

Product: Lab Equipment Borrowing System
Source: [SRS v0.5](srs.md)
Issue: #2

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-04 | @ArmmyC | First inventory for teammate review: 19 features and 8 system responsibilities covering FR-01 to FR-21, BR-01 to BR-17, and NFR-01 to NFR-14. Includes fixes from an independent check against the SRS and Part B. |
| 0.2 | 2026-11-07 | @ArmmyC | Section 3 records the contract Issues so far: #12 for SR-03 and #14 for F-01, SR-01, and SR-02. |

## How to read this inventory

- A feature (F-xx) is a user-visible capability that gets its own engineering contract and Issue in the sprint that builds it.
- A system responsibility (SR-xx) is a cross-cutting rule that no single feature owns, such as server-side authorization. It is established in one sprint and verified again in later sprints.
- When the SRS splits a requirement across sprints, each part belongs to the feature that builds it. For example, FR-16 status change is in F-06 (Sprint 1) and FR-16 add and retire is in F-13 (Sprint 2).
- Every Sprint 1 feature relies on SR-01 (authorization) and SR-02 (error shape and UI states). Both are built with F-01, so the Depends on column does not repeat them.
- IDs are stable. A removed feature keeps its ID with the status Withdrawn, and IDs are never reused.
- [traceability.md](traceability.md) maps every requirement to these IDs and lists the planned Sprint 1 acceptance criteria (AC) and tests.

## 1. Features

### Sprint 1

| ID | Feature | Description | Requirements | Depends on |
| --- | --- | --- | --- | --- |
| F-01 | Sign-in, session, and current user | Seeded users log in with email and password, see their name and role, and log out. The session is a hashed random token in the database, sent as an httpOnly cookie, with idle and absolute expiry. | FR-01, FR-02, FR-03, NFR-01, NFR-04 | SR-03 |
| F-02 | Equipment catalog | Borrowers browse equipment types grouped by lab with live available-copy counts, and open a type for its details. Holders are never shown. | FR-04, FR-05, BR-16 | F-01, SR-03 |
| F-03 | Borrow requests | A borrower submits a request for one copy of a type with an optional purpose note, lists their own requests and loans, and cancels their own Pending request. | FR-06, FR-07, FR-10, BR-03, BR-04, BR-06 (Cancelled), BR-16, BR-17, NFR-03 | F-01, F-02, F-07. The loan part of FR-07 is verified once F-04 exists. |
| F-04 | Custodian checkout | A custodian lists Pending requests in assigned labs, oldest first, and records checkout by choosing an Available copy. Checkout creates an active loan with a Bangkok due date, marks the copy On loan, and marks the request Fulfilled. Concurrent checkouts of one copy produce exactly one loan. | FR-08, FR-09, BR-01, BR-02, BR-05, BR-06 (Fulfilled), BR-08 (checkout), BR-15, BR-17, NFR-03, NFR-05, NFR-08 (due date) | F-03, F-07 |
| F-05 | Active loan list | A custodian lists active loans in assigned labs with borrower, asset tag, checkout date, and due date. | FR-14 (active loans), BR-15, NFR-03 | F-04 |
| F-06 | Copy maintenance status | A custodian switches a copy in an assigned lab between Available and In maintenance. A copy that is On loan cannot be changed. | FR-16 (Available and In maintenance), BR-08 (maintenance switch), BR-15, NFR-03 | F-01, F-07, SR-03 |
| F-07 | Status history recording | Every request, loan, and copy status change writes a history entry with the actor, the old and new status, and the time, in the same transaction as the change. F-07 provides the history table and the recording service that F-03, F-04, and F-06 call. There is no history screen in Sprint 1. | FR-17 (recording) | SR-03 |

### Sprint 2

| ID | Feature | Description | Requirements | Depends on |
| --- | --- | --- | --- | --- |
| F-08 | Request rejection | A custodian rejects a Pending request in an assigned lab with a required reason. | FR-11, BR-06 (Rejected), BR-13 | F-04 |
| F-09 | Loan return | A custodian records the return of an active loan with a condition note. The copy becomes Available, or In maintenance if marked damaged. | FR-12, BR-07, BR-08 (return) | F-04 |
| F-10 | Overdue status | Active loans past their due date show Overdue for the borrower and the custodian, and the custodian can list overdue loans only. Overdue is calculated, not stored. | FR-13, FR-14 (overdue), BR-09, NFR-08 (overdue) | F-05 |
| F-11 | Borrowing limits | A borrower can hold at most 3 active loans with Pending requests counted, and any overdue loan blocks new requests and checkouts. These rules are added to the F-03 request and F-04 checkout paths. | BR-10, BR-11 | F-03, F-04, F-10 |
| F-12 | Equipment type management | A custodian creates and edits equipment types in assigned labs, including name, category, description, and loan period. | FR-15, BR-05 (edit form validation) | F-02 |
| F-13 | Copy inventory management | A custodian adds copies with a unique asset tag and retires copies. | FR-16 (add, retire), BR-08 (Retired), BR-12 (create path) | F-06 |
| F-14 | Status history view | A custodian views the history entries recorded by F-07 for records in assigned labs. | FR-17 (view) | F-07 |
| F-15 | Login rate limit | After 10 failed logins for one email in 15 minutes, every login for that email is refused with HTTP 429 until the window ends. | NFR-06 | F-01 |

### Sprint 3

| ID | Feature | Description | Requirements | Depends on |
| --- | --- | --- | --- | --- |
| F-16 | Loan renewal | A custodian renews an active loan once, while it is not overdue, extending the due date by the loan period. | FR-18, BR-14 | F-04, F-10 |
| F-17 | Search and filter | Borrowers search and filter the catalog. Custodians filter requests and loans by status, lab, and borrower. | FR-19 | F-02, F-04, F-05 |
| F-18 | Copy and borrower loan history | A custodian views the loan history of a copy and of a borrower within assigned labs. | FR-20 | F-07, F-09 |
| F-19 | Inventory summary | A custodian views copies by status, active and overdue loans, and the 5 most checked-out types in a date range for each assigned lab. | FR-21 | F-05, F-10, F-13 |

## 2. System responsibilities

| ID | Responsibility | Requirements | Established | Verified again |
| --- | --- | --- | --- | --- |
| SR-01 | Server-side authorization. Every protected endpoint requires a valid session, checks the role, and limits records to the borrower's own or the custodian's assigned labs. A hidden button is not authorization. | BR-15, BR-16, NFR-02, NFR-03 | Sprint 1 | Every sprint, for each new endpoint |
| SR-02 | One API error shape and consistent UI states. Every error uses `{ "error": { "code", "message", "fields" } }`. Forms show field messages, and list screens show loading, empty, and error states. | NFR-07 | Sprint 1 | Every sprint, for each new form and list |
| SR-03 | Data model, migrations, and reproducible seed. The schema enforces unique asset tags and loan periods of 1 to 30 days, and a fresh clone reaches seeded data in at most 6 commands. | BR-05 (database constraint), BR-12, NFR-09 | Sprint 1 | Each release |
| SR-04 | Durable storage. Requests, loans, and copy statuses survive a restart and a redeployment. | NFR-10 | Sprint 1 (local restart) | Sprint 2 on GCP (Lab 5), Sprint 3 |
| SR-05 | CI quality gate. Every pull request runs lint, build, and tests, and a failing check blocks the merge. | NFR-11 | Sprint 2 (Lab 5) | Sprint 3 |
| SR-06 | Test coverage of domain logic. Request, checkout, return, and rule services have at least 80% line coverage. | NFR-12 | Sprint 2 | Sprint 2 |
| SR-07 | Secret handling. No real secret is committed or included in the client bundle. | NFR-13 | Sprint 1 | Each release |
| SR-08 | Response time. The catalog (F-02) and request list (F-03) endpoints answer within 1 second at the 95th percentile on the deployed application with seed data. | NFR-14 | Sprint 3 | Sprint 3 |

## 3. Sprint 1 contracts

Each Sprint 1 feature gets its own contract in `docs/sprints/sprint-1/`, committed before its implementation (Deliverable 1 Part E). The contract is the source of truth for its AC and TEST IDs. If a contract changes an ID, the same pull request updates [traceability.md](traceability.md).

| Feature | Planned contract file | Contract Issue |
| --- | --- | --- |
| F-01 | `docs/sprints/sprint-1/F-01-sign-in.md` | #14 |
| F-02 | `docs/sprints/sprint-1/F-02-catalog.md` | #22 |
| F-03 | `docs/sprints/sprint-1/F-03-borrow-requests.md` | To be created |
| F-04 | `docs/sprints/sprint-1/F-04-checkout.md` | To be created |
| F-05 | `docs/sprints/sprint-1/F-05-active-loans.md` | #18 |
| F-06 | `docs/sprints/sprint-1/F-06-copy-status.md` | To be created |
| F-07 | `docs/sprints/sprint-1/F-07-history-recording.md` | #21 |
| SR-01, SR-02, SR-03, SR-04, SR-07 | `docs/sprints/sprint-1/system-checks.md` | #12 adds the file with the SR-03 section, #14 adds SR-01 and SR-02, and #19 adds SR-04 and SR-07. |

`system-checks.md` holds the test specifications (preconditions, input, action, expected result) for every Sprint 1 SR acceptance criterion, AC-SR01-01 to AC-SR07-01. Each feature contract also lists the SR rules it must satisfy.

## 4. Approved changes

These scope changes were agreed in the SRS reviews and are reflected above.

| Change | Where agreed | Effect on this inventory |
| --- | --- | --- |
| Custodian copy status change, active-loan view, and history recording moved into Sprint 1 | SRS v0.2 | F-05, F-06, and F-07 are Sprint 1 features |
| Borrower cancel (FR-10) moved from Sprint 2 to Sprint 1 | SRS v0.4, D-12, PR #6 | Cancel is part of F-03 |
| History recording (FR-17) stays in Sprint 1 | SRS D-11, PR #6 review | F-07 is a Sprint 1 feature |

## 5. Open items

| Item | Effect |
| --- | --- |
| Contingency, not an approved change: if Sprint 1 runs short, F-07 is the first feature to move to Sprint 2, as discussed in the PR #6 review. The sprint plan (#4) records this. | Moving it would need an SRS change to FR-17 and D-11 reviewed by both members, and AC-F07-01 and AC-F07-02 would move to Sprint 2. |
| Q-05 in the SRS: is lab-scoped custodian access an acceptable reading of "authorized inventory"? Waits for the TA. | If the TA says no, BR-15 and SR-01 change, and F-04, F-05, and F-06 lose the assigned-lab check. |
