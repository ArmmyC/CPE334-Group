import type { PrismaClient } from '@prisma/client';
import type { Loan } from '@cpe334-group/shared';

// The borrower's loans (F-03), read only. F-04 is the first feature that writes loans.
export function createLoanService({ prisma }: { prisma: PrismaClient }) {
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
      }));
    },
  };
}

export type LoanService = ReturnType<typeof createLoanService>;
