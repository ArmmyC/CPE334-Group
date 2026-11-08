import { describe, expect, it } from 'vitest';
import { dueDateFor } from '../src/loans/due-date.js';

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe('TEST-F04-03 due date in Asia/Bangkok days (AC-F04-03, BR-05, NFR-08)', () => {
  it('counts from 8 November at 23:59 Bangkok and from 9 November at 00:00 Bangkok', () => {
    // 16:59 UTC is 23:59 in Bangkok (UTC+7). 17:00 UTC is 00:00 the next day.
    expect(iso(dueDateFor(new Date('2026-11-08T16:59:00.000Z'), 7))).toBe('2026-11-15');
    expect(iso(dueDateFor(new Date('2026-11-08T17:00:00.000Z'), 7))).toBe('2026-11-16');
  });

  it('uses the Bangkok date, not the UTC date, early in the Bangkok morning', () => {
    // 00:30 in Bangkok on 9 November is still 8 November in UTC.
    expect(iso(dueDateFor(new Date('2026-11-08T17:30:00.000Z'), 1))).toBe('2026-11-10');
    expect(iso(dueDateFor(new Date('2026-11-09T06:59:00.000Z'), 1))).toBe('2026-11-10');
  });

  it('adds the loan period of 1, 7, and 30 days', () => {
    const now = new Date('2026-11-08T03:00:00.000Z');

    expect(iso(dueDateFor(now, 1))).toBe('2026-11-09');
    expect(iso(dueDateFor(now, 7))).toBe('2026-11-15');
    expect(iso(dueDateFor(now, 30))).toBe('2026-12-08');
  });

  it('rolls over a month end and a year end', () => {
    expect(iso(dueDateFor(new Date('2026-11-27T03:00:00.000Z'), 7))).toBe('2026-12-04');
    expect(iso(dueDateFor(new Date('2026-12-28T03:00:00.000Z'), 7))).toBe('2027-01-04');
    expect(iso(dueDateFor(new Date('2026-12-31T16:59:00.000Z'), 1))).toBe('2027-01-01');
    expect(iso(dueDateFor(new Date('2026-12-31T17:00:00.000Z'), 1))).toBe('2027-01-02');
  });

  it('handles 29 February in a leap year', () => {
    expect(iso(dueDateFor(new Date('2028-02-28T03:00:00.000Z'), 1))).toBe('2028-02-29');
    expect(iso(dueDateFor(new Date('2028-02-28T03:00:00.000Z'), 2))).toBe('2028-03-01');
  });

  it('returns midnight UTC, so the stored date does not depend on the process time zone', () => {
    const due = dueDateFor(new Date('2026-11-08T17:00:00.000Z'), 7);

    expect(due.toISOString()).toBe('2026-11-16T00:00:00.000Z');
  });
});
