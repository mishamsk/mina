import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type { StatusPageUiState } from "@/models/ui-state";

import {
  readStatusPageUiState,
  writeStatusPageUiState,
} from "../services/indexeddb";
import { createSelectors } from "./selectors";

const defaultStatusPageUiState: StatusPageUiState = {
  showDetails: false,
};

interface StatusPageState {
  readonly errorMessage: string | undefined;
  readonly statusPage: StatusPageUiState;
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : "Status page state could not be saved.";

const initialStatusPageState: StatusPageState = {
  errorMessage: undefined,
  statusPage: defaultStatusPageUiState,
};

const statusPageStore = create<StatusPageState>()(
  devtools(() => initialStatusPageState, { name: "StatusPageStore" }),
);

export const useStatusPageStore = createSelectors(statusPageStore);

export const useStatusPageView = () =>
  useStatusPageStore(
    useShallow((state) => ({
      errorMessage: state.errorMessage,
      showDetails: state.statusPage.showDetails,
    })),
  );

export const getStatusPageUiStateSnapshot = (): StatusPageUiState =>
  useStatusPageStore.getState().statusPage;

export const hydrateStatusPageUiState = async (): Promise<void> => {
  const storedState = await readStatusPageUiState();
  useStatusPageStore.setState(
    {
      errorMessage: undefined,
      statusPage: storedState ? { ...storedState } : defaultStatusPageUiState,
    },
    false,
    "StatusPageStore/hydrateStatusPageUiState",
  );
};

export const setStatusPageShowDetails = (showDetails: boolean): void => {
  const nextStatusPage = {
    ...useStatusPageStore.getState().statusPage,
    showDetails,
  };
  useStatusPageStore.setState(
    { errorMessage: undefined, statusPage: nextStatusPage },
    false,
    "StatusPageStore/setStatusPageShowDetails",
  );

  void writeStatusPageUiState(nextStatusPage).catch((error: unknown) => {
    useStatusPageStore.setState(
      { errorMessage: toErrorMessage(error) },
      false,
      "StatusPageStore/setStatusPageShowDetailsError",
    );
  });
};
