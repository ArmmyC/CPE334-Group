import { describe, expect, it } from 'vitest';
import { p95, summarize } from '../../scripts/percentile.mjs';

const oneToFifty = Array.from({ length: 50 }, (_, i) => i + 1);

describe('TEST-SR08-01 the 95th percentile of the response times (AC-SR08-03, NFR-14)', () => {
  it('takes the 48th smallest of 50 values (nearest-rank)', () => {
    expect(p95(oneToFifty)).toBe(48);
  });

  it('gives the same answer for unsorted input and does not change it', () => {
    const shuffled = [...oneToFifty].reverse();
    shuffled.push(shuffled.shift()!);
    const copy = [...shuffled];

    expect(p95(shuffled)).toBe(48);
    expect(shuffled).toEqual(copy);
  });

  it('gives that value for a single value and refuses an empty list', () => {
    expect(p95([730])).toBe(730);
    expect(() => p95([])).toThrow('at least one value');
  });

  it('summarizes with count, min, median, p95, max and a PASS or FAIL against the limit', () => {
    expect(summarize(oneToFifty, 1000)).toEqual({
      count: 50,
      min: 1,
      median: 25.5,
      p95: 48,
      max: 50,
      pass: true,
    });
    expect(summarize([...oneToFifty.slice(0, 46), 900, 1500, 1600, 2000], 1000).pass).toBe(false);
    expect(summarize([100, 200, 1000], 1000).pass).toBe(true);
  });
});
