import { defineConfig, devices } from '@playwright/test';

// Test utente su desktop, tablet e mobile (Chromium = Android/desktop, WebKit = iPhone/iPad Safari).
// Le pagine dell'app girano sul dev server in "modalità E2E" (GM simulato, nessun login Google).
// I test PWA (manifest, service worker, offline) girano sul sito pubblicato.
export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 3,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-report' }]],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } } },
    { name: 'tablet-ipad', use: { ...devices['iPad Pro 11'] } },
    { name: 'android', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
