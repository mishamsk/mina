import { client } from "./generated/client.gen";

export interface NetworkFailure {
  readonly kind: "network_failure";
  readonly message: string;
  readonly cause: unknown;
}

const defaultNetworkFailureMessage = "Network request failed";
export const apiMutationCompletedEvent = "mina:api-mutation-completed";

const requestAuthenticationGenerations = new WeakMap<Request, number>();
let authenticationLifecycle: AuthenticationLifecycle | undefined;

export interface AuthenticationLifecycle {
  readonly getGeneration: () => number;
  readonly onInvalid: () => void;
}

export const configureAuthenticationLifecycle = (
  lifecycle: AuthenticationLifecycle,
): void => {
  authenticationLifecycle = lifecycle;
};

export const getApiBaseUrl = (): string => {
  if (globalThis.location?.origin) {
    return globalThis.location.origin;
  }
  return "";
};

export const isNetworkFailure = (value: unknown): value is NetworkFailure =>
  typeof value === "object" &&
  value !== null &&
  "kind" in value &&
  value.kind === "network_failure";

export const normalizeNetworkFailure = (cause: unknown): NetworkFailure => ({
  cause,
  kind: "network_failure",
  message:
    cause instanceof Error ? cause.message : defaultNetworkFailureMessage,
});

export const configureApiClient = (baseUrl = getApiBaseUrl()): void => {
  client.setConfig({ baseUrl });
};

client.interceptors.request.use((request) => {
  request.headers.set("X-Mina-Client-Surface", "web-ui");
  if (authenticationLifecycle) {
    requestAuthenticationGenerations.set(
      request,
      authenticationLifecycle.getGeneration(),
    );
  }
  return request;
});

client.interceptors.response.use((response, request) => {
  if (request.method !== "GET") {
    window.dispatchEvent(new Event(apiMutationCompletedEvent));
  }
  return response;
});

client.interceptors.error.use((error, response, request) => {
  if (response) {
    if (
      response.status === 401 &&
      request !== undefined &&
      authenticationLifecycle !== undefined &&
      requestAuthenticationGenerations.get(request) ===
        authenticationLifecycle.getGeneration()
    ) {
      authenticationLifecycle.onInvalid();
    }
    return error;
  }
  return normalizeNetworkFailure(error);
});

configureApiClient();

export { client as apiClient };
