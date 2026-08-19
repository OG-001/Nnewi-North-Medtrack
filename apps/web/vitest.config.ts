import { defineConfig } from "vitest/config";

/**
 * Unit tests for the client sync engine. Playwright covers the real offline
 * journeys (see e2e/); these drive the durability edges that are awkward to
 * reach through the UI — a crash mid-push, a watermark moving backwards.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
