import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

interface TransactionBulkEditState {
  readonly available: boolean;
  readonly enabled: boolean;
}

const initialTransactionBulkEditState: TransactionBulkEditState = {
  available: false,
  enabled: false,
};

const transactionBulkEditStore = create<TransactionBulkEditState>()(
  devtools(() => initialTransactionBulkEditState, {
    name: "TransactionBulkEditStore",
  }),
);

export const useTransactionBulkEditStore = transactionBulkEditStore;

export const useTransactionBulkEditView = (): TransactionBulkEditState =>
  useTransactionBulkEditStore(
    useShallow((state) => ({
      available: state.available,
      enabled: state.enabled,
    })),
  );

export const getTransactionBulkEditSnapshot = (): TransactionBulkEditState =>
  useTransactionBulkEditStore.getState();

export const setTransactionBulkEditAvailable = (available: boolean): void => {
  useTransactionBulkEditStore.setState(
    available ? { available } : initialTransactionBulkEditState,
    false,
    "TransactionBulkEditStore/setTransactionBulkEditAvailable",
  );
};

export const setTransactionBulkEditEnabled = (enabled: boolean): void => {
  useTransactionBulkEditStore.setState(
    (state) => ({
      enabled: state.available && enabled,
    }),
    false,
    "TransactionBulkEditStore/setTransactionBulkEditEnabled",
  );
};

export const toggleTransactionBulkEdit = (): void => {
  useTransactionBulkEditStore.setState(
    (state) => ({
      enabled: state.available && !state.enabled,
    }),
    false,
    "TransactionBulkEditStore/toggleTransactionBulkEdit",
  );
};
