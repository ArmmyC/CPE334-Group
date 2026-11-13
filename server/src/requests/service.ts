import type { Prisma, PrismaClient } from '@prisma/client';
import type { BorrowRequest, CreateRequest } from '@cpe334-group/shared';
import type { Clock } from '../clock.js';
import { HttpError } from '../http/errors.js';
import { recordStatusChange } from '../history/service.js';

// SDS 2.5: the transaction waits up to 5 seconds for a pool connection and runs up to 10.
const TRANSACTION_OPTIONS = { maxWait: 5000, timeout: 10000 };

const requestInclude = {
  equipmentType: { include: { lab: true } },
} satisfies Prisma.BorrowRequestInclude;
type RequestRow = Prisma.BorrowRequestGetPayload<{ include: typeof requestInclude }>;

const notFoundType = () =>
  new HttpError(404, 'NOT_FOUND', 'This equipment type could not be found.');
const notFoundRequest = () => new HttpError(404, 'NOT_FOUND', 'This request could not be found.');
const duplicateRequest = () =>
  new HttpError(
    409,
    'DUPLICATE_REQUEST',
    'You already have a Pending request or an active loan for this equipment type.',
  );
const noAvailableCopy = () =>
  new HttpError(409, 'NO_AVAILABLE_COPY', 'No copies of this equipment are available right now.');
const invalidStatus = () =>
  new HttpError(409, 'INVALID_STATUS', 'This request can no longer be cancelled.');

// A second Pending request for the same borrower and type fails on the partial unique index
// (SDS 2.5). It is reported as the same rule code, never as a server error.
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

// Taking the borrower's row lock first keeps every request and checkout for one borrower in
// one lock order (SDS 2.5), so a parallel submit waits here and then sees the first request.
async function lockBorrower(tx: Prisma.TransactionClient, borrowerId: number) {
  await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${borrowerId} FOR UPDATE`;
}

function toBorrowRequest(row: RequestRow): BorrowRequest {
  return {
    id: row.id,
    equipmentType: { id: row.equipmentType.id, name: row.equipmentType.name },
    lab: { name: row.equipmentType.lab.name },
    purpose: row.purpose,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

// The borrower's borrow requests (F-03). Each change runs in one transaction and records its
// status change through the F-07 history recorder inside that transaction.
export function createRequestService({ prisma, clock }: { prisma: PrismaClient; clock: Clock }) {
  return {
    async submit(borrowerId: number, input: CreateRequest): Promise<BorrowRequest> {
      const trimmed = input.purpose?.trim();
      const purpose = trimmed ? trimmed : null;
      try {
        return await prisma.$transaction(async (tx) => {
          await lockBorrower(tx, borrowerId);
          const type = await tx.equipmentType.findUnique({ where: { id: input.equipmentTypeId } });
          if (!type) {
            throw notFoundType();
          }
          const pending = await tx.borrowRequest.count({
            where: { borrowerId, equipmentTypeId: type.id, status: 'PENDING' },
          });
          const activeLoans = await tx.loan.count({
            where: { borrowerId, status: 'ACTIVE', copy: { equipmentTypeId: type.id } },
          });
          if (pending + activeLoans > 0) {
            throw duplicateRequest();
          }
          const available = await tx.copy.count({
            where: { equipmentTypeId: type.id, status: 'AVAILABLE' },
          });
          if (available === 0) {
            throw noAvailableCopy();
          }
          const created = await tx.borrowRequest.create({
            data: {
              borrowerId,
              equipmentTypeId: type.id,
              purpose,
              status: 'PENDING',
              createdAt: clock.now(),
            },
            include: requestInclude,
          });
          await recordStatusChange(tx, clock, {
            entityType: 'REQUEST',
            entityId: created.id,
            actorId: borrowerId,
            oldStatus: null,
            newStatus: 'PENDING',
          });
          return toBorrowRequest(created);
        }, TRANSACTION_OPTIONS);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw duplicateRequest();
        }
        throw error;
      }
    },

    async cancel(borrowerId: number, requestId: number): Promise<BorrowRequest> {
      return prisma.$transaction(async (tx) => {
        await lockBorrower(tx, borrowerId);
        const owned = await tx.borrowRequest.findFirst({
          where: { id: requestId, borrowerId },
          select: { id: true },
        });
        if (!owned) {
          throw notFoundRequest();
        }
        const changed = await tx.borrowRequest.updateMany({
          where: { id: requestId, borrowerId, status: 'PENDING' },
          data: { status: 'CANCELLED', decidedAt: clock.now(), decidedById: borrowerId },
        });
        if (changed.count === 0) {
          throw invalidStatus();
        }
        await recordStatusChange(tx, clock, {
          entityType: 'REQUEST',
          entityId: requestId,
          actorId: borrowerId,
          oldStatus: 'PENDING',
          newStatus: 'CANCELLED',
        });
        const row = await tx.borrowRequest.findUniqueOrThrow({
          where: { id: requestId },
          include: requestInclude,
        });
        return toBorrowRequest(row);
      }, TRANSACTION_OPTIONS);
    },

    async listOwn(borrowerId: number): Promise<BorrowRequest[]> {
      const rows = await prisma.borrowRequest.findMany({
        where: { borrowerId },
        include: requestInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return rows.map(toBorrowRequest);
    },
  };
}

export type RequestService = ReturnType<typeof createRequestService>;
