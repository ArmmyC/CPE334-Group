# Software Requirements Specification

Product: Lab Equipment Borrowing System
Theme: 2, Inventory and Borrowing
Issue: #1

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-03 | @ArmmyC | First draft for teammate review. Decisions marked Proposed need team agreement. |

## 1. Stakeholder problem and context

The Computer Engineering (CPE) department owns lab equipment such as laptops, development boards, oscilloscopes, logic analyzers, and cameras. Students borrow this equipment for coursework and projects. Today the department tracks loans on paper and in spreadsheets, so staff cannot see which units are out, who has them, or which loans are late. Two students sometimes receive the same unit, and late returns are noticed only by chance.

The product replaces this process with a web application. Students request equipment, custodians record checkout and return, and the system keeps every unit, request, and loan in a persistent database with enforced rules.

The equipment is spread across department labs, for example the Embedded Systems Lab and the Network Lab. Each lab has its own custodians.

## 2. Actors and responsibilities

| Actor | Description | Responsibilities |
| --- | --- | --- |
| Borrower | A CPE student with a seeded account | Browse the catalog, submit borrow requests, cancel own pending requests, view own requests and loans |
| Custodian | Lab staff assigned to one or more labs (the equipment administrator) | Maintain equipment and copies in assigned labs, process requests, record checkout and return, monitor overdue loans, view reports for assigned labs |

Each account has exactly one role. Accounts are seeded. There is no self-registration.

## 3. Glossary

| Term | Meaning |
| --- | --- |
| Lab | A department location that holds equipment and has assigned custodians |
| Equipment type | A kind of item in a lab, for example "Arduino Uno R3" in the Embedded Systems Lab |
| Copy | One physical unit of an equipment type, identified by a unique asset tag |
| Borrow request | A borrower's request for one copy of an equipment type |
| Loan | The record that a specific copy was checked out to a borrower, with a due date |
| Active loan | A loan that has been checked out and not yet returned |
| Overdue | An active loan whose due date has passed |

## 4. Scope

### 4.1 In scope

- Login, logout, and current-user identity for seeded accounts
- Catalog of equipment types with live availability per lab
- Borrow requests and their lifecycle (pending, fulfilled, rejected, cancelled)
- Checkout of a specific copy, which creates an active loan
- Return of a loan, including copy condition after return
- Due dates, overdue status, and borrowing restrictions caused by overdue loans
- Inventory management of equipment types and copies by custodians
- Request, loan, and copy history
- Search and filtering of the catalog and loan lists
- Inventory and loan summaries for custodians

### 4.2 Exclusions

- Self-registration, password recovery, email verification, and account administration screens
- Multiple roles per account
- Email, SMS, or push notifications (overdue status is shown in the application only)
- Fines, payments, or deposits
- Advance reservation of equipment for a future date
- Barcode or RFID scanning hardware (asset tags are typed or selected)
- Integration with university identity systems or any external API
- Mobile applications (the web UI must work on a phone browser)

## 5. Functional Requirements

