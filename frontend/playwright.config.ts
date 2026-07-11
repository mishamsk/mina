import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.MINA_FRONTEND_E2E_PORT ?? 18080);
const chromiumURL = `http://127.0.0.1:${port}`;
const webkitURL = `http://127.0.0.1:${port + 1}`;

const webServer = (serverPort: number, url: string) => ({
  command: `MINA_FX_AUTO_LOAD_ENABLED=false ../bin/mina serve --host 127.0.0.1 --port ${serverPort} --quiet --demo`,
  reuseExistingServer: false,
  timeout: 30_000,
  url: `${url}/api/health`,
});

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], baseURL: chromiumURL },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], baseURL: webkitURL },
    },
  ],
  webServer: [webServer(port, chromiumURL), webServer(port + 1, webkitURL)],
  use: {
    trace: "on-first-retry",
  },
});
