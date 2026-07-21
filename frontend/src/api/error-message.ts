import { isNetworkFailure } from "./index";

const defaultApiErrorMessage = "The API request failed.";

const apiErrorEnvelope = (
  error: unknown,
): { readonly code: string; readonly message: string } | undefined => {
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "object" &&
    error.error !== null &&
    "code" in error.error &&
    typeof error.error.code === "string" &&
    "message" in error.error &&
    typeof error.error.message === "string"
  ) {
    return { code: error.error.code, message: error.error.message };
  }
  return undefined;
};

export const apiErrorMessage = (
  error: unknown,
  fallback = defaultApiErrorMessage,
): string => {
  if (isNetworkFailure(error)) {
    return error.message;
  }
  const envelope = apiErrorEnvelope(error);
  if (envelope) {
    return envelope.message;
  }
  return fallback;
};

export const apiErrorDetails = (
  error: unknown,
  fallback = defaultApiErrorMessage,
): string => {
  if (isNetworkFailure(error)) {
    return error.message;
  }
  const envelope = apiErrorEnvelope(error);
  if (envelope) {
    return JSON.stringify(envelope, null, 2);
  }
  return fallback;
};
