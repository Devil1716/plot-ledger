import { defineConfig, devices } from "@playwright/test";

const env = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-plot-ledger.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-plot-ledger",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:demo",
  NEXT_PUBLIC_USE_EMULATORS: "true",
  NEXT_PUBLIC_AUTH_EMULATOR_URL: "http://127.0.0.1:9199",
  NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: "127.0.0.1",
  NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: "8180",
};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:43123",
    timezoneId: "Asia/Kolkata",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:43123/login",
    reuseExistingServer: false,
    timeout: 120_000,
    env,
  },
});
