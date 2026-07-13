import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type { TransactionEntryType } from "@/models/ui-state";

interface TransactionEntryPanelState {
  readonly initialTab: TransactionEntryType | undefined;
  readonly open: boolean;
}

const initialTransactionEntryPanelState: TransactionEntryPanelState = {
  initialTab: undefined,
  open: false,
};

const transactionEntryPanelStore = create<TransactionEntryPanelState>()(
  devtools(() => initialTransactionEntryPanelState, {
    name: "TransactionEntryPanelStore",
  }),
);

export const useTransactionEntryPanelStore = transactionEntryPanelStore;

export const useTransactionEntryPanelView = (): TransactionEntryPanelState =>
  useTransactionEntryPanelStore(
    useShallow((state) => ({
      initialTab: state.initialTab,
      open: state.open,
    })),
  );

export const getTransactionEntryPanelSnapshot =
  (): TransactionEntryPanelState => useTransactionEntryPanelStore.getState();

export const openTransactionEntryPanel = (
  initialTab?: TransactionEntryType,
): void => {
  useTransactionEntryPanelStore.setState(
    {
      initialTab,
      open: true,
    },
    false,
    "TransactionEntryPanelStore/openTransactionEntryPanel",
  );
};

export const closeTransactionEntryPanel = (): void => {
  useTransactionEntryPanelStore.setState(
    {
      initialTab: undefined,
      open: false,
    },
    false,
    "TransactionEntryPanelStore/closeTransactionEntryPanel",
  );
};
