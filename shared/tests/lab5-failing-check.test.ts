import { expect, it } from 'vitest';

// Lab 5 evidence C-02: this test fails on purpose. The branch is never merged.
it('fails on purpose so the required check blocks the merge', () => {
  expect(1 + 1).toBe(3);
});
