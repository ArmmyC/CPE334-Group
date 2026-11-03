import { defineConfig } from '@playwright/test';

const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: isCi ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5190',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'desktop', use: { viewport: { width: 1280, height: 800 } } }],
  webServer: [
    {
      command: 'npm run e2e:server',
      url: 'http://127.0.0.1:4100/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run e2e:client',
      url: 'http://127.0.0.1:5190',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
