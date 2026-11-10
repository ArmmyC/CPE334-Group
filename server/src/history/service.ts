import type { CopyStatus, LoanStatus, Prisma, RequestStatus } from '@prisma/client';
import type { Clock } from '../clock.js';

// One status change of a request, a loan, or a copy. `oldStatus` is null when the record is
// created (SDS 3.2). The union keeps a request status from being recorded as a copy status.
export type StatusChange = { actorId: number } & (
  | {
      entityType: 'REQUEST';
      entityId: number;
      oldStatus: RequestStatus | null;
      newStatus: RequestStatus;
    }
  | { entityType: 'LOAN'; entityId: number; oldStatus: LoanStatus | null; newStatus: LoanStatus }
  | { entityType: 'COPY'; entityId: number; oldStatus: CopyStatus | null; newStatus: CopyStatus }
);

// The lab comes from the record's equipment type, so the caller cannot record the wrong lab
// (BR-15, and the Sprint 2 history view filters on it). The record must exist in `tx`.
async function findLabId(tx: Prisma.TransactionClient, change: StatusChange): Promise<number> {
  const include = { equipmentType: { select: { labId: true } } } as const;
  let labId: number | undefined;
  switch (change.entityType) {
    case 'REQUEST':
      labId = (await tx.borrowRequest.findUnique({ where: { id: change.entityId }, include }))
        ?.equipmentType.labId;
      break;
    case 'COPY':
      labId = (await tx.copy.findUnique({ where: { id: change.entityId }, include }))?.equipmentType
        .labId;
      break;
    case 'LOAN':
      labId = (
        await tx.loan.findUnique({
          where: { id: change.entityId },
          include: { copy: { include } },
        })
      )?.copy.equipmentType.labId;
      break;
  }
  if (labId === undefined) {
    throw new Error(`Cannot record history: ${change.entityType} ${change.entityId} not found.`);
  }
  return labId;
}

// Writes one history entry (F-07, SDS 3.4). Call it inside the caller's transaction, after the
// status update changed a row. It writes only through `tx` and never catches an error, so a
// refused or failed change rolls the entry back with it. The time comes from the clock (SDS 8).
export async function recordStatusChange(
  tx: Prisma.TransactionClient,
  clock: Clock,
  change: StatusChange,
): Promise<void> {
  const labId = await findLabId(tx, change);
  await tx.statusHistory.create({
    data: {
      entityType: change.entityType,
      entityId: change.entityId,
      labId,
      oldStatus: change.oldStatus,
      newStatus: change.newStatus,
      actorId: change.actorId,
      createdAt: clock.now(),
    },
  });
}
