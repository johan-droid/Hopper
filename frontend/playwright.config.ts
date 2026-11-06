import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

/**
 * The preview server runs the production build, so these tests cover the real
 * bundle, the real router and the SPA fallback — not the dev server.
 *
 * Supabase is pointed at a syntactically valid but non-existent project so the
 * app takes its real anonymous path. No credential in this file is usable.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  expect: {
    timeout: 7_000,
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL: BASE_URL,
    trace: 'off',
    video: 'off',
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'dark',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'e2e-anonymous-key-not-a-real-credential',
    },
  },
});
