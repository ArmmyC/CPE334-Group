import { z } from 'zod';

// F-19 inventory summary (FR-21), used by the API and the UI.

export const SUMMARY_MAX_DAYS = 366;
export const SUMMARY_DEFAULT_DAYS = 30;

const DAY = 24 * 60 * 60 * 1000;

// A calendar date that really exists, such as 2026-02-28 and not 2026-02-30.
function toTime(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== date ? null : time;
}

// The date `days` before or after `date`, as YYYY-MM-DD. No time zone is involved.
export function shiftDate(date: string, days: number): string {
  return new Date((toTime(date) ?? 0) + days * DAY).toISOString().slice(0, 10);
}

// The sentence for a range that is reversed or longer than a year, or null when it is fine.
export function summaryRangeError(from: string, to: string): string | null {
  const start = toTime(from);
  const end = toTime(to);
  if (start === null || end === null) return null;
  if (start > end) return 'From must be on or before To.';
  if ((end - start) / DAY > SUMMARY_MAX_DAYS) {
    return `The range can be at most ${SUMMARY_MAX_DAYS + 1} days.`;
  }
  return null;
}

const dateParam = (label: string) =>
  z
    .string({ error: `${label} must be a date as YYYY-MM-DD.` })
    .refine((value) => toTime(value) !== null, `${label} must be a date as YYYY-MM-DD.`);

export const summaryQuerySchema = z
  .object({ from: dateParam('From').optional(), to: dateParam('To').optional() })
  .superRefine((query, context) => {
    if (query.from === undefined || query.to === undefined) return;
    const message = summaryRangeError(query.from, query.to);
    if (message) context.addIssue({ code: 'custom', path: ['to'], message });
  });

export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

const refSchema = z.object({ id: z.number().int().positive(), name: z.string() });

export const labSummarySchema = z.object({
  lab: refSchema,
  copies: z.object({
    AVAILABLE: z.number().int().nonnegative(),
    ON_LOAN: z.number().int().nonnegative(),
    IN_MAINTENANCE: z.number().int().nonnegative(),
    RETIRED: z.number().int().nonnegative(),
  }),
  activeLoans: z.number().int().nonnegative(),
  overdueLoans: z.number().int().nonnegative(),
  topTypes: z.array(z.object({ equipmentType: refSchema, checkouts: z.number().int().positive() })),
});

export type LabSummary = z.infer<typeof labSummarySchema>;

export const summaryResponseSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  labs: z.array(labSummarySchema),
});

export type SummaryResponse = z.infer<typeof summaryResponseSchema>;
