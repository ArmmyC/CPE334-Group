import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', include: ['tests/overdue.test.ts', 'tests/due-date.test.ts'] },
});
