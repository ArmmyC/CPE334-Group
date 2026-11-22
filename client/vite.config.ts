import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5190,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4100', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.tsx', 'tests/**/*.test.ts'],
    setupFiles: './src/test/setup.ts',
    // Longer than the 5 second async util timeout in the setup file, so a missing element fails
    // with its own message and not with a bare test timeout.
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/test/**'],
      reporter: ['text', 'html'],
    },
  },
});
