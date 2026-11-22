// SR-08: the statistics of the response-time measurement, kept apart from the network code so
// they can be unit tested with fixed numbers.

// Nearest-rank percentile: the value at rank ceil(p * n) of the sorted list. For 50 values the
// 95th percentile is the 48th smallest. The input is not changed.
export function percentile(values, p) {
  if (values.length === 0) throw new Error('A percentile needs at least one value.');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(1, Math.ceil(p * sorted.length)) - 1];
}

export const p95 = (values) => percentile(values, 0.95);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Count, min, median, p95, max, and `pass` when p95 is at or under the limit in milliseconds.
export function summarize(values, limitMs) {
  const result = p95(values);
  return {
    count: values.length,
    min: Math.min(...values),
    median: median(values),
    p95: result,
    max: Math.max(...values),
    pass: result <= limitMs,
  };
}
