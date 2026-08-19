import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
  },
  resolve: {
    alias: { "@phc/shared": resolve(__dirname, "../../packages/shared/src/index.ts") },
  },
});
