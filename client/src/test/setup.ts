import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// findBy and waitFor give up after 1 second by default, which is too short when the whole suite
// runs in parallel on a busy machine. A passing test still returns as soon as it is ready.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
