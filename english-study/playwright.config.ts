import { defineConfig, devices } from '@playwright/test';

declare const process: {
  env: Record<string, string | undefined>;
};

const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'npm run dev -- --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...(browserChannel ? { channel: browserChannel } : {}),
    permissions: ['microphone'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
    },
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] }
    }
  ]
});
