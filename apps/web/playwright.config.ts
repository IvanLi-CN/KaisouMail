import { defineConfig } from "@playwright/test";

const port = Number(process.env.PORT ?? 4173);

export default defineConfig({
  testDir: "./src/test/e2e",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  webServer: {
    command: `VITE_DEMO_MODE=true bun run build && VITE_DEMO_MODE=true bunx vite preview --host 127.0.0.1 --port ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
