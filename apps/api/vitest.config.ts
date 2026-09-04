import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    /**
     * Run test files one at a time.
     *
     * The live-hub suites share a single hub and database. Several of them
     * assert on the state of the change feed (that server_seq is strictly
     * increasing, that an up-to-date device pulls nothing), and those
     * assertions are only meaningful if nothing else is pushing at the same
     * moment. Run in parallel they interfere with each other and fail at
     * random, which is worse than failing honestly.
     */
    fileParallelism: false,
  },
  resolve: {
    alias: { "@phc/shared": resolve(__dirname, "../../packages/shared/src/index.ts") },
  },
});
