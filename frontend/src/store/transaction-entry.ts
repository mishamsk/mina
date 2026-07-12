import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type { TransactionEntryType } from "@/models/ui-state";

interface TransactionEntryPanelState {
  readonly initialTab: TransactionEntryType | undefined;
  readonly open: boolean;
  readonly revision: number;
}

const initialTransactionEntryPanelState: TransactionEntryPanelState = {
  initialTab: undefined,
  open: false,
  revision: 0,
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
      revision: state.revision,
    })),
  );

export const getTransactionEntryPanelSnapshot =
  (): TransactionEntryPanelState => useTransactionEntryPanelStore.getState();

export const openTransactionEntryPanel = (
  initialTab?: TransactionEntryType,
): void => {
  useTransactionEntryPanelStore.setState(
    (state) => ({
      initialTab,
      open: true,
      revision: state.revision + 1,
    }),
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
