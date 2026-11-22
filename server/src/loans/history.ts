import type { RequestHandler } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  LOAN_HISTORY_DEFAULT_LIMIT,
  loanHistoryQuerySchema,
  type LoanHistoryResponse,
} from '@cpe334-group/shared';
import { HttpError } from '../http/errors.js';
import { checkQuery } from '../http/query.js';

const MAX_ID = 2_147_483_647;

const select = {
  id: true,
  checkedOutAt: true,
  dueDate: true,
  status: true,
  returnedAt: true,
  returnNote: true,
  renewedAt: true,
  borrower: { select: { id: true, name: true } },
  copy: {
    select: {
      assetTag: true,
      equipmentType: {
        select: { id: true, name: true, lab: { select: { id: true, name: true } } },
      },
    },
  },
} satisfies Prisma.LoanSelect;

// BR-15: only loans of copies in the labs the custodian is assigned to are ever read.
const inAssignedLab = (custodianId: number) =>
  ({
    copy: { equipmentType: { lab: { assignments: { some: { custodianId } } } } },
  }) satisfies Prisma.LoanWhereInput;

// F-18: one page of loans, newest checkout first, ties by id. The cursor is the last loan of the
// previous page, looked up inside the same scope, so the next page follows it with no gaps or
// repeats.
async function page(
  prisma: PrismaClient,
  scope: Prisma.LoanWhereInput,
  query: { limit?: number; beforeId?: number },
): Promise<LoanHistoryResponse> {
  const limit = query.limit ?? LOAN_HISTORY_DEFAULT_LIMIT;
  let after: Prisma.LoanWhereInput = {};
  if (query.beforeId !== undefined) {
    const cursor = await prisma.loan.findFirst({
      where: { ...scope, id: query.beforeId },
      select: { id: true, checkedOutAt: true },
    });
    if (!cursor) return { items: [], nextBeforeId: null };
    after = {
      OR: [
        { checkedOutAt: { lt: cursor.checkedOutAt } },
        { checkedOutAt: cursor.checkedOutAt, id: { lt: cursor.id } },
      ],
    };
  }
  const rows = await prisma.loan.findMany({
    where: { AND: [scope, after] },
    orderBy: [{ checkedOutAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select,
  });
  const items = rows.slice(0, limit).map((row) => ({
    id: row.id,
    borrower: row.borrower,
    assetTag: row.copy.assetTag,
    equipmentType: { id: row.copy.equipmentType.id, name: row.copy.equipmentType.name },
    lab: row.copy.equipmentType.lab,
    checkedOutAt: row.checkedOutAt.toISOString(),
    dueDate: row.dueDate.toISOString().slice(0, 10),
    status: row.status,
    returnedAt: row.returnedAt?.toISOString() ?? null,
    returnNote: row.returnNote,
    renewed: row.renewedAt !== null,
  }));
  return {
    items,
    nextBeforeId: rows.length > limit ? (items[items.length - 1]?.id ?? null) : null,
  };
}

export function createLoanHistoryService({ prisma }: { prisma: PrismaClient }) {
  return {
    // A copy outside the assigned labs is the same 404 as a missing copy (NFR-03).
    async forCopy(
      custodianId: number,
      copyId: number,
      query: { limit?: number; beforeId?: number },
    ): Promise<LoanHistoryResponse> {
      const copy = await prisma.copy.findFirst({
        where: { id: copyId, equipmentType: { lab: { assignments: { some: { custodianId } } } } },
        select: { id: true },
      });
      if (!copy) throw new HttpError(404, 'NOT_FOUND', 'This copy could not be found.');
      return page(prisma, { copyId }, query);
    },

    // A borrower exists across labs, so the labs are what is scoped: no loans there is an empty list.
    forBorrower(
      custodianId: number,
      borrowerId: number,
      query: { limit?: number; beforeId?: number },
    ): Promise<LoanHistoryResponse> {
      return page(prisma, { borrowerId, ...inAssignedLab(custodianId) }, query);
    },
  };
}

export type LoanHistoryService = ReturnType<typeof createLoanHistoryService>;

// A route id is digits only and within the 32-bit range, or it is a 404 (SDS 5.1).
function parseId(value: string, what: string): number {
  const id = /^\d{1,10}$/.test(value) ? Number(value) : 0;
  if (id < 1 || id > MAX_ID)
    throw new HttpError(404, 'NOT_FOUND', `This ${what} could not be found.`);
  return id;
}

export function loanHistoryHandlers({ history }: { history: LoanHistoryService }) {
  const forCopy: RequestHandler = async (request, response) => {
    const copyId = parseId(String(request.params.id), 'copy');
    const query = checkQuery(loanHistoryQuerySchema, ['limit', 'beforeId'], request.query);
    response.json(await history.forCopy(response.locals.user!.id, copyId, query));
  };

  const forBorrower: RequestHandler = async (request, response) => {
    const borrowerId = parseId(String(request.params.id), 'borrower');
    const query = checkQuery(loanHistoryQuerySchema, ['limit', 'beforeId'], request.query);
    response.json(await history.forBorrower(response.locals.user!.id, borrowerId, query));
  };

  return { forCopy, forBorrower };
}
