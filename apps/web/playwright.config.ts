import { defineConfig, devices } from "@playwright/test";

/**
 * Offline e2e harness. Every clinic workflow must pass with the network
 * disabled before Phase 3 can exit (offline-sync-design §10).
 *
 * These run against the **production build**, not the dev server: reloading
 * while offline is served by the PWA service worker, and vite-plugin-pwa only
 * emits one for `vite build`. Testing against `vite dev` would prove nothing
 * about the offline guarantee.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // each spec drives one device's local store
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : [["list"]],
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4173",
    trace: "retain-on-failure",
    // A low-end Android tablet is the target device (tech-stack §4).
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm build && pnpm preview",
        url: "http://localhost:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
