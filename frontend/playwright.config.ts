import { cpus } from "node:os";
import process from "node:process";

import { defineConfig, devices } from "@playwright/test";
import {
  getConfiguredWorkerCount,
  workerSetting,
} from "@tests/e2e/worker-pool";

const browserNames = ["chromium", "webkit"] as const;
const configuredWorkerCount = getConfiguredWorkerCount();

const rawWorkerArgument = process.argv.findIndex(
  (argument) =>
    argument === "-j" ||
    argument.startsWith("-j") ||
    argument === "--workers" ||
    argument.startsWith("--workers="),
);
if (rawWorkerArgument !== -1) {
  const argument = process.argv[rawWorkerArgument]!;
  const rawValue =
    argument.startsWith("-j") && argument !== "-j"
      ? argument.slice(2)
      : argument.includes("=")
        ? argument.slice(argument.indexOf("=") + 1)
        : process.argv[rawWorkerArgument + 1];
  const requestedWorkerCount = rawValue?.endsWith("%")
    ? Math.max(
        1,
        Math.floor(cpus().length * (Number.parseInt(rawValue, 10) / 100)),
      )
    : Number(rawValue);
  if (
    Number.isSafeInteger(requestedWorkerCount) &&
    requestedWorkerCount > configuredWorkerCount
  ) {
    throw new Error(
      `--workers=${requestedWorkerCount} exceeds the ${configuredWorkerCount}-server pool; set ${workerSetting}=${requestedWorkerCount} instead`,
    );
  }
}

const webServer = (browser: (typeof browserNames)[number], slot: number) => {
  const browserEnvironmentName = browser.toUpperCase();
  const captureName = `MINA_FRONTEND_E2E_${browserEnvironmentName}_${slot}_URL`;

  return {
    command: "../bin/mina serve --host 127.0.0.1 --port 0 --quiet --demo",
    env: {
      MINA_BACKUP_FILE_DIRECTORY: `/tmp/mina-frontend-e2e-backups-${process.pid}-${browser}-${slot}`,
      MINA_FX_AUTO_LOAD_ENABLED: "false",
    },
    gracefulShutdown: { signal: "SIGTERM" as const, timeout: 5_000 },
    name: `mina-${browser}-${slot}`,
    timeout: 30_000,
    wait: {
      stdout: new RegExp(
        `listening (?<${captureName}>http:\\/\\/127\\.0\\.0\\.1:\\d+)`,
      ),
    },
  };
};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  forbidOnly: Boolean(process.env.CI),
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
  webServer: browserNames.flatMap((browser) =>
    Array.from({ length: configuredWorkerCount }, (_, slot) =>
      webServer(browser, slot),
    ),
  ),
  use: {
    trace: "on-first-retry",
  },
});
