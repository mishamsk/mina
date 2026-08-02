import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type { AuthenticationUser } from "@/api";
import {
  apiErrorMessage,
  configureAuthenticationLifecycle,
  getAuthenticationStatus,
  login,
  logout,
} from "@/api";

import { createSelectors } from "./selectors";

export type AuthenticationPhase =
  "unknown" | "disabled" | "unauthenticated" | "authenticated";

interface AuthenticationState {
  readonly phase: AuthenticationPhase;
  readonly user: AuthenticationUser | undefined;
}

const initialAuthenticationState: AuthenticationState = {
  phase: "unknown",
  user: undefined,
};

const authenticationStore = create<AuthenticationState>()(
  devtools(() => initialAuthenticationState, { name: "AuthenticationStore" }),
);

let pendingLogoutController: AbortController | undefined;
let authenticationGeneration = 0;

const advanceAuthenticationGeneration = (): void => {
  authenticationGeneration += 1;
};

const getAuthenticationGeneration = (): number => authenticationGeneration;

export const useAuthenticationStore = createSelectors(authenticationStore);

export const getAuthenticationSnapshot = () =>
  useAuthenticationStore.getState();

export const useAuthenticationView = () =>
  useAuthenticationStore(
    useShallow((state) => ({
      phase: state.phase,
      user: state.user,
    })),
  );

export const setAuthenticationLost = (): void => {
  advanceAuthenticationGeneration();
  useAuthenticationStore.setState(
    {
      phase: "unauthenticated",
      user: undefined,
    },
    false,
    "AuthenticationStore/setLost",
  );
};

export const initializeAuthenticationLifecycle = (): void => {
  configureAuthenticationLifecycle({
    getGeneration: getAuthenticationGeneration,
    onInvalid: setAuthenticationLost,
  });
};

export const hydrateAuthentication = async (): Promise<void> => {
  const generation = getAuthenticationGeneration();
  const result = await getAuthenticationStatus();
  if (generation !== getAuthenticationGeneration()) {
    return;
  }
  if (result.error) {
    throw new Error(
      apiErrorMessage(
        result.error,
        "Authentication status could not be loaded.",
      ),
    );
  }
  if (!result.data) {
    throw new Error("Authentication status returned no data.");
  }
  useAuthenticationStore.setState(
    {
      phase: !result.data.enabled
        ? "disabled"
        : result.data.authenticated
          ? "authenticated"
          : "unauthenticated",
      user: result.data.user ?? undefined,
    },
    false,
    "AuthenticationStore/hydrate",
  );
};

export const loginAuthentication = async (
  email: string,
  password: string,
): Promise<
  | { readonly shellAvailable: true }
  | { readonly shellAvailable: false; readonly errorMessage: string }
> => {
  advanceAuthenticationGeneration();
  pendingLogoutController?.abort();
  pendingLogoutController = undefined;
  const result = await login({ body: { email, password } });
  if (result.error || !result.data?.authenticated) {
    try {
      await hydrateAuthentication();
      if (getAuthenticationSnapshot().phase === "disabled") {
        return { shellAvailable: true };
      }
    } catch {
      // Preserve the login response as the actionable failure.
    }
    return {
      shellAvailable: false,
      errorMessage: apiErrorMessage(
        result.error,
        "The email or password was not accepted.",
      ),
    };
  }
  useAuthenticationStore.setState(
    {
      phase: "authenticated",
      user: result.data.user ?? undefined,
    },
    false,
    "AuthenticationStore/loginSucceeded",
  );
  return { shellAvailable: true };
};

export const logoutAuthentication = async (): Promise<string | undefined> => {
  const generation = getAuthenticationGeneration();
  const controller = new AbortController();
  pendingLogoutController?.abort();
  pendingLogoutController = controller;
  const result = await logout({ signal: controller.signal });
  if (pendingLogoutController === controller) {
    pendingLogoutController = undefined;
  }
  if (
    controller.signal.aborted ||
    generation !== getAuthenticationGeneration()
  ) {
    return undefined;
  }
  if (result.error) {
    return apiErrorMessage(result.error, "Logout failed.");
  }
  advanceAuthenticationGeneration();
  try {
    await hydrateAuthentication();
  } catch {
    setAuthenticationLost();
  }
  return undefined;
};
