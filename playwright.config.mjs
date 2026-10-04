import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4317',
    channel: 'chrome',
    headless: true,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:4317/api/health',
    reuseExistingServer: true,
  },
});
