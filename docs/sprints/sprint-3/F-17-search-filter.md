# F-17 Search and Filter

Product: Lab Equipment Borrowing System
Issue: to confirm (not created yet)
Owner: @ArmmyC (plan), drafted for the owner by Claude on 2026-11-22. Reviewer: teammate review pending.
Requirements: FR-19, BR-15, NFR-03
Depends on: F-02 catalog, F-04 checkout, F-05 active loans
Sources: [SRS](../../srs.md) FR-19; [System-Level SDS](../../system-sds.md) sections 5.1, 5.2

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-22 | draft for owner | First contract, written before tests. Contract only, not implemented in this round. Not yet reviewed by the teammate. |

## 1. Feature-Level SDS

### 1.1 Purpose

Borrowers search and filter the catalog by name, category, lab, and availability. Custodians filter their pending requests and active loans by status, lab, and borrower. Filtering is done by the API in the query, not in the page.

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Catalog query | `server/src/equipment-types/` | Adds `q`, `category`, `labId`, `available` to `GET /api/equipment-types`. |
| Custodian queries | `server/src/checkout/`, `server/src/loans/` | Adds `labId` and `borrowerId` (and `status` for requests) to the custodian lists. |
| Shared schemas | `shared/src/` | Strict query schemas, one per list. |
| UI | `CatalogPage.tsx`, `PendingRequestsPage.tsx`, `ActiveLoansPage.tsx` | A filter bar per page. |

### 1.3 Rules

- `q` is a case-insensitive substring match on the type name. It is trimmed, 1 to 100 characters, and `%`, `_`, and `\` match as literal characters.
- `category` and `labId` are exact matches. `available=true` keeps types with at least one Available copy.
- Filters combine with AND. No filter returns the full list as today.
- Custodian filters apply after the assigned-lab scope (BR-15). A `labId` or `borrowerId` outside the scope returns an empty list, not a 404 and not other labs' rows.
- An unknown parameter, a non-integer id, or a bad value returns 400 `VALIDATION_ERROR` with `fields`, the same strict parsing as F-14.

## 2. API specification

| Method and path | Access | Query | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /api/equipment-types` | Signed in | `q`, `category`, `labId`, `available` | 200 same shape as F-02 | 400, 401 |
| `GET /api/custodian/requests` | Custodian | `status`, `labId`, `borrowerId` | 200 same shape as F-04 | 400, 401, 403 |
| `GET /api/custodian/loans` | Custodian | `status`, `overdue`, `labId`, `borrowerId` | 200 same shape as F-05 | 400, 401, 403 |

## 3. UI specification

A search box and Category, Lab, and "Available only" controls above the catalog. A Lab and a Borrower control above each custodian list. The empty sentence is "Nothing matches these filters." with a "Clear filters" button.

## 4. Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F17-01 | FR-19 | `q=SCOPE` finds "Oscilloscope" and "oscilloscope" alike. A `%` in `q` matches only a literal `%`. |
| AC-F17-02 | FR-19 | `category`, `labId`, and `available=true` each narrow the catalog and combine with AND. |
| AC-F17-03 | FR-19, BR-15 | A custodian filters requests and loans by status, lab, and borrower and never sees a lab outside the assignment, even with a foreign `labId`. |
| AC-F17-04 | SR-02 | A bad value or unknown parameter returns 400 `VALIDATION_ERROR` with `fields`. |
| AC-F17-05 | FR-19, SR-02 | The pages send the filters, show the empty sentence, and "Clear filters" restores the full list. |

## 5. Test specifications

| Test | AC | Level | Precondition or input | Expected result |
| --- | --- | --- | --- | --- |
| TEST-F17-01 | AC-F17-01 | API | Types "Oscilloscope", "Logic analyzer", "100% pure kit" | `q=scope` and `q=SCOPE` return the first. `q=%` returns only the third. |
| TEST-F17-02 | AC-F17-02 | API | Types in two labs, categories, with and without Available copies | Each filter and a combination return the exact expected set. |
| TEST-F17-03 | AC-F17-03 | API | Custodian of Lab A, data in Lab B | Each filter returns Lab A rows only. `labId` of Lab B returns an empty list. |
| TEST-F17-04 | AC-F17-04 | API | Bad `labId`, `available=maybe`, empty `q`, `?x=1` | 400 each with `fields`. |
| TEST-F17-05 | AC-F17-05 | UI | Catalog and custodian lists | Filter calls carry the parameters. Empty sentence and Clear filters work. |

## 6. SR rules

SR-01 (routes keep their access levels), SR-02 (400 shape and UI states), SR-08 (the catalog stays inside the response-time target with filters).

## 7. Definition of Done

- Contract committed before tests, tests failing before implementation. TEST-F17-01 to TEST-F17-05 passing, lint, format, build, existing tests pass.
- Teammate review and merge (pending). Not started in this round.
