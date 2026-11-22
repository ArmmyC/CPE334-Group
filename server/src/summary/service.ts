import { Prisma, type PrismaClient } from '@prisma/client';
import {
  SUMMARY_DEFAULT_DAYS,
  shiftDate,
  summaryRangeError,
  type LabSummary,
  type SummaryResponse,
} from '@cpe334-group/shared';
import type { Clock } from '../clock.js';
import { HttpError } from '../http/errors.js';

const bangkokDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const TOP_TYPES = 5;

type CopyRow = { lab_id: number; status: keyof LabSummary['copies']; total: number };
type LoanRow = { lab_id: number; active: number; overdue: number };
type TypeRow = { lab_id: number; id: number; name: string; checkouts: number };

// F-19 (contract section 1.3): one grouped query per figure for all assigned labs, never a query
// or a loop per row. Only assigned labs are read (BR-15), and overdue is the F-10 rule (the
// Bangkok date of today is after the due date) calculated on read.
export function createSummaryService({ prisma, clock }: { prisma: PrismaClient; clock: Clock }) {
  return {
    async forCustodian(
      custodianId: number,
      query: { from?: string; to?: string },
    ): Promise<SummaryResponse> {
      const today = bangkokDate.format(clock.now());
      const to = query.to ?? today;
      const from = query.from ?? shiftDate(to, -(SUMMARY_DEFAULT_DAYS - 1));
      const rangeError = summaryRangeError(from, to);
      if (rangeError) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
          to: rangeError,
        });
      }

      const labs = await prisma.lab.findMany({
        where: { assignments: { some: { custodianId } } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
      if (labs.length === 0) return { range: { from, to }, labs: [] };
      const labIds = Prisma.join(labs.map((lab) => lab.id));

      const [copyRows, loanRows, typeRows] = await Promise.all([
        prisma.$queryRaw<CopyRow[]>`
          SELECT et.lab_id, c.status::text AS status, COUNT(*)::int AS total
          FROM copy c JOIN equipment_type et ON et.id = c.equipment_type_id
          WHERE et.lab_id IN (${labIds})
          GROUP BY et.lab_id, c.status`,
        prisma.$queryRaw<LoanRow[]>`
          SELECT et.lab_id,
                 COUNT(*)::int AS active,
                 (COUNT(*) FILTER (WHERE l.due_date < ${today}::date))::int AS overdue
          FROM loan l
            JOIN copy c ON c.id = l.copy_id
            JOIN equipment_type et ON et.id = c.equipment_type_id
          WHERE l.status = 'ACTIVE' AND et.lab_id IN (${labIds})
          GROUP BY et.lab_id`,
        prisma.$queryRaw<TypeRow[]>`
          SELECT et.lab_id, et.id, et.name, COUNT(*)::int AS checkouts
          FROM loan l
            JOIN copy c ON c.id = l.copy_id
            JOIN equipment_type et ON et.id = c.equipment_type_id
          WHERE et.lab_id IN (${labIds})
            AND (l.checked_out_at AT TIME ZONE 'Asia/Bangkok')::date
                BETWEEN ${from}::date AND ${to}::date
          GROUP BY et.lab_id, et.id, et.name`,
      ]);

      return {
        range: { from, to },
        labs: labs.map((lab) => {
          const loans = loanRows.find((row) => row.lab_id === lab.id);
          const copies = { AVAILABLE: 0, ON_LOAN: 0, IN_MAINTENANCE: 0, RETIRED: 0 };
          for (const row of copyRows) if (row.lab_id === lab.id) copies[row.status] = row.total;
          return {
            lab,
            copies,
            activeLoans: loans?.active ?? 0,
            overdueLoans: loans?.overdue ?? 0,
            topTypes: typeRows
              .filter((row) => row.lab_id === lab.id)
              .sort((a, b) => b.checkouts - a.checkouts || a.name.localeCompare(b.name))
              .slice(0, TOP_TYPES)
              .map((row) => ({
                equipmentType: { id: row.id, name: row.name },
                checkouts: row.checkouts,
              })),
          };
        }),
      };
    },
  };
}

export type SummaryService = ReturnType<typeof createSummaryService>;
