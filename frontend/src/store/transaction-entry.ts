import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type { Transaction, TransactionTemplate } from "@/api";
import type { TransactionEntryType } from "@/models/ui-state";

import {
  cancelDeferredTransactionEntryOpen,
  exitTransactionEditModeForEntry,
} from "./transaction-edit-mode";

export type TransactionEntryLaunchType = "duplicate" | "edit" | "split";
export const transactionEntryWillOpenEvent = "mina:transaction-entry-will-open";

export interface TransactionEntryRegisterSummary {
  readonly accountIds: readonly number[];
  readonly displayTitle: string;
  readonly initiatedDate: string;
  readonly kind: "register-summary";
  readonly transactionId: number;
}

export type TransactionEntryRecentTransaction =
  Transaction | TransactionEntryRegisterSummary;

export interface TransactionEntryLaunchContext {
  readonly recentTransactions: readonly TransactionEntryRecentTransaction[];
}

export interface TransactionEntryLaunch {
  readonly amountConflict?: {
    readonly amount: string;
    readonly recordIds: readonly [number, number];
  };
  readonly opener?: HTMLElement;
  readonly transaction: Transaction;
  readonly type: TransactionEntryLaunchType;
}

interface TransactionEntryModalState {
  readonly errorMessage: string | undefined;
  readonly initialTab: TransactionEntryType | undefined;
  readonly initialTemplate: TransactionTemplate | undefined;
  readonly launch: TransactionEntryLaunch | undefined;
  readonly loading: boolean;
  readonly open: boolean;
  readonly recentTransactions: readonly TransactionEntryRecentTransaction[];
  readonly requestedEntry: string | undefined;
}

const initialTransactionEntryModalState: TransactionEntryModalState = {
  errorMessage: undefined,
  initialTab: undefined,
  initialTemplate: undefined,
  launch: undefined,
  loading: false,
  open: false,
  recentTransactions: [],
  requestedEntry: undefined,
};

const transactionEntryModalStore = create<TransactionEntryModalState>()(
  devtools(() => initialTransactionEntryModalState, {
    name: "TransactionEntryModalStore",
  }),
);

export const useTransactionEntryPanelStore = transactionEntryModalStore;

export const useTransactionEntryPanelView = (): TransactionEntryModalState =>
  useTransactionEntryPanelStore(
    useShallow((state) => ({
      errorMessage: state.errorMessage,
      initialTab: state.initialTab,
      initialTemplate: state.initialTemplate,
      launch: state.launch,
      loading: state.loading,
      open: state.open,
      recentTransactions: state.recentTransactions,
      requestedEntry: state.requestedEntry,
    })),
  );

export const getTransactionEntryPanelSnapshot =
  (): TransactionEntryModalState => useTransactionEntryPanelStore.getState();

const prepareEntryOpen = (openEntry: () => void): void => {
  exitTransactionEditModeForEntry(() => {
    window.dispatchEvent(new Event(transactionEntryWillOpenEvent));
    openEntry();
  });
};

export const openTransactionEntryPanel = (
  initialTab?: TransactionEntryType,
  context: TransactionEntryLaunchContext = { recentTransactions: [] },
): void => {
  prepareEntryOpen(() => {
    useTransactionEntryPanelStore.setState(
      {
        errorMessage: undefined,
        initialTab,
        initialTemplate: undefined,
        launch: undefined,
        loading: false,
        open: true,
        recentTransactions: context.recentTransactions,
        requestedEntry: initialTab
          ? `new:${initialTab === "advanced" ? "journal" : initialTab}`
          : "new",
      },
      false,
      "TransactionEntryModalStore/openTransactionEntryPanel",
    );
  });
};

export const openTransactionEntryLaunch = (
  launch: TransactionEntryLaunch,
  context: TransactionEntryLaunchContext = { recentTransactions: [] },
): void => {
  prepareEntryOpen(() => {
    useTransactionEntryPanelStore.setState(
      {
        errorMessage: undefined,
        initialTab: undefined,
        initialTemplate: undefined,
        launch,
        loading: false,
        open: true,
        recentTransactions: context.recentTransactions,
        requestedEntry: `${launch.type}:${launch.transaction.transaction_id}`,
      },
      false,
      "TransactionEntryModalStore/openTransactionEntryLaunch",
    );
  });
};

export const loadTransactionEntryRoute = (
  requestedEntry: string,
  onReady: () => void,
  context: TransactionEntryLaunchContext = { recentTransactions: [] },
): void => {
  prepareEntryOpen(() => {
    useTransactionEntryPanelStore.setState(
      {
        errorMessage: undefined,
        initialTab: undefined,
        initialTemplate: undefined,
        launch: undefined,
        loading: true,
        open: true,
        recentTransactions: context.recentTransactions,
        requestedEntry,
      },
      false,
      "TransactionEntryModalStore/loadTransactionEntryRoute",
    );
    onReady();
  });
};

export const resolveTransactionEntryRoute = (
  requestedEntry: string,
  launch: TransactionEntryLaunch,
): void => {
  if (
    useTransactionEntryPanelStore.getState().requestedEntry !== requestedEntry
  ) {
    return;
  }
  useTransactionEntryPanelStore.setState(
    { launch, loading: false },
    false,
    "TransactionEntryModalStore/resolveTransactionEntryRoute",
  );
};

export const failTransactionEntryRoute = (
  requestedEntry: string,
  errorMessage: string,
): void => {
  if (
    useTransactionEntryPanelStore.getState().requestedEntry !== requestedEntry
  ) {
    return;
  }
  useTransactionEntryPanelStore.setState(
    { errorMessage, loading: false },
    false,
    "TransactionEntryModalStore/failTransactionEntryRoute",
  );
};

export const openTransactionEntryRoute = (
  requestedEntry: string,
  initialTab?: TransactionEntryType,
  context: TransactionEntryLaunchContext = { recentTransactions: [] },
): void => {
  prepareEntryOpen(() => {
    useTransactionEntryPanelStore.setState(
      {
        errorMessage: undefined,
        initialTab,
        initialTemplate: undefined,
        launch: undefined,
        loading: false,
        open: true,
        recentTransactions: context.recentTransactions,
        requestedEntry,
      },
      false,
      "TransactionEntryModalStore/openTransactionEntryRoute",
    );
  });
};

export const openTransactionEntryTemplate = (
  template: TransactionTemplate,
  context: TransactionEntryLaunchContext = { recentTransactions: [] },
): void => {
  prepareEntryOpen(() => {
    const initialTab =
      template.compatible_shorthands.length === 1
        ? template.compatible_shorthands[0]!
        : "advanced";
    useTransactionEntryPanelStore.setState(
      {
        errorMessage: undefined,
        initialTab,
        initialTemplate: template,
        launch: undefined,
        loading: false,
        open: true,
        recentTransactions: context.recentTransactions,
        requestedEntry: `new:${initialTab === "advanced" ? "journal" : initialTab}`,
      },
      false,
      "TransactionEntryModalStore/openTransactionEntryTemplate",
    );
  });
};

export const closeTransactionEntryPanel = (): void => {
  cancelDeferredTransactionEntryOpen();
  useTransactionEntryPanelStore.setState(
    {
      errorMessage: undefined,
      initialTab: undefined,
      initialTemplate: undefined,
      launch: undefined,
      loading: false,
      open: false,
      recentTransactions: [],
      requestedEntry: undefined,
    },
    false,
    "TransactionEntryModalStore/closeTransactionEntryPanel",
  );
};
