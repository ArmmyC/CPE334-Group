import { describe, expect, it } from 'vitest';
import { isOverdue } from '../src/loans/overdue.js';

// The due date is a calendar date stored as midnight UTC of that date (see due-date.ts).
const due = new Date('2026-11-10T00:00:00.000Z');

describe('TEST-F10-01 overdue is a Bangkok calendar-day comparison (AC-F10-01, BR-09, NFR-08)', () => {
  it('is not overdue at 23:59 Bangkok on the due date', () => {
    // 16:59 UTC on 10 November is 23:59 in Bangkok (UTC+7).
    expect(isOverdue(due, new Date('2026-11-10T16:59:00.000Z'))).toBe(false);
  });

  it('is overdue at 00:00 Bangkok on the day after the due date', () => {
    expect(isOverdue(due, new Date('2026-11-10T17:00:00.000Z'))).toBe(true);
  });

  it('is not overdue before the due date or early on the due date in Bangkok', () => {
    expect(isOverdue(due, new Date('2026-11-09T05:00:00.000Z'))).toBe(false);
    // 00:30 Bangkok on 10 November is still 9 November in UTC.
    expect(isOverdue(due, new Date('2026-11-09T17:30:00.000Z'))).toBe(false);
  });

  it('is overdue several days after the due date, across a month end', () => {
    expect(isOverdue(due, new Date('2026-11-13T03:00:00.000Z'))).toBe(true);
    expect(
      isOverdue(new Date('2026-11-30T00:00:00.000Z'), new Date('2026-12-01T03:00:00.000Z')),
    ).toBe(true);
  });
});
