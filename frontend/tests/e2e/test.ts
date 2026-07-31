import { test as base } from "@playwright/test";
import { createTestBackend } from "@tests/e2e/backend-lifecycle";

const backendFixtureTimeoutMilliseconds = 45_000;

const test = base.extend({
  baseURL: [
    async ({}, provide) => {
      const backend = await createTestBackend();
      await provide(backend.baseURL);
      await backend.cleanup();
    },
    { scope: "test", timeout: backendFixtureTimeoutMilliseconds },
  ],
});

export { test };
