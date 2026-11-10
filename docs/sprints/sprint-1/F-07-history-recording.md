# F-07 Status History Recording

Product: Lab Equipment Borrowing System
Issue: #21
Owner: @Bank848, reviewer @ArmmyC
Requirements: FR-17 (recording)
Depends on: SR-03 (the `status_history` table, merged), F-01 (the `Clock` type, merged)
Used by: F-03 (@ArmmyC), F-04 and F-06 (@Bank848)
Sources: [SRS](../../srs.md) section 3 (FR-17), [System-Level SDS](../../system-sds.md) sections 2.5, 3.3, 3.4, and 8, [Traceability](../../traceability.md) section 4

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-08 | @Bank848 | First contract, written before the tests (#21). |

## 1. Feature-Level SDS

### 1.1 Purpose

Every status change of a borrow request, a loan, or a copy leaves one history entry with the actor, the old status, the new status, and the time. The entry is written in the same database transaction as the change, so both commit or both roll back. F-07 gives F-03, F-04, and F-06 one function to call. There is no history screen and no history endpoint in Sprint 1. The custodian view is F-14 in Sprint 2.

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| History recorder | `server/src/history/service.ts` | `recordStatusChange(tx, clock, change)`. Finds the lab of the record and inserts one `status_history` row through the caller's transaction client. |

No route, no shared schema, no UI, and no migration. The table comes from SR-03. The route table and `shared/src/index.ts` are not touched.

### 1.3 The function

```ts
recordStatusChange(
  tx: Prisma.TransactionClient,
  clock: Clock,
  change: StatusChange,
): Promise<void>
```

`StatusChange` is one of three shapes, so a request status cannot be recorded as a copy status:

| `entityType` | `entityId` | `oldStatus` | `newStatus` |
| --- | --- | --- | --- |
| `REQUEST` | `borrow_request.id` | `PENDING`, `FULFILLED`, `REJECTED`, `CANCELLED`, or `null` | `PENDING`, `FULFILLED`, `REJECTED`, or `CANCELLED` |
| `LOAN` | `loan.id` | `ACTIVE`, `RETURNED`, or `null` | `ACTIVE` or `RETURNED` |
| `COPY` | `copy.id` | `AVAILABLE`, `ON_LOAN`, `IN_MAINTENANCE`, `RETIRED`, or `null` | the same four values |

Every shape also carries `actorId`, the `user.id` of the person who made the change, taken from the session. `oldStatus` is `null` when the record is created (SDS 3.2).

### 1.4 Rules

- The function writes through `tx` only. It never opens its own transaction and never uses the global client. A caller that passes anything else breaks AC-F07-02.
- The function never catches an error. If the insert fails, the error reaches the caller and the caller's transaction rolls back, so a change is never committed without its entry.
- `lab_id` is read inside the function: a request and a copy through their equipment type, a loan through its copy's equipment type. The caller does not pass it, so the entry cannot get the wrong lab (BR-15, F-14). The record must already exist in `tx`. A missing record throws an `Error`, which is a programming mistake, not a user error.
- `created_at` comes from `clock.now()` (SDS 8). The function never reads the system time.
- The function does not check that the status change is allowed. The caller's conditional update decides that (SDS 2.5), and the caller records only after the update changed a row.
- A change that is refused records nothing. The caller does not call the function on a refusal, and a refusal after the call rolls the entry back with everything else.
- History is append only. F-07 has no update or delete.

### 1.5 How F-03, F-04, and F-06 call it

Call it inside the existing `prisma.$transaction` callback, after the conditional update succeeded and before the callback returns. Pass the callback's `tx` and the injected clock. Import it from `../history/service.js`.

```ts
import { recordStatusChange } from '../history/service.js';

return await prisma.$transaction(async (tx) => {
  const changed = await tx.copy.updateMany({
    where: { id: copyId, status: 'AVAILABLE' },
    data: { status: 'IN_MAINTENANCE' },
  });
  if (changed.count === 0) {
    throw notAvailable(); // refused: no entry, nothing committed
  }
  await recordStatusChange(tx, clock, {
    entityType: 'COPY',
    entityId: copyId,
    actorId: custodianId,
    oldStatus: 'AVAILABLE',
    newStatus: 'IN_MAINTENANCE',
  });
  return await loadCopy(tx, copyId);
}, TRANSACTION_OPTIONS);
```

What each feature records:

| Feature | Change | Calls |
| --- | --- | --- |
| F-03 submit | Request created | `REQUEST`, `oldStatus: null`, `newStatus: 'PENDING'`, actor is the borrower. Call it after `create`, with the new `id`. |
| F-03 cancel | Request cancelled | `REQUEST`, `PENDING` to `CANCELLED`, actor is the borrower. |
| F-04 checkout | Request fulfilled, copy lent, loan created | Three calls in one transaction, actor is the custodian: `REQUEST` `PENDING` to `FULFILLED`, `COPY` `AVAILABLE` to `ON_LOAN`, and `LOAN` `null` to `ACTIVE` (after the loan insert, with the new loan `id`). SDS 2.5 step 5 asks for one entry per status change. |
| F-06 copy status | Copy switched | `COPY`, `AVAILABLE` to `IN_MAINTENANCE` or back, actor is the custodian. |

The `TODO(F-07)` comment in `server/src/requests/service.ts` on the F-03 branch is replaced by these calls once F-07 is merged. The call needs only the existing `tx`, `clock`, and the borrower id that F-03 already has, so no signature change is needed there.

## 2. API specification

None. F-07 adds no endpoint. The recorder is an internal function. The Sprint 2 endpoint `GET /api/custodian/history` belongs to F-14.

## 3. UI specification

None. There is no history screen in Sprint 1.

## 4. Acceptance criteria

These are the AC from [traceability.md](../../traceability.md) section 4, unchanged.

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F07-01 | FR-17 | Each request, loan, and copy status change in F-03, F-04, and F-06 stores one history entry with actor, old status, new status, and time. TEST-F07-01 covers the function itself. The callers finish this criterion in their own PRs: F-06 in TEST-F06-01 (#27), F-04 in TEST-F04-02 and `server/tests/requests-history.test.ts` (#28). |
| AC-F07-02 | FR-17 | A refused change stores no history entry. |

## 5. Test specifications

The tests run against the test database. F-03, F-04, and F-06 may not be merged when F-07 is written, so each test runs the recorder inside a real `prisma.$transaction` together with a small change that stands in for the caller. When those features merge, their own tests also assert the entries they write.

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-F07-01 | AC-F07-01 | Database | A borrower, a custodian, a lab, an equipment type, a copy, a request, and a loan. A fixed clock. | In one transaction each, change a request from Pending to Cancelled, a loan from Active to Returned, and a copy from Available to In maintenance, and record each change. | Each transaction commits and leaves exactly one `status_history` row with the right `entity_type`, `entity_id`, `actor_id`, `old_status`, `new_status`, the lab of the record, and `created_at` equal to the clock time. |
| TEST-F07-02 | AC-F07-02 | Database | The same records. | Run the caller change and record it, then throw (a refusal). Also run a change where the conditional update changes 0 rows and the caller throws before recording. | Both transactions roll back. The record keeps its old status and `status_history` has no row for it. |

Supporting checks that have no AC of their own:

| Check | Level | Expected result |
| --- | --- | --- |
| Creation entry | Database | A record created in the transaction is recorded with `oldStatus` `null`, and the row stores a null `old_status`. |
| Several entries in one transaction | Database | A checkout-shaped transaction records the request, the copy, and the loan. Three rows exist, all with the same actor and time. |
| Lab of the record | Database | A request, a loan, and a copy in different labs each get their own lab id. |
| Missing record | Database | Recording for an id that does not exist throws, and the surrounding transaction rolls back. |
| Clock | Database | After the clock advances, a second entry has the later time, so the time is not read from the system. |

## 6. SR rules this feature must satisfy

- SR-03: the entries use the `status_history` table and its foreign keys from SR-03. The recorder inserts nothing the schema would refuse.
- SR-01: no route is added, so the route table does not change.
- SR-07: an entry stores ids and statuses only. It holds no password, token, or free text.

## 7. Definition of Done

- The contract is committed before the tests, and the tests fail before the implementation.
- TEST-F07-01, TEST-F07-02, and the supporting checks pass.
- Lint, format, build, and all existing tests pass.
- The calling code for F-03, F-04, and F-06 is documented in section 1.5, and the owners of those features have been told.
- Reviewed by @ArmmyC and merged into `sprint-1`.
