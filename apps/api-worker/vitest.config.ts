import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15_000,
  },
});
