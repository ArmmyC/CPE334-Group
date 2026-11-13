import type { CopyStatus, Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { ChangeableCopyStatus, CustodianCopy } from '@cpe334-group/shared';
import type { Clock } from '../clock.js';
import { HttpError } from '../http/errors.js';
import { recordStatusChange } from '../history/service.js';

// Interactive transactions give up waiting for a connection after 5 seconds and run for at
// most 10 (SDS 2.5).
const TRANSACTION_OPTIONS = { maxWait: 5000, timeout: 10000 };

const copySelect = {
  id: true,
  assetTag: true,
  status: true,
  equipmentType: {
    select: { id: true, name: true, lab: { select: { id: true, name: true } } },
  },
} satisfies Prisma.CopySelect;

type CopyRow = Prisma.CopyGetPayload<{ select: typeof copySelect }>;

function toCustodianCopy({ id, assetTag, status, equipmentType }: CopyRow): CustodianCopy {
  return {
    id,
    assetTag,
    status,
    equipmentType: { id: equipmentType.id, name: equipmentType.name },
    lab: equipmentType.lab,
  };
}

// The copies of the labs the custodian is assigned to (BR-15). The filter is part of the query,
// so a copy in another lab is never read.
const inAssignedLab = (custodianId: number): Prisma.CopyWhereInput => ({
  equipmentType: { lab: { assignments: { some: { custodianId } } } },
});

export const notFoundCopy = () => new HttpError(404, 'NOT_FOUND', 'Copy not found.');

function invalidStatus(current: CopyStatus | undefined, target: ChangeableCopyStatus) {
  const message =
    current === 'ON_LOAN'
      ? 'A copy that is on loan cannot be changed.'
      : current === target
        ? 'This copy already has that status.'
        : 'This copy cannot be changed to that status.';
  return new HttpError(409, 'INVALID_STATUS', message);
}

// BR-08 for Sprint 1: Available and In maintenance switch with each other and nothing else.
const SWITCHES_FROM: Record<ChangeableCopyStatus, ChangeableCopyStatus> = {
  AVAILABLE: 'IN_MAINTENANCE',
  IN_MAINTENANCE: 'AVAILABLE',
};

export function createCopyService({ prisma, clock }: { prisma: PrismaClient; clock: Clock }) {
  return {
    async listForCustodian(custodianId: number): Promise<CustodianCopy[]> {
      const copies = await prisma.copy.findMany({
        where: inAssignedLab(custodianId),
        select: copySelect,
        orderBy: [
          { equipmentType: { lab: { name: 'asc' } } },
          { equipmentType: { name: 'asc' } },
          { assetTag: 'asc' },
        ],
      });
      return copies.map(toCustodianCopy);
    },

    // F-06 switch path (contract section 1.3). The conditional update decides whether the
    // change is allowed. The history entry is written only after it changed a row, in the same
    // transaction (F-07), so a refused change records nothing.
    async changeStatus(
      custodianId: number,
      copyId: number,
      target: ChangeableCopyStatus,
    ): Promise<CustodianCopy> {
      return await prisma.$transaction(async (tx) => {
        const scoped = await tx.copy.findFirst({
          where: { id: copyId, ...inAssignedLab(custodianId) },
          select: { id: true },
        });
        if (!scoped) {
          throw notFoundCopy();
        }
        const expected = SWITCHES_FROM[target];
        const changed = await tx.copy.updateMany({
          where: { id: copyId, status: expected },
          data: { status: target },
        });
        if (changed.count === 0) {
          const current = await tx.copy.findUnique({
            where: { id: copyId },
            select: { status: true },
          });
          throw invalidStatus(current?.status, target);
        }
        await recordStatusChange(tx, clock, {
          entityType: 'COPY',
          entityId: copyId,
          actorId: custodianId,
          oldStatus: expected,
          newStatus: target,
        });
        return toCustodianCopy(
          await tx.copy.findUniqueOrThrow({ where: { id: copyId }, select: copySelect }),
        );
      }, TRANSACTION_OPTIONS);
    },
  };
}
