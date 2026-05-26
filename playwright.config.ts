import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3101',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'NEXT_DIST_DIR=.next-e2e NEXT_PUBLIC_E2E_MOCK_OUTREACH=1 E2E_MOCK_OUTREACH=1 npm run dev -- --hostname 127.0.0.1 --port 3101',
    url: 'http://127.0.0.1:3101/launch',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_E2E_MOCK_OUTREACH: '1',
      E2E_MOCK_OUTREACH: '1',
      NEXT_DIST_DIR: '.next-e2e',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
