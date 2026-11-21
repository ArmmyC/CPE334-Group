import type { PrismaClient } from '@prisma/client';
import type { CustodianLoan, Loan, ReturnLoanBody, ReturnLoanResult } from '@cpe334-group/shared';
import type { Clock } from '../clock.js';
import { HttpError } from '../http/errors.js';
import { recordStatusChange } from '../history/service.js';
import { isOverdue } from './overdue.js';

// SDS 2.5: the transaction waits up to 5 seconds for a pool connection and runs up to 10.
const TRANSACTION_OPTIONS = { maxWait: 5000, timeout: 10000 };

// Loan reads: the borrower's own loans (F-03) and the custodian's active loans (F-05). F-04 is
// the first feature that writes loans. `overdue` is calculated from the injected clock on every
// read and never stored (F-10, BR-09).
export function createLoanService({ prisma, clock }: { prisma: PrismaClient; clock: Clock }) {
  return {
    async listOwn(borrowerId: number): Promise<Loan[]> {
      const rows = await prisma.loan.findMany({
        where: { borrowerId },
        include: { copy: { include: { equipmentType: true } } },
        orderBy: [{ checkedOutAt: 'desc' }, { id: 'desc' }],
      });
      return rows.map((row) => ({
        id: row.id,
        equipmentType: { id: row.copy.equipmentType.id, name: row.copy.equipmentType.name },
        assetTag: row.copy.assetTag,
        checkedOutAt: row.checkedOutAt.toISOString(),
        // The due date is a calendar date (SDS 8), stored with no time.
        dueDate: row.dueDate.toISOString().slice(0, 10),
        status: row.status,
        overdue: row.status === 'ACTIVE' && isOverdue(row.dueDate, clock.now()),
      }));
    },

    // F-05 (contract section 1.3). One query: the lab filter is part of the where clause, so a
    // loan in a lab the custodian is not assigned to (BR-15) is never read. A custodian with no
    // assignment matches nothing and gets an empty list.
    async listActiveForCustodian(
      custodianId: number,
      options: { overdueOnly?: boolean } = {},
    ): Promise<CustodianLoan[]> {
      const now = clock.now();
      const rows = await prisma.loan.findMany({
        where: {
          status: 'ACTIVE',
          copy: { equipmentType: { lab: { assignments: { some: { custodianId } } } } },
        },
        select: {
          id: true,
          checkedOutAt: true,
          dueDate: true,
          borrower: { select: { id: true, name: true } },
          copy: {
            select: {
              assetTag: true,
              equipmentType: {
                select: { id: true, name: true, lab: { select: { id: true, name: true } } },
              },
            },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { checkedOutAt: 'asc' }, { id: 'asc' }],
      });
      const items: CustodianLoan[] = rows.map((row) => ({
        id: row.id,
        borrower: row.borrower,
        equipmentType: { id: row.copy.equipmentType.id, name: row.copy.equipmentType.name },
        lab: row.copy.equipmentType.lab,
        assetTag: row.copy.assetTag,
        checkedOutAt: row.checkedOutAt.toISOString(),
        dueDate: row.dueDate.toISOString().slice(0, 10),
        status: 'ACTIVE',
        overdue: isOverdue(row.dueDate, now),
      }));
      return options.overdueOnly ? items.filter((loan) => loan.overdue) : items;
    },

    // F-09 (contract section 1.3). One transaction: scope check, a conditional update that lets
    // only one of several parallel returns win (BR-07), the copy update (BR-08), and two history
    // entries (F-07). Any refusal rolls everything back.
    async returnLoan(
      custodianId: number,
      loanId: number,
      body: ReturnLoanBody,
    ): Promise<ReturnLoanResult> {
      return prisma.$transaction(async (tx) => {
        const found = await tx.loan.findFirst({
          where: {
            id: loanId,
            copy: { equipmentType: { lab: { assignments: { some: { custodianId } } } } },
          },
          include: { copy: true },
        });
        if (!found) {
          throw new HttpError(404, 'NOT_FOUND', 'This loan could not be found.');
        }

        const now = clock.now();
        const updated = await tx.loan.updateMany({
          where: { id: loanId, status: 'ACTIVE' },
          data: {
            status: 'RETURNED',
            returnedAt: now,
            returnedById: custodianId,
            returnNote: body.note,
          },
        });
        if (updated.count === 0) {
          throw new HttpError(409, 'INVALID_STATUS', 'This loan was already returned.');
        }

        const copyStatus = body.damaged ? ('IN_MAINTENANCE' as const) : ('AVAILABLE' as const);
        const copyUpdated = await tx.copy.updateMany({
          where: { id: found.copyId, status: 'ON_LOAN' },
          data: { status: copyStatus },
        });
        if (copyUpdated.count === 0) {
          // An Active loan always has an On loan copy, so this is a broken invariant, not a
          // client mistake. The error rolls the loan update back.
          throw new Error(`Copy ${found.copyId} of active loan ${loanId} is not On loan.`);
        }

        await recordStatusChange(tx, clock, {
          entityType: 'LOAN',
          entityId: loanId,
          actorId: custodianId,
          oldStatus: 'ACTIVE',
          newStatus: 'RETURNED',
        });
        await recordStatusChange(tx, clock, {
          entityType: 'COPY',
          entityId: found.copyId,
          actorId: custodianId,
          oldStatus: 'ON_LOAN',
          newStatus: copyStatus,
        });

        return {
          id: loanId,
          status: 'RETURNED' as const,
          returnedAt: now.toISOString(),
          copy: { id: found.copyId, assetTag: found.copy.assetTag, status: copyStatus },
        };
      }, TRANSACTION_OPTIONS);
    },
  };
}

export type LoanService = ReturnType<typeof createLoanService>;
