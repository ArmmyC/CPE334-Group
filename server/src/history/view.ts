import type { Prisma, PrismaClient } from '@prisma/client';
import {
  HISTORY_ENTITY_LABEL,
  type HistoryEntityType,
  type HistoryEntry,
  type HistoryResponse,
} from '@cpe334-group/shared';

export type HistoryQuery = {
  entityType?: HistoryEntityType;
  limit: number;
  beforeId?: number;
};

// F-14: the history entries of the labs the custodian is assigned to (BR-15). The lab filter is
// part of the query, so an entry of another lab is never read.
export function createHistoryViewService({ prisma }: { prisma: PrismaClient }) {
  return {
    async list(custodianId: number, query: HistoryQuery): Promise<HistoryResponse> {
      const scope: Prisma.StatusHistoryWhereInput = {
        lab: { assignments: { some: { custodianId } } },
        ...(query.entityType ? { entityType: query.entityType } : {}),
      };

      // Entries are ordered by time, then id. The cursor is the last entry of the previous page,
      // so the next page starts after it in that same order, with no gaps or repeats.
      let after: Prisma.StatusHistoryWhereInput = {};
      if (query.beforeId !== undefined) {
        const cursor = await prisma.statusHistory.findFirst({
          where: { ...scope, id: query.beforeId },
          select: { id: true, createdAt: true },
        });
        if (!cursor) return { items: [], nextBeforeId: null };
        after = {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        };
      }

      const rows = await prisma.statusHistory.findMany({
        where: { AND: [scope, after] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        include: {
          actor: { select: { id: true, name: true } },
          lab: { select: { id: true, name: true } },
        },
      });
      const page = rows.slice(0, query.limit);
      const subjects = await subjectsFor(prisma, page);
      const items: HistoryEntry[] = page.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        subject:
          subjects.get(`${row.entityType}:${row.entityId}`) ??
          `${HISTORY_ENTITY_LABEL[row.entityType]} #${row.entityId}`,
        oldStatus: row.oldStatus,
        newStatus: row.newStatus,
        createdAt: row.createdAt.toISOString(),
        actor: row.actor,
        lab: row.lab,
      }));
      return {
        items,
        nextBeforeId: rows.length > query.limit ? (items[items.length - 1]?.id ?? null) : null,
      };
    },
  };
}

// The text that names each record, from three batched queries, not one per entry.
async function subjectsFor(
  prisma: PrismaClient,
  rows: { entityType: HistoryEntityType; entityId: number }[],
): Promise<Map<string, string>> {
  const idsOf = (type: HistoryEntityType) => [
    ...new Set(rows.filter((row) => row.entityType === type).map((row) => row.entityId)),
  ];
  const subjects = new Map<string, string>();

  const copyIds = idsOf('COPY');
  if (copyIds.length > 0) {
    const copies = await prisma.copy.findMany({
      where: { id: { in: copyIds } },
      select: { id: true, assetTag: true, equipmentType: { select: { name: true } } },
    });
    for (const copy of copies) {
      subjects.set(`COPY:${copy.id}`, `${copy.assetTag} (${copy.equipmentType.name})`);
    }
  }
  const requestIds = idsOf('REQUEST');
  if (requestIds.length > 0) {
    const requests = await prisma.borrowRequest.findMany({
      where: { id: { in: requestIds } },
      select: {
        id: true,
        equipmentType: { select: { name: true } },
        borrower: { select: { name: true } },
      },
    });
    for (const request of requests) {
      subjects.set(
        `REQUEST:${request.id}`,
        `Request #${request.id}: ${request.equipmentType.name} for ${request.borrower.name}`,
      );
    }
  }
  const loanIds = idsOf('LOAN');
  if (loanIds.length > 0) {
    const loans = await prisma.loan.findMany({
      where: { id: { in: loanIds } },
      select: {
        id: true,
        copy: { select: { assetTag: true } },
        borrower: { select: { name: true } },
      },
    });
    for (const loan of loans) {
      subjects.set(
        `LOAN:${loan.id}`,
        `Loan #${loan.id}: ${loan.copy.assetTag} to ${loan.borrower.name}`,
      );
    }
  }
  return subjects;
}

export type HistoryViewService = ReturnType<typeof createHistoryViewService>;
