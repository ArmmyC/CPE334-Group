import type { PrismaClient } from '@prisma/client';
import type { CustodianLoan, Loan } from '@cpe334-group/shared';
import type { Clock } from '../clock.js';
import { isOverdue } from './overdue.js';

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
  };
}

export type LoanService = ReturnType<typeof createLoanService>;
