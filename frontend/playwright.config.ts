import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.MINA_FRONTEND_E2E_PORT ?? 18080);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  forbidOnly: Boolean(process.env.CI),
  workers: process.env.CI ? 1 : undefined,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: `MINA_FX_AUTO_LOAD_ENABLED=false ../bin/mina serve --host 127.0.0.1 --port ${port} --quiet`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    url: `${baseURL}/api/health`,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
});