Planned sprint is the sprint that implements the requirement. The feature inventory and traceability matrix (#2) refine this allocation.

| ID | Requirement | Planned sprint |
| --- | --- | --- |
| FR-01 | A user can log in with email and password. A successful login starts a session and shows the user's name and role. | 1 |
| FR-02 | A logged-in user can log out. After logout the session can no longer access protected data. | 1 |
| FR-03 | The application can retrieve the current user's identity and role from the active session. | 1 |
| FR-04 | A borrower can browse the catalog of equipment types, grouped by lab, with the number of available copies for each type. | 1 |
| FR-05 | A borrower can open an equipment type and see its description, lab, loan period, and number of available copies. | 1 |
| FR-06 | A borrower can submit a borrow request for one copy of an equipment type, with an optional purpose note. The request is stored as Pending. | 1 |
| FR-07 | A borrower can view a list of their own requests and loans with status, dates, and, for loans, the asset tag and due date. | 1 |
| FR-08 | A custodian can view the pending requests for equipment in their assigned labs, oldest first. | 1 |
| FR-09 | A custodian can record checkout of a pending request by selecting an available copy. This creates an active loan with a due date, marks the copy On loan, and marks the request Fulfilled. | 1 |
| FR-10 | A borrower can cancel their own pending request. | 2 |
| FR-11 | A custodian can reject a pending request in an assigned lab with a reason. | 2 |
| FR-12 | A custodian can record the return of an active loan with a condition note. The copy becomes Available, or In maintenance if the custodian marks it damaged. | 2 |
| FR-13 | The application shows an Overdue status on active loans whose due date has passed, for both the borrower and the custodian. | 2 |
| FR-14 | A custodian can view active and overdue loans in their assigned labs. | 2 |
| FR-15 | A custodian can create and edit equipment types in their assigned labs, including name, category, description, and loan period. | 2 |
| FR-16 | A custodian can add copies with a unique asset tag and change a copy's status between Available, In maintenance, and Retired. | 2 |
| FR-17 | The system records a history entry for every request, loan, and copy status change, with the actor and time. A custodian can view this history. | 2 |
| FR-18 | A custodian can renew an active loan, which extends its due date. | 3 |
| FR-19 | Borrowers can search and filter the catalog by name, category, lab, and availability. Custodians can filter requests and loans by status, lab, and borrower. | 3 |
| FR-20 | A custodian can view the loan history of a copy and of a borrower within their assigned labs. | 3 |
| FR-21 | A custodian can view an inventory summary for each assigned lab: copies by status, active loans, overdue loans, and most-borrowed equipment types over a chosen date range. | 3 |

## 6. Business Rules

| ID | Rule | Planned sprint |
| --- | --- | --- |
| BR-01 | A copy can have at most one active loan at any time. If two checkouts of the same copy happen at the same moment, exactly one succeeds and the other is rejected. | 1 |
| BR-02 | Checkout is allowed only for a copy that is Available, belongs to the requested equipment type, and is in the same lab. | 1 |
| BR-03 | A borrow request can be submitted only when the equipment type has at least one Available copy at that moment. | 1 |
| BR-04 | A borrower can have at most one Pending request for the same equipment type. A second Pending request for that type is rejected. | 1 |
| BR-05 | The due date of a loan is the checkout date plus the equipment type's loan period in days, counted in Asia/Bangkok time. The default loan period is 7 days. Allowed loan periods are 1 to 30 days. | 1 |
| BR-06 | Request status changes are limited to Pending to Fulfilled (checkout), Pending to Rejected (custodian, reason required), and Pending to Cancelled (the requesting borrower). Fulfilled, Rejected, and Cancelled are final. Any other change is rejected. | 1 (Fulfilled), 2 (Rejected, Cancelled) |
| BR-07 | A loan can change only from Active to Returned, and a return can be recorded only once. | 2 |
| BR-08 | Copy status changes are limited to the following. Available to On loan only by checkout. On loan to Available or In maintenance only by return. Available and In maintenance can switch both ways. Available or In maintenance to Retired. Retired is final. A custodian cannot retire a copy or put it in maintenance while it is On loan. | 1 (checkout), 2 (others) |
| BR-09 | An active loan is Overdue when the current date in Asia/Bangkok is after its due date. Overdue is calculated, not stored. | 2 |
| BR-10 | A borrower can hold at most 3 active loans. A request or checkout that would exceed this limit is rejected. | 2 |
| BR-11 | A borrower who has any overdue loan cannot submit new requests, and no new checkout can be recorded for them until the overdue loan is returned. | 2 |
| BR-12 | Asset tags are unique across the whole system. | 1 |
| BR-13 | A rejection reason is required and is 1 to 500 characters long. | 2 |
| BR-14 | A loan can be renewed only while it is active and not overdue, at most once. Renewal extends the due date by the equipment type's loan period. | 3 |
| BR-15 | A custodian can view and act on equipment, copies, requests, and loans only in the labs they are assigned to. | 1 |
| BR-16 | A borrower can view and act on only their own requests and loans. The catalog shows availability counts but never shows who holds a copy. | 1 |
| BR-17 | Pending requests do not reserve a copy. Availability is checked again at checkout. | 1 |

## 7. Non-Functional Requirements

| ID | Category | Requirement and measurable target | Verification method | Verified in sprint |
| --- | --- | --- | --- | --- |
| NFR-01 | Security | Passwords are stored only as salted scrypt hashes. No plaintext or reversible password is stored. | Unit test of hashing and verification, and an integration test that reads the stored user record and checks the hash format | 1 |
| NFR-02 | Security | 100% of protected API endpoints reject requests without a valid session with HTTP 401 and return no private data. | API test that calls every protected endpoint without a session | 1, repeated each sprint |
| NFR-03 | Security | Role and ownership are enforced by the server. A wrong role gets HTTP 403. A record owned by another borrower, or in a lab the custodian is not assigned to, gets HTTP 404 so its existence is not revealed. | API tests for each protected operation with a wrong role, another borrower, and an unassigned custodian | 1, repeated each sprint |
| NFR-04 | Security | A session expires after 8 hours of inactivity or 24 hours after login, whichever comes first. Logout invalidates the session on the server immediately. | API tests using a controllable clock, and a test that reuses the session cookie after logout | 1 |
| NFR-05 | Integrity | With 10 simultaneous checkout attempts for the same copy, exactly 1 active loan is created and the other 9 are rejected. | API and database integration test that sends parallel requests | 1 |
| NFR-06 | Security | Login is limited to 10 failed attempts per email per 15 minutes. Further attempts get HTTP 429. | API test | 2 |
| NFR-07 | Usability | Every form shows field-level validation messages, and every API error uses one consistent JSON error format. Loading, empty, and error states are shown on every list screen. | API tests for error format, and UI component tests for form validation and list states | 1 |
| NFR-08 | Correctness | Due dates and overdue status are correct at the Asia/Bangkok day boundary. Times are stored in UTC and shown in Asia/Bangkok time. | Unit tests with a fixed clock at 23:59 and 00:00 Bangkok time | 1 (due date), 2 (overdue) |
| NFR-09 | Reproducibility | A fresh clone reaches a running application with seed data using the documented commands, in at most 6 commands. | Fresh-clone check recorded for each release | 1 |
| NFR-10 | Durability | Requests, loans, and copy statuses survive an application restart and a redeployment. | Post-deployment check on GCP after restart and redeploy | Lab 5, then 2 |
| NFR-11 | Maintainability | Every pull request runs lint, build, and the automated tests, and a failing check blocks the merge. | GitHub Actions run history and branch protection settings | Lab 5, then 2 |
| NFR-12 | Maintainability | Server domain logic (request, checkout, return, and rule services) has at least 80% line coverage. | Coverage report from the test run | 2 |
| NFR-13 | Security | No real secrets are committed to Git or included in the client bundle. | Review of `.env.example` and the built client files for each release, plus GitHub secret scanning | 1 |
| NFR-14 | Performance | The catalog and request list API responses take at most 1 second at the 95th percentile for 50 sequential requests on the deployed application with the seed data. | Measurement script run against the deployed application | 3 |

## 8. Assumptions

| ID | Assumption |
| --- | --- |
| A-01 | All users are CPE students or lab staff with accounts created by seed data. |
| A-02 | Each lab has at least one assigned custodian, and a custodian may be assigned to more than one lab. |
| A-03 | Borrowers and custodians meet in person to hand over equipment. The system records the handover but does not control it. |
| A-04 | The seed data contains at least 2 labs, 2 custodians assigned to different labs, 3 borrowers, and enough equipment types and copies to show available, on loan, and in maintenance states. |
| A-05 | All data is synthetic. No real student or staff data is used. |
| A-06 | The application runs in one time zone, Asia/Bangkok. |

## 9. Decisions

| ID | Decision | Rationale | Status |
| --- | --- | --- | --- |
| D-01 | Theme 2 is specialized as CPE department lab equipment lending. | Easy for testers and TAs to understand, and close to the team's own experience | Accepted 2026-11-03 |
| D-02 | Individual copies are tracked by asset tag, not quantities. | Gives a clear exclusive rule (BR-01) and a meaningful concurrency test | Accepted 2026-11-03 |
| D-03 | A request is for an equipment type. The custodian chooses the specific copy at checkout. | Borrowers do not care which unit they get, and custodians know which unit is on the shelf | Proposed |
| D-04 | A request becomes a loan when the custodian records checkout. There is no separate approval step. Rejection is added in Sprint 2. | Matches the Sprint 1 example and keeps one fewer state | Accepted 2026-11-03 |
| D-05 | Pending requests do not reserve a copy (BR-17). | Avoids copies being blocked by requests nobody collects | Proposed |
| D-06 | Custodians are scoped to assigned labs (BR-15). | The brief says custodians manage authorized inventory. This also gives a meaningful authorization test | Proposed |
| D-07 | Default loan period is 7 days, maximum 3 active loans per borrower, and an overdue loan blocks new borrowing. | Simple, testable limits that resemble common lending policies | Proposed |
| D-08 | Access to another borrower's record or an unassigned lab returns 404, and a wrong role returns 403. | Does not reveal whether a record exists | Proposed |
| D-09 | Renewal is done by the custodian, at most once, and only before the due date. | Keeps renewal simple and controlled by staff | Proposed |

## 10. Open questions

| ID | Question | Resolution |
| --- | --- | --- |
| Q-01 | Should pending requests reserve a copy? | Proposed answer in D-05. Confirm with the team. |
| Q-02 | What loan period and active-loan limit should apply? | Proposed answer in D-07. Confirm with the team. |
| Q-03 | Should an overdue loan block new borrowing? | Proposed answer in D-07. Confirm with the team. |
| Q-04 | Can a borrower cancel a pending request? | Yes, FR-10 in Sprint 2. |
| Q-05 | Is lab-scoped custodian access an acceptable reading of "authorized inventory"? | Confirm with the TA. |
