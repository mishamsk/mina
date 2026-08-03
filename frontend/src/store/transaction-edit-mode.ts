import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

interface TransactionEditModeState {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly exitRequested: boolean;
  readonly invalidAmountDraftTransactionIds: ReadonlySet<number>;
  readonly pendingAmountTransactionIds: ReadonlySet<number>;
}

interface TransactionEditModeView {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly pendingAmountSave: boolean;
}

const initialTransactionEditModeState: TransactionEditModeState = {
  available: false,
  enabled: false,
  exitRequested: false,
  invalidAmountDraftTransactionIds: new Set(),
  pendingAmountTransactionIds: new Set(),
};

const transactionEditModeStore = create<TransactionEditModeState>()(
  devtools(() => initialTransactionEditModeState, {
    name: "TransactionEditModeStore",
  }),
);

let deferredEntryOpen: (() => void) | undefined;

export const useTransactionEditModeStore = transactionEditModeStore;

export const useTransactionEditModeView = (): TransactionEditModeView =>
  useTransactionEditModeStore(
    useShallow((state) => ({
      available: state.available,
      enabled: state.enabled,
      pendingAmountSave: state.pendingAmountTransactionIds.size > 0,
    })),
  );

export const useTransactionEditModeAvailable = (): boolean =>
  useTransactionEditModeStore((state) => state.available);

export const getTransactionEditModeSnapshot = (): TransactionEditModeState =>
  useTransactionEditModeStore.getState();

export const setTransactionEditModeAvailable = (available: boolean): void => {
  if (!available) {
    deferredEntryOpen = undefined;
  }
  useTransactionEditModeStore.setState(
    available ? { available } : initialTransactionEditModeState,
    false,
    "TransactionEditModeStore/setTransactionEditModeAvailable",
  );
};

export const setTransactionEditModeEnabled = (enabled: boolean): void => {
  if (enabled) {
    deferredEntryOpen = undefined;
  }
  useTransactionEditModeStore.setState(
    (state) =>
      enabled
        ? { enabled: state.available, exitRequested: false }
        : state.pendingAmountTransactionIds.size > 0
          ? { exitRequested: true }
          : state.invalidAmountDraftTransactionIds.size > 0
            ? { exitRequested: false }
            : { enabled: false, exitRequested: false },
    false,
    "TransactionEditModeStore/setTransactionEditModeEnabled",
  );
};

export const exitTransactionEditModeForEntry = (onExit: () => void): void => {
  const state = useTransactionEditModeStore.getState();
  if (state.pendingAmountTransactionIds.size > 0) {
    deferredEntryOpen = onExit;
    useTransactionEditModeStore.setState(
      { exitRequested: true },
      false,
      "TransactionEditModeStore/exitTransactionEditModeForEntry",
    );
    return;
  }

  deferredEntryOpen = undefined;
  useTransactionEditModeStore.setState(
    { enabled: false, exitRequested: false },
    false,
    "TransactionEditModeStore/exitTransactionEditModeForEntry",
  );
  onExit();
};

export const cancelDeferredTransactionEntryOpen = (): void => {
  if (!deferredEntryOpen) {
    return;
  }
  deferredEntryOpen = undefined;
  useTransactionEditModeStore.setState(
    { exitRequested: false },
    false,
    "TransactionEditModeStore/cancelDeferredTransactionEntryOpen",
  );
};

export const setTransactionAmountSavePending = (
  transactionId: number,
  pending: boolean,
  successful = false,
): void => {
  let cancelDeferredEntryOpen = false;
  let runDeferredEntryOpen = false;
  useTransactionEditModeStore.setState(
    (state) => {
      const pendingAmountTransactionIds = new Set(
        state.pendingAmountTransactionIds,
      );
      if (pending) {
        pendingAmountTransactionIds.add(transactionId);
      } else {
        pendingAmountTransactionIds.delete(transactionId);
      }
      if (!pending && state.exitRequested) {
        if (!successful) {
          cancelDeferredEntryOpen = true;
          return { exitRequested: false, pendingAmountTransactionIds };
        }
        if (pendingAmountTransactionIds.size === 0) {
          runDeferredEntryOpen = true;
          return {
            enabled: false,
            exitRequested: false,
            pendingAmountTransactionIds,
          };
        }
      }
      return { pendingAmountTransactionIds };
    },
    false,
    "TransactionEditModeStore/setTransactionAmountSavePending",
  );
  if (cancelDeferredEntryOpen) {
    deferredEntryOpen = undefined;
  } else if (runDeferredEntryOpen) {
    const openEntry = deferredEntryOpen;
    deferredEntryOpen = undefined;
    openEntry?.();
  }
};

export const setTransactionAmountDraftInvalid = (
  transactionId: number,
  invalid: boolean,
): void => {
  useTransactionEditModeStore.setState(
    (state) => {
      const invalidAmountDraftTransactionIds = new Set(
        state.invalidAmountDraftTransactionIds,
      );
      if (invalid) {
        invalidAmountDraftTransactionIds.add(transactionId);
      } else {
        invalidAmountDraftTransactionIds.delete(transactionId);
      }
      return { invalidAmountDraftTransactionIds };
    },
    false,
    "TransactionEditModeStore/setTransactionAmountDraftInvalid",
  );
};

export const toggleTransactionEditMode = (): void => {
  useTransactionEditModeStore.setState(
    (state) =>
      state.enabled
        ? state.pendingAmountTransactionIds.size > 0
          ? { exitRequested: true }
          : state.invalidAmountDraftTransactionIds.size > 0
            ? { exitRequested: false }
            : { enabled: false, exitRequested: false }
        : { enabled: state.available, exitRequested: false },
    false,
    "TransactionEditModeStore/toggleTransactionEditMode",
  );
};
