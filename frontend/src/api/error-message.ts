import { isNetworkFailure } from "./index";

const defaultApiErrorMessage = "The API request failed.";

export const apiErrorMessage = (
  error: unknown,
  fallback = defaultApiErrorMessage,
): string => {
  if (isNetworkFailure(error)) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "object" &&
    error.error !== null &&
    "message" in error.error &&
    typeof error.error.message === "string"
  ) {
    return error.error.message;
  }
  return fallback;
};
