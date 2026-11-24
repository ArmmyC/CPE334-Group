# CR-L7-01: Lower the maximum loan period from 30 to 14 days (BR-05)

Version 0.1, 2026-11-24. Status: Proposed. Author: Bank848. Review by ArmmyC: not yet done (to confirm). Lab 7 change request.

## 1. Original and new rule

| | Rule |
|---|---|
| Original (accepted Sprint 1, SRS v0.5 BR-05) | Allowed loan periods are 1 to 30 days. The default is 7 days. Enforced by `CHECK (loan_period_days BETWEEN 1 AND 30)` from Sprint 1 and by validation on the edit form from Sprint 2. |
| New | Allowed loan periods are 1 to 14 days. The default stays 7 days. |

Reason: a piece of equipment held for up to a month is unavailable to the other borrowers of that type. Two weeks is the longest hold the lab accepts. A custodian who needs a longer hold uses renewal (F-16, one renewal of one loan period). This is a team decision. No TA approval is needed for Lab 7 (owner, 2026-11-24, to confirm against the Lab 7 handout).

## 2. Scope

In scope: the maximum only. Out of scope: the minimum (1), the default (7), the due date calculation, renewal rules, and the loan history of past loans.

Existing data: an equipment type can already hold a period from 15 to 30 days. The migration lowers every such type to 14 so the new constraint can be added. Only the type changes. A loan that is already active keeps its stored due date, and a returned loan keeps its history. The seed has types of 14 and 3 days, so the seed does not change.

## 3. Behaviour

- API `POST /api/custodian/equipment-types` and `PATCH /api/custodian/equipment-types/:id`: `loanPeriodDays` of 15 or more returns 400 `VALIDATION_ERROR` with the field message `Loan period must be from 1 to 14 days.` and nothing changes. 1 and 14 are accepted. 0 and non-integers stay refused with the existing messages.
- Read schemas (catalog, custodian list): the number is 1 to 14.
- Database: `equipment_type_loan_period_days_check` becomes `BETWEEN 1 AND 14`. An insert or update of 15 is refused.
- UI (F-12 form): the field message shows the new range. The form keeps its own validation, so no `max` attribute is added to the input (a native `max` would block the submit before the page can show its message).
- Renewal (F-16) adds the type's loan period to the due date, so a renewal is at most 14 days. This is a consequence, not a separate change.

## 4. Boundaries and invalid cases

| Input | Result |
|---|---|
| 1 | accepted |
| 14 | accepted |
| 15 | refused (API 400, database check) |
| 30 | refused (accepted before this change) |
| 0, -1, 7.5, "7", null on PATCH | refused as before |
| omitted on create | 7 |

Access: unchanged. Only a CUSTODIAN of the type's lab can create or edit (BR-15). A borrower gets 403, a custodian of another lab gets 404.

## 5. Impact table

| Item | Where | Change |
|---|---|---|
| Requirement | SRS BR-05 | 1 to 30 becomes 1 to 14 |
| Features | `docs/features.md` SR-03 | text 1 to 30 becomes 1 to 14 |
| System SDS | sections 5 (BR-05 row) and 6 (`equipment_type` row) | check and range text |
| Feature SDS | `sprint-1/F-02-catalog.md` (response field range); `sprint-2/F-12-equipment-type-management.md` (validation, AC-F12-03, messages) | range text |
| System checks | `sprint-1/system-checks.md` (check row, AC-SR03-02, TEST-SR03-02) | boundary 30 becomes 14, refused 31 becomes 15 |
| AC | AC-SR03-02, AC-F12-03 | boundaries change. AC-F04-03 (due date) does not change |
| STS | TEST-SR03-02, TEST-F12-03 and the F-12 create/PATCH range tests, TEST-F12-07 (UI message) | boundaries change; a new test for the data migration |
| Code | `shared/src/equipment-types.ts`, `shared/src/catalog.ts` | `max(30)` becomes `max(14)`, messages |
| Persistence | new migration | lower types above 14 to 14, replace the check |
| History | `status_history`, loans | not touched |
| Callers | checkout (`dueDateFor`), renewal (`addDays`) | read the stored period; no code change |
| Tests that use 30 as a valid value | `server/tests/checkout.test.ts` (a 30 day type), `server/tests/due-date.test.ts` (pure function, still valid) | checkout test uses 14; due-date test is unchanged |
| Not affected | borrow requests, return, reject, overdue (BR-09), history views, summary | no use of the maximum |

## 6. Acceptance criteria and tests (new or changed)

| AC | Rule | Test |
|---|---|---|
| AC-SR03-02 (changed) | The database accepts 1 and 14, refuses 0 and 15, sets 7 when none is given. | TEST-SR03-02 (changed) |
| AC-F12-03 (changed) | A period below 1 or above 14, or not an integer, returns 400 with a field message and nothing changes. An omitted period on create becomes 7. | TEST-F12-03 (changed) |
| AC-CR01-01 (new) | The migration lowers an existing type of 15 to 30 days to 14, leaves 1 to 14 as they are, and does not change loans or history. | TEST-CR01-01 (new) |
| AC-CR01-02 (new) | An active loan created before the change keeps its due date. | TEST-CR01-02 (new) |
| AC-F12-07 (changed) | The form shows `Loan period must be from 1 to 14 days.` for 15. | TEST-F12-07 (changed) |

Commit order for this change: this document and the contract edits, then failing tests (they fail on the old code), then the implementation and migration.

## 7. Review

Teammate review of this change request before implementation: not done yet (to confirm). Reviewer: ArmmyC. Record the review text, date and commit here when it exists.
