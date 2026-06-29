import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { hydrateUiPreferences } from "./preferences";
import { createSelectors } from "./selectors";
import { hydrateStatusPageUiState } from "./status-page";

export type BootstrapStatus = "hydrating" | "ready" | "failed";

interface BootstrapState {
  readonly errorMessage: string | undefined;
  readonly status: BootstrapStatus;
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Browser state failed to load.";

const initialBootstrapState: BootstrapState = {
  errorMessage: undefined,
  status: "hydrating",
};

const bootstrapStore = create<BootstrapState>()(
  devtools(() => initialBootstrapState, { name: "BootstrapStore" }),
);

export const useBootstrapStore = createSelectors(bootstrapStore);

export const useBootstrapView = () =>
  useBootstrapStore(
    useShallow((state) => ({
      errorMessage: state.errorMessage,
      status: state.status,
    })),
  );

export const getBootstrapStatusSnapshot = (): BootstrapStatus =>
  useBootstrapStore.getState().status;

export const setBootstrapReady = (): void => {
  useBootstrapStore.setState(
    { errorMessage: undefined, status: "ready" },
    false,
    "BootstrapStore/setReady",
  );
};

export const setBootstrapFailed = (error: unknown): void => {
  useBootstrapStore.setState(
    { errorMessage: toErrorMessage(error), status: "failed" },
    false,
    "BootstrapStore/setFailed",
  );
};

export const hydrateBrowserState = async (): Promise<void> => {
  try {
    await Promise.all([hydrateUiPreferences(), hydrateStatusPageUiState()]);
    setBootstrapReady();
  } catch (error) {
    setBootstrapFailed(error);
  }
};
