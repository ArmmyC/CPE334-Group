import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { AvailableCopy, CheckoutResult, PendingRequest } from '@cpe334-group/shared';
import type { Clock } from '../clock.js';
import { HttpError } from '../http/errors.js';
import { recordStatusChange } from '../history/service.js';
import { dueDateFor } from '../loans/due-date.js';

// SDS 2.5: the transaction waits up to 5 seconds for a pool connection and runs up to 10.
const TRANSACTION_OPTIONS = { maxWait: 5000, timeout: 10000 };

const notFoundRequest = () => new HttpError(404, 'NOT_FOUND', 'This request could not be found.');
const notFoundCopy = () => new HttpError(404, 'NOT_FOUND', 'This copy could not be found.');
const invalidStatus = () =>
  new HttpError(409, 'INVALID_STATUS', 'This request is no longer Pending.');
const copyMismatch = () =>
  new HttpError(409, 'COPY_MISMATCH', 'This copy is not of the requested equipment type or lab.');
const copyNotAvailable = () =>
  new HttpError(409, 'COPY_NOT_AVAILABLE', 'This copy is not available.');

// Matches a record whose equipment type is in a lab the custodian is assigned to (BR-15).
// The lab filter is part of the query, so a record in another lab is never read.
function inAssignedLab(custodianId: number) {
  return {
    lab: { assignments: { some: { custodianId } } },
  } satisfies Prisma.EquipmentTypeWhereInput;
}

// A second checkout of one copy or one request can fail on the partial unique index on active
// loans or on the unique `loan.request_id` (SDS 2.5). It is reported as a rule code, not a 500.
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

// The same lock that request creation takes first (SDS 2.5), so both keep one lock order.
async function lockBorrower(tx: Prisma.TransactionClient, borrowerId: number) {
  await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${borrowerId} FOR UPDATE`;
}

const requestInclude = {
  borrower: { select: { id: true, name: true } },
  equipmentType: { include: { lab: true } },
} satisfies Prisma.BorrowRequestInclude;

// The custodian side of a borrow request (F-04): the Pending list, the copies that can be
// chosen, and checkout. Checkout runs the SDS 2.5 transaction and calls the F-07 recorder in it.
export function createCheckoutService({ prisma, clock }: { prisma: PrismaClient; clock: Clock }) {
  return {
    async listPending(custodianId: number): Promise<PendingRequest[]> {
      const rows = await prisma.borrowRequest.findMany({
        where: { status: 'PENDING', equipmentType: inAssignedLab(custodianId) },
        include: requestInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return rows.map((row) => ({
        id: row.id,
        borrower: row.borrower,
        equipmentType: { id: row.equipmentType.id, name: row.equipmentType.name },
        lab: { id: row.equipmentType.lab.id, name: row.equipmentType.lab.name },
        purpose: row.purpose,
        createdAt: row.createdAt.toISOString(),
      }));
    },

    async listAvailableCopies(custodianId: number, requestId: number): Promise<AvailableCopy[]> {
      const found = await prisma.borrowRequest.findFirst({
        where: { id: requestId, equipmentType: inAssignedLab(custodianId) },
        select: { equipmentTypeId: true },
      });
      if (!found) {
        throw notFoundRequest();
      }
      return prisma.copy.findMany({
        where: { equipmentTypeId: found.equipmentTypeId, status: 'AVAILABLE' },
        select: { id: true, assetTag: true },
        orderBy: { assetTag: 'asc' },
      });
    },

    async checkout(
      custodianId: number,
      requestId: number,
      copyId: number,
    ): Promise<CheckoutResult> {
      try {
        return await prisma.$transaction(async (tx) => {
          // Step 1: the request within the custodian's labs, then the borrower's row lock.
          const found = await tx.borrowRequest.findFirst({
            where: { id: requestId, equipmentType: inAssignedLab(custodianId) },
            include: requestInclude,
          });
          if (!found) {
            throw notFoundRequest();
          }
          await lockBorrower(tx, found.borrowerId);

          // Step 2: only a Pending request can be fulfilled (BR-06).
          const now = clock.now();
          const fulfilled = await tx.borrowRequest.updateMany({
            where: { id: requestId, status: 'PENDING' },
            data: { status: 'FULFILLED', decidedAt: now, decidedById: custodianId },
          });
          if (fulfilled.count === 0) {
            throw invalidStatus();
          }

          // Step 3: the copy within the custodian's labs, of the request's type and lab (BR-02).
          const copy = await tx.copy.findFirst({
            where: { id: copyId, equipmentType: inAssignedLab(custodianId) },
            include: { equipmentType: true },
          });
          if (!copy) {
            throw notFoundCopy();
          }
          if (
            copy.equipmentTypeId !== found.equipmentTypeId ||
            copy.equipmentType.labId !== found.equipmentType.labId
          ) {
            throw copyMismatch();
          }

          // Step 4: only an Available copy can be lent (BR-01, BR-17).
          const lent = await tx.copy.updateMany({
            where: { id: copyId, status: 'AVAILABLE' },
            data: { status: 'ON_LOAN' },
          });
          if (lent.count === 0) {
            throw copyNotAvailable();
          }

          // Step 5: the loan and one history entry per status change (F-07, section 1.5).
          const loan = await tx.loan.create({
            data: {
              requestId,
              copyId,
              borrowerId: found.borrowerId,
              checkedOutAt: now,
              checkedOutById: custodianId,
              dueDate: dueDateFor(now, found.equipmentType.loanPeriodDays),
              status: 'ACTIVE',
            },
          });
          await recordStatusChange(tx, clock, {
            entityType: 'REQUEST',
            entityId: requestId,
            actorId: custodianId,
            oldStatus: 'PENDING',
            newStatus: 'FULFILLED',
          });
          await recordStatusChange(tx, clock, {
            entityType: 'COPY',
            entityId: copyId,
            actorId: custodianId,
            oldStatus: 'AVAILABLE',
            newStatus: 'ON_LOAN',
          });
          await recordStatusChange(tx, clock, {
            entityType: 'LOAN',
            entityId: loan.id,
            actorId: custodianId,
            oldStatus: null,
            newStatus: 'ACTIVE',
          });

          return {
            id: loan.id,
            requestId,
            borrower: found.borrower,
            equipmentType: { id: found.equipmentType.id, name: found.equipmentType.name },
            lab: { id: found.equipmentType.lab.id, name: found.equipmentType.lab.name },
            assetTag: copy.assetTag,
            checkedOutAt: loan.checkedOutAt.toISOString(),
            // The due date is a calendar date (SDS 8), stored with no time.
            dueDate: loan.dueDate.toISOString().slice(0, 10),
            status: 'ACTIVE' as const,
          };
        }, TRANSACTION_OPTIONS);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw copyNotAvailable();
        }
        throw error;
      }
    },
  };
}

export type CheckoutService = ReturnType<typeof createCheckoutService>;
