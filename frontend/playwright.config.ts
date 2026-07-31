import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

const workerSetting = "MINA_FRONTEND_E2E_WORKERS";
const rawWorkerCount = process.env[workerSetting];
const configuredWorkerCount =
  rawWorkerCount === undefined ? 2 : Number(rawWorkerCount);
if (
  !Number.isSafeInteger(configuredWorkerCount) ||
  configuredWorkerCount <= 0
) {
  throw new Error(
    `${workerSetting} must be a positive integer; received ${JSON.stringify(rawWorkerCount)}`,
  );
}

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  forbidOnly: Boolean(process.env.CI),
  globalSetup: "./tests/e2e/global-setup.ts",
  retries: 0,
  workers: configuredWorkerCount,
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
  use: {
    trace: "retain-on-failure",
  },
});
