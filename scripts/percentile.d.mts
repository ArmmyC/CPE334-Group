export function percentile(values: number[], p: number): number;
export function p95(values: number[]): number;
export function summarize(
  values: number[],
  limitMs: number,
): { count: number; min: number; median: number; p95: number; max: number; pass: boolean };
