import { test as base } from "@playwright/test";
import { createTestBackend } from "@tests/e2e/backend-lifecycle";

const backendFixtureTimeoutMilliseconds = 45_000;

type Backend = Awaited<ReturnType<typeof createTestBackend>>;
type AuthenticationCredentials = NonNullable<Backend["authentication"]>;

type Fixtures = {
  readonly _backend: Backend;
  readonly authenticationCredentials: AuthenticationCredentials;
};

type Options = {
  readonly backendAuthentication: boolean;
};

const requireAuthenticationCredentials = (
  backend: Backend,
): AuthenticationCredentials => {
  if (backend.authentication === undefined) {
    throw new Error("authenticated backend returned no credentials");
  }
  return backend.authentication;
};

const test = base.extend<Fixtures & Options>({
  backendAuthentication: [false, { option: true }],
  _backend: [
    async ({ backendAuthentication }, provide) => {
      const backend = await createTestBackend({
        authentication: backendAuthentication,
      });
      await provide(backend);
      await backend.cleanup();
    },
    { scope: "test", timeout: backendFixtureTimeoutMilliseconds },
  ],
  authenticationCredentials: async ({ _backend }, provide) => {
    await provide(requireAuthenticationCredentials(_backend));
  },
  baseURL: async ({ _backend }, provide) => {
    await provide(_backend.baseURL);
  },
});

export { test };
