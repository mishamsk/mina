import { test as base } from "@playwright/test";
import { createTestBackend } from "@tests/e2e/backend-lifecycle";

const backendFixtureTimeoutMilliseconds = 45_000;

type Fixtures = {
  readonly authenticatedBackend: {
    readonly baseURL: string;
    readonly email: string;
    readonly password: string;
  };
};

const test = base.extend<Fixtures>({
  authenticatedBackend: [
    async ({}, provide) => {
      const backend = await createTestBackend({ authentication: true });
      if (backend.authentication === undefined) {
        throw new Error("authenticated backend returned no credentials");
      }
      await provide({
        baseURL: backend.baseURL,
        ...backend.authentication,
      });
      await backend.cleanup();
    },
    { scope: "test", timeout: backendFixtureTimeoutMilliseconds },
  ],
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
