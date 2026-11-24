# F-12 Equipment Type Management

Product: Lab Equipment Borrowing System
Issue: to confirm (not created yet)
Owner: @Bank848 (plan), drafted for the owner by Claude on 2026-11-22. Reviewer: teammate review pending.
Requirements: FR-15, BR-05 (edit form validation), BR-15
Depends on: F-02 catalog (merged)
Sources: [SRS](../../srs.md) FR-15, BR-05, BR-15; [System-Level SDS](../../system-sds.md) sections 5.1, 5.3

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-22 | draft for owner | First contract, written before tests. Not yet reviewed by the teammate. |

## 1. Feature-Level SDS

### 1.1 Purpose

A custodian creates equipment types and edits them in the labs they are assigned to: name, category, description, and loan period in days (1 to 14). A new loan uses the loan period of the type at checkout. Loans already made keep the due date they were given.

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Shared schemas | `shared/src/equipment-types.ts` (new) | `equipmentTypeBodySchema`, `custodianEquipmentTypeSchema`, `custodianEquipmentTypesResponseSchema`. |
| Service | `server/src/equipment-types/service.ts` (new) | `list`, `create`, `update`. Every query is scoped to the custodian's assigned labs. |
| Routes | `server/src/equipment-types/routes.ts` (new), `server/src/routes.ts` | Three CUSTODIAN routes (section 2). |
| UI | `client/src/EquipmentTypesPage.tsx` (new), `client/src/App.tsx`, `client/src/api.ts` | A page at `/custodian/equipment-types` with the list, a create form, and an edit dialog. |

No migration from F-12 itself: the table and the unique (`lab_id`, `name`) exist (Sprint 1). The range check is 1 to 14 since CR-L7-01, which has its own migration.

### 1.3 Rules

- Scope (BR-15): the custodian sees and changes only types of labs they are assigned to. A create for a lab they are not assigned to, and an edit of a type in another lab, both return 404, so another lab's existence is not revealed.
- The lab of an existing type cannot be changed.
- Fields are trimmed. `name` is 1 to 100 characters, `category` 1 to 50, `description` 1 to 1000, `loanPeriodDays` an integer from 1 to 14 (BR-05, CR-L7-01). `loanPeriodDays` defaults to 7 on create when omitted.
- The name is unique inside a lab. A second type with the same name in the same lab returns 409 `DUPLICATE_NAME`, on create and on edit. The same name in another lab is allowed. The 409 comes from the unique index, so two parallel requests cannot both succeed.
- An edit that changes nothing is accepted (200).
- Changing the loan period does not change any existing loan or its due date.
- Equipment types are not deleted in Sprint 2. Status history (F-07) covers requests, loans, and copies, so type changes are not recorded in it.

## 2. API specification

| Method and path | Access | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /api/custodian/equipment-types` | CUSTODIAN | none | 200 `{ labs: [{ id, name }], items: [{ id, name, category, description, loanPeriodDays, lab: { id, name } }] }`, labs the custodian is assigned to and their types, ordered by lab name, type name | 400 for a query parameter |
| `POST /api/custodian/equipment-types` | CUSTODIAN | `{ labId, name, category, description, loanPeriodDays? }` | 201 the item | 400 `VALIDATION_ERROR` with `fields`, 404 `NOT_FOUND` (lab not assigned), 409 `DUPLICATE_NAME` |
| `PATCH /api/custodian/equipment-types/:id` | CUSTODIAN | `{ name, category, description, loanPeriodDays }` | 200 the item | 400, 404 `NOT_FOUND` (missing or another lab), 409 `DUPLICATE_NAME` |

A BORROWER or no session gets 403 or 401 from the route table (SR-01).

## 3. UI specification

A custodian page "Equipment types" lists the types by lab with the loan period, a create form (lab select, name, category, description, loan period), and an Edit button per row that opens a dialog with the same fields (lab not editable). Validation messages from `fields` show next to the inputs. After a save the list refreshes and a notice says "Saved." A 409 shows "A type with this name already exists in this lab." on the name field.

## 4. Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F12-01 | FR-15 | A custodian creates a type in an assigned lab and it appears in the catalog (F-02) with 0 available copies. |
| AC-F12-02 | FR-15 | A custodian edits name, category, description, and loan period of a type in an assigned lab. |
| AC-F12-03 | BR-05 | A loan period below 1 or above 14, or not an integer, returns 400 with a field message and nothing changes. An omitted period on create becomes 7. |
| AC-F12-04 | BR-15 | Create in an unassigned lab and edit of a type in another lab return 404 and change nothing. The list shows only assigned labs. |
| AC-F12-05 | FR-15 | A duplicate name in one lab returns 409 `DUPLICATE_NAME` on create and edit. The same name in another lab is accepted. Parallel creates with one name give one 201 and the rest 409. |
| AC-F12-06 | FR-15 | A new loan made after the edit gets a due date from the new period. An existing loan keeps its due date. |
| AC-F12-07 | FR-15 | The page lists types, creates, edits, and shows validation and duplicate messages. |

## 5. Test specifications

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-F12-01 | AC-F12-01 | API, DB | Custodian assigned to Lab A | POST a valid type, then GET the catalog | 201 with the fields. The catalog lists it with `availableCount` 0. |
| TEST-F12-02 | AC-F12-02 | API, DB | A type in Lab A | PATCH all four fields | 200 with the new values. The row has them. |
| TEST-F12-03 | AC-F12-03 | API | Same | Periods 0, 15, 7.5, "7"; omitted period on create; empty or 101-character name | 400 `VALIDATION_ERROR` with the field named, row unchanged. Omitted period gives 7. |
| TEST-F12-04 | AC-F12-04 | API, DB | Labs A (assigned) and B (not) | POST with lab B. PATCH a type of lab B. GET | 404 twice with no change. The list has only lab A. |
| TEST-F12-05 | AC-F12-05 | API, DB | Type "Scope" in Lab A | Create "Scope" in Lab A. Rename another type to "Scope". Create "Scope" in Lab C. 5 parallel creates of one new name | 409 `DUPLICATE_NAME` twice, 201 for Lab C. Parallel: one 201, four 409. |
| TEST-F12-06 | AC-F12-06 | API | A type with period 7 and an active loan due on day 7 | PATCH period to 10, then check out a new request | The old loan keeps its due date. The new loan is due 10 days after checkout. |
| TEST-F12-07 | AC-F12-07 | UI | Page with stubbed API | Create with a duplicate name. Edit a type. Enter period 40 | The 409 message is on the name field. The edit calls PATCH and the list refreshes. The 400 field message shows. |

## 6. SR rules

SR-01 (access: three new routes in the route table, checked by the AC-SR01-01 test). SR-02 (error shape). SR-03 (no migration: the unique name exists and the check is 1 to 14 since CR-L7-01).

## 7. Definition of Done

- Contract committed before tests, tests failing before implementation.
- TEST-F12-01 to TEST-F12-07 executed and passing. Lint, format, build, existing tests pass.
- Teammate review and merge into `sprint-2` (pending).
