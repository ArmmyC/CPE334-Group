# F-13 Copy Inventory Management

Product: Lab Equipment Borrowing System
Issue: to confirm (not created yet)
Owner: @Bank848 (plan), drafted for the owner by Claude on 2026-11-22. Reviewer: teammate review pending.
Requirements: FR-16 (add, retire), BR-08 (Retired), BR-12 (create path), BR-15
Depends on: F-06 copy status (merged), F-07 history recording (merged), F-12 equipment types
Sources: [SRS](../../srs.md) FR-16, BR-08, BR-12, BR-15; [System-Level SDS](../../system-sds.md) sections 3.2, 5.1, 5.2; [F-06 contract](../sprint-1/F-06-copy-status.md)

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-22 | draft for owner | First contract, written before tests. Not yet reviewed by the teammate. |

## 1. Feature-Level SDS

### 1.1 Purpose

A custodian adds copies to an equipment type in an assigned lab, each with an asset tag that is unique in the whole system, and retires copies that are no longer in use. A retired copy is final: it is never available again. Both changes write history (F-07).

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Shared schemas | `shared/src/copies.ts` | `changeableCopyStatusSchema` accepts `RETIRED`. New `createCopyBodySchema` `{ equipmentTypeId, assetTag }`. |
| Copy service | `server/src/copies/service.ts` | `create(custodianId, body)`. `changeStatus` allows Available or In maintenance to Retired. |
| Routes | `server/src/copies/routes.ts`, `server/src/routes.ts` | New `POST /api/custodian/copies` (CUSTODIAN). `PATCH /api/custodian/copies/:id` accepts `RETIRED`. |
| UI | `client/src/CopiesPage.tsx`, `client/src/api.ts` | An add-copy form and a Retire action with confirmation. |

No migration: `asset_tag` is already unique and `RETIRED` is already a status (Sprint 1).

### 1.3 Rules

- Scope (BR-15): a copy can be added only to a type in an assigned lab, and retired only in an assigned lab. Another lab returns 404, so its existence is not revealed.
- A new copy starts as Available. Creating it writes one history entry: copy, old status none, new status Available, the custodian as actor, in the same transaction as the insert.
- `assetTag` is trimmed, 1 to 50 characters. It is unique across all labs (BR-12) by exact match after trimming. A duplicate returns 409 `DUPLICATE_ASSET_TAG` and nothing is written, history included. The unique index decides, so parallel creates with one tag give one 201.
- Retire (BR-08): Available to Retired and In maintenance to Retired are allowed. On loan to Retired is refused with 409 `INVALID_STATUS` ("A copy that is on loan cannot be changed."). Retired to anything, including Retired to Retired, is refused with 409 `INVALID_STATUS`. Retiring writes one history entry with the real old status.
- The status change is decided by a conditional update on the status that was read, so two parallel retire requests give one 200 and one 409, and exactly one history entry.
- A retired copy stays in the custodian list as Retired and is never counted as available (F-02) or offered at checkout (F-04).
- `ON_LOAN` stays refused as a target (400). The 400 message for a bad target is now "Choose Available, In maintenance, or Retired." This changes the F-06 message and TEST-F06-02, which is updated with this feature.
- No delete of copies in Sprint 2.

## 2. API specification

