# F-02 Equipment Catalog

Product: Lab Equipment Borrowing System
Issue: #22
Owner: @Bank848, reviewer @ArmmyC
Requirements: FR-04, FR-05, BR-16
Depends on: F-01 (merged), SR-03 (merged). The request form on the detail page comes from F-03 (@ArmmyC, PR #17).
Sources: [SRS](../../srs.md) section 3 (FR-04, FR-05) and BR-16, [System-Level SDS](../../system-sds.md) sections 3.2, 4, 5.1, 5.2, and 6, [Traceability](../../traceability.md) section 4

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-08 | @Bank848 | First contract, written before the tests (#22). |

## 1. Feature-Level SDS

### 1.1 Purpose

A borrower browses the equipment types, grouped by lab, with the number of copies that can be requested now, and opens a type to read its details. The catalog is read only and never shows who holds a copy. Searching and filtering are Sprint 3 (F-17).

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Catalog service | `server/src/catalog/service.ts` | `listCatalog` returns the types grouped by lab, and `getEquipmentType` returns one type. Both count only `AVAILABLE` copies. |
| Catalog routes | `server/src/catalog/routes.ts` | Refuses unknown query parameters, parses the `:id` path parameter, calls the service, and returns the shapes in section 2. |
| Route table | `server/src/routes.ts` | Adds `GET /api/equipment-types` and `GET /api/equipment-types/:id`, both with access `BORROWER` (SR-01). |
| Shared schemas | `shared/src/catalog.ts` | `catalogResponseSchema` and `equipmentTypeDetailSchema`, used by the API tests and the UI. |
| UI | `client/src/` | `CatalogPage` at `/catalog`, `EquipmentDetailPage` at `/catalog/:typeId`, and the two fetch calls in `api.ts`. |

### 1.3 Read path

Each endpoint runs one read query. The count of Available copies comes from the database in the same query as the type (a relation count filtered on `status = 'AVAILABLE'`), so the number is live and never stored. Copies that are `ON_LOAN`, `IN_MAINTENANCE`, or `RETIRED` are not counted. The queries select only catalog columns of `lab` and `equipment_type`. They never read `loan`, `borrow_request`, or `user`, so a borrower, loan, or holder field cannot reach a response (BR-16). Nothing is written, so no transaction is needed.

### 1.4 Rules

- Only a borrower may read the catalog. A custodian gets 403 and a request with no session gets 401 (SDS 6.1, "Browse catalog and type detail"). A custodian does not need the catalog in Sprint 1, because they work from the custodian screens.
- Every borrower sees every lab and type. The catalog has no per-lab scope.
- A type with no Available copy is still listed, with a count of 0. A lab with no type is not listed.
- The response has no borrower, loan, request, or copy data. Individual copies and asset tags are not returned, only the count.
- The count is a hint, not a reservation (BR-17). F-03 checks availability again when the request is submitted, and F-04 checks again at checkout.
- A non-integer or missing `:id` returns 404 `NOT_FOUND` (SDS 5.1).
- Unknown query parameters return 400 `VALIDATION_ERROR` (SDS 5.1). The search and filter parameters join in Sprint 3.

### 1.5 Data

No migration. The feature reads `lab`, `equipment_type`, and `copy`, all created by SR-03.

## 2. API specification

| Method and path | Access | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /api/equipment-types` | Borrower | None. No query parameters in Sprint 1. | 200 with the catalog grouped by lab | 400 `VALIDATION_ERROR` with the parameter name in `fields` for an unknown query parameter, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN` for a custodian |
| `GET /api/equipment-types/:id` | Borrower | Integer `id` in the path | 200 with the type detail | 400 `VALIDATION_ERROR` for an unknown query parameter, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN` for a custodian, 404 `NOT_FOUND` for a missing or non-integer id |

Catalog response, defined in `shared/src/catalog.ts`:

```json
{
  "items": [
    {
      "lab": { "id": 1, "name": "Embedded Systems Lab" },
      "equipmentTypes": [{ "id": 4, "name": "Arduino Uno R3", "category": "Boards", "availableCount": 3 }]
    }
  ]
}
```

Each item is one lab, and the items are sorted by lab name. The types in a lab are sorted by name. Both sorts are ascending, and ties are broken by id.

Type detail response:

`{ id, name, category, description, loanPeriodDays, lab: { id, name }, availableCount }`

`loanPeriodDays` is the integer 1 to 30 from BR-05. `availableCount` is a whole number of 0 or more.

Error codes used by this feature are `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, and `NOT_FOUND`, all in the shared shape from F-01.

## 3. UI specification

| Area | Specification |
| --- | --- |
| Catalog, `/catalog` | Borrower only. The title is "Equipment catalog". Each lab is a section with the lab name as a heading, and its types listed under it with the category and "N available". Each type name links to `/catalog/:typeId`. A count of 0 reads "0 available". |
| Catalog loading | "Loading..." while the request is in flight (SR-02). |
| Catalog empty | "No equipment types in the catalog yet." when the list is empty. |
| Catalog error | "Could not load the catalog." with a Retry button that sends the request again. When the API sends an error message, that message is shown instead. A 401 sends the user to the login page. |
| Detail, `/catalog/:typeId` | Borrower only. Shows the name as the title, then the description, lab, category, loan period ("7 days", or "1 day"), and "N available". A "Back to catalog" link returns to `/catalog`. |
| Detail loading | "Loading..." while the request is in flight. |
| Detail not found | "Equipment type not found." with a link back to the catalog, when the API returns 404. |
| Detail error | "Could not load this equipment type." with a Retry button, for any other failure. |
| Request form slot | Below the details there is an empty region with `data-testid="request-form-slot"`. F-03 places its `RequestForm` component there, with the type id as `equipmentTypeId`. This feature does not import `RequestForm`, because F-03 is not merged. |
| Navigation | The route guard from F-01 sends a custodian from `/catalog` and `/catalog/:typeId` to their home page. |

The page and the detail are usability only. The API checks the role again (SDS 4.1).

## 4. Acceptance criteria

These are the AC from [traceability.md](../../traceability.md) section 4, unchanged.

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F02-01 | FR-04 | The catalog lists equipment types grouped by lab with the number of Available copies. Copies that are On loan, In maintenance, or Retired are not counted. |
| AC-F02-02 | FR-05 | A type's detail shows description, lab, loan period, and Available count. |
| AC-F02-03 | BR-16 | Catalog and detail responses contain no borrower, loan, or holder data. |

## 5. Test specifications

API tests run against the test database with the fixed clock from F-01. Each test creates its own labs, types, copies, and users. The count test creates its own copies in each status and does not rely on the development seed.

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-F02-01 | AC-F02-01 | API, UI | Two labs. Lab A has type A1 with 2 `AVAILABLE`, 1 `ON_LOAN`, 1 `IN_MAINTENANCE`, and 1 `RETIRED` copy, and type A2 with only an `ON_LOAN` copy. Lab B has type B1 with 1 `AVAILABLE` copy. A signed-in borrower. | Call `GET /api/equipment-types`. Render `/catalog` with the same data. | The API returns two items, one per lab, with A1 count 2, A2 count 0, and B1 count 1. The UI shows each lab as a heading with its types and "2 available", "0 available", and "1 available". |
| TEST-F02-02 | AC-F02-02 | API, UI | Type A1 from above with a description and a loan period of 14 days | Call `GET /api/equipment-types/:id`. Render `/catalog/:typeId`. | The API returns the description, lab, `loanPeriodDays` 14, and `availableCount` 2. The UI shows the same four values. |
| TEST-F02-03 | AC-F02-03 | API | A borrower who has a Pending request, an active loan on a copy of A1, and a custodian assigned to the lab | Call both endpoints as a borrower | The list and detail bodies have exactly the keys in section 2 at every level. No `borrower`, `loan`, `holder`, `request`, `user`, `copy`, or `assetTag` key appears anywhere, and no user name, email, or asset tag appears in the response text. |

Supporting checks that have no AC of their own:

| Check | Level | Expected result |
| --- | --- | --- |
| Live count | API | After a copy changes from `AVAILABLE` to `ON_LOAN` in the database, the next call returns a count that is 1 lower. A new `AVAILABLE` copy raises it by 1. |
| Sort order | API | Labs are sorted by name and types by name within a lab. |
| Empty catalog | API | With no lab and type, the list is `{ "items": [] }`. |
| Lab without types | API | A lab with no type is not listed. |
| Wrong role | API | A custodian gets 403 `FORBIDDEN` on both endpoints, with no data. |
| Missing type | API | An unknown id, `0`, `abc`, `1.5`, and an id above the integer range each return 404 `NOT_FOUND`. |
| Unknown query parameter | API | `?q=arduino` on either endpoint returns 400 `VALIDATION_ERROR` with `fields.q`. |
| Catalog states | UI | The page shows "Loading...", "No equipment types in the catalog yet.", and "Could not load the catalog." with a Retry button that loads again, as TEST-SR02-03 requires. A 401 shows the login page. |
| Detail states | UI | The page shows "Loading...", "Equipment type not found." on 404, and "Could not load this equipment type." with a Retry button on another failure. |
| Request form slot | UI | The detail page has an empty `request-form-slot` region and no form. F-03 changes this test when it places `RequestForm`. |
| Type link | UI | Clicking a type name on the catalog opens its detail page. |
| Route guard | UI | A custodian at `/catalog/1` is sent to `/custodian/requests`. |

## 6. SR rules this feature must satisfy

- SR-01: both endpoints are `BORROWER` in the route table, so AC-SR01-01 covers the 401 case. The wrong-role check is tested on these endpoints.
- SR-02: both pages show loading and error states, and the catalog also shows an empty state (AC-SR02-03). Errors use the shared error shape (AC-SR02-01).
- SR-07: nothing secret is shown or logged.

## 7. Definition of Done

- The contract is committed before the tests, and the tests fail before the implementation.
- TEST-F02-01 to TEST-F02-03 and the supporting checks pass. The UI parts pass in the client tests.
- Lint, format, build, and all existing tests pass.
- Reviewed by @ArmmyC and merged into `sprint-1`.
- When F-03 merges, its pull request places `RequestForm` in the request form slot and updates the slot test.
