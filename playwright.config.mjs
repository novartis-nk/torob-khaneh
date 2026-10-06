import { defineConfig } from '@playwright/test';
const webPort = process.env.PLAYWRIGHT_PORT || '4317';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    channel: 'chrome',
    headless: true,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
  webServer: {
    command: 'npm run dev',
    url: `http://127.0.0.1:${webPort}/api/health`,
    reuseExistingServer: true,
  },
});