| Method and path | Access | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /api/custodian/copies` | CUSTODIAN | `{ equipmentTypeId, assetTag }` | 201 the copy in the F-06 list shape, status `AVAILABLE` | 400 `VALIDATION_ERROR` with `fields`, 404 `NOT_FOUND` (type missing or in another lab), 409 `DUPLICATE_ASSET_TAG` |
| `PATCH /api/custodian/copies/:id` | CUSTODIAN | `{ status }` with `AVAILABLE`, `IN_MAINTENANCE`, or `RETIRED` | 200 the copy | 400, 404, 409 `INVALID_STATUS` (unchanged from F-06) |

## 3. UI specification

The copies page gets an "Add copy" form: equipment type select (types of the custodian's labs, from the F-12 list endpoint) and asset tag. A 409 shows "This asset tag is already in use." on the tag field. For an Available or In maintenance copy the action column also shows "Retire", which asks for confirmation ("Retire <tag>? This cannot be undone.") before it sends the request. On loan and Retired copies show no action.

## 4. Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F13-01 | FR-16 | A custodian adds a copy to a type in an assigned lab. It is Available, appears in the copy list, and counts in the catalog `availableCount`. |
| AC-F13-02 | FR-17, F-07 | The add writes one history entry: no old status, new status Available, the custodian as actor, the lab of the type. |
| AC-F13-03 | BR-12 | A duplicate asset tag, in the same lab or another, returns 409 and creates nothing. Parallel creates with one tag give one 201. An empty or 51-character tag returns 400. |
| AC-F13-04 | BR-15 | Adding to a type in another lab, retiring a copy in another lab, and a missing type or copy return 404 and change nothing. |
| AC-F13-05 | BR-08 | Available and In maintenance copies can be retired, with one history entry each holding the real old status. |
| AC-F13-06 | BR-08 | An On loan copy and a Retired copy cannot be retired. A Retired copy cannot be changed to any status. Nothing is written. |
| AC-F13-07 | BR-08 | Two parallel retire requests for one copy give one 200, one 409, and one history entry. |
| AC-F13-08 | FR-16 | A retired copy is not counted as available and is not offered at checkout. |
| AC-F13-09 | FR-16 | The page adds a copy, shows the duplicate tag message, and retires a copy only after confirmation. |

## 5. Test specifications

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-F13-01 | AC-F13-01, AC-F13-02 | API, DB | Custodian assigned to Lab A, a type with 1 Available copy | POST a valid copy | 201, status AVAILABLE, in the list, catalog count 2. One history row with null old status, AVAILABLE, the custodian, the lab. The tag is trimmed. |
| TEST-F13-02 | AC-F13-03 | API, DB | A copy tagged "A-1" in Lab A and a type in Lab C | Add "A-1" to Lab A and to Lab C. Empty and 51-character tags. 5 parallel adds of one tag | 409 `DUPLICATE_ASSET_TAG` twice with no new row or history. 400 for the bad tags. Parallel: one 201, four 409. |
| TEST-F13-03 | AC-F13-04 | API, DB | Labs A (assigned) and B | Add to a type in B and to a missing type. Retire a copy in B | 404 each, no row, no history, the copy unchanged. A borrower gets 403, no session 401. |
| TEST-F13-04 | AC-F13-05 | API, DB | One Available and one In maintenance copy | PATCH each to RETIRED | 200, status RETIRED, one history row each with the real old status. |
| TEST-F13-05 | AC-F13-06 | API, DB | An On loan copy and a Retired copy | PATCH On loan to RETIRED. PATCH Retired to RETIRED, AVAILABLE, IN_MAINTENANCE. PATCH to ON_LOAN | 409 `INVALID_STATUS` with the F-06 messages, 400 for ON_LOAN with "Choose Available, In maintenance, or Retired.". No history. |
| TEST-F13-06 | AC-F13-07 | API, DB | One Available copy | 5 parallel PATCH to RETIRED | One 200, four 409, one history row. |
| TEST-F13-07 | AC-F13-08 | API | A type with one Available copy and a Pending request | Retire the copy, then read the catalog and the available copies for the request | Catalog count 0. The copy is not in the available copies. |
| TEST-F13-08 | AC-F13-09 | UI | Page with stubbed API | Add a copy. Add a duplicate tag. Retire a copy, first cancelling | POST with the body, list refreshed. The 409 message on the tag field. Cancel sends nothing, Confirm sends PATCH `RETIRED`. |

## 6. SR rules

SR-01 (the new route is in the route table, checked by the AC-SR01-01 test). SR-02 (error shape). SR-03 (no migration: the unique asset tag already exists). SR-06 (the copy service is covered by tests that include the history entry).

## 7. Definition of Done

- Contract committed before tests, tests failing before implementation.
- TEST-F13-01 to TEST-F13-08 executed and passing. TEST-F06-02 updated for the new message and still passing. Lint, format, build, existing tests pass.
- Teammate review and merge into `sprint-2` (pending).
