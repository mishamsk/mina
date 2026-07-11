import { client } from "./generated/client.gen";
export { apiErrorMessage } from "./error-message";
export * from "./generated";
export * from "./ledger";

export interface NetworkFailure {
  readonly kind: "network_failure";
  readonly message: string;
  readonly cause: unknown;
}

const defaultNetworkFailureMessage = "Network request failed";

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

client.interceptors.error.use((error, response) => {
  if (response) {
    return error;
  }
  return normalizeNetworkFailure(error);
});

configureApiClient();

export { client as apiClient };
