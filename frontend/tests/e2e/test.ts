import process from "node:process";

import { test as base } from "@playwright/test";
import {
  getConfiguredWorkerCount,
  workerSetting,
} from "@tests/e2e/worker-pool";

const projectEnvironmentNames = {
  chromium: "CHROMIUM",
  webkit: "WEBKIT",
} as const;

const test = base.extend({
  baseURL: async ({}, provide, testInfo) => {
    const projectName = testInfo.project.name;
    if (!(projectName in projectEnvironmentNames)) {
      throw new Error(
        `unknown frontend e2e project: ${JSON.stringify(projectName)}`,
      );
    }

    const workerCount = getConfiguredWorkerCount();
    const slot = testInfo.parallelIndex;
    if (!Number.isSafeInteger(slot) || slot < 0 || slot >= workerCount) {
      throw new Error(
        `Playwright worker slot ${slot} is outside the ${workerCount}-server pool; set ${workerSetting} to at least the requested --workers value`,
      );
    }

    const browserEnvironmentName =
      projectEnvironmentNames[
        projectName as keyof typeof projectEnvironmentNames
      ];
    const environmentName = `MINA_FRONTEND_E2E_${browserEnvironmentName}_${slot}_URL`;
    const url = process.env[environmentName];
    if (url === undefined) {
      throw new Error(
        `missing Playwright web-server capture: ${environmentName}`,
      );
    }

    await provide(url);
  },
});

export { test };
