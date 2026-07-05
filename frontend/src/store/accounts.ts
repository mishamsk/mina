import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type { Account, AccountBalance } from "@/api";

import { createSelectors } from "./selectors";

export interface AccountsPageSnapshot {
  readonly accounts: readonly Account[];
  readonly balances: readonly AccountBalance[];
  readonly loadedAt: string;
}

interface AccountsState {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly snapshot: AccountsPageSnapshot | undefined;
}

const initialAccountsState: AccountsState = {
  errorMessage: undefined,
  loading: false,
  snapshot: undefined,
};

const accountsStore = create<AccountsState>()(
  devtools(() => initialAccountsState, { name: "AccountsStore" }),
);

export const useAccountsStore = createSelectors(accountsStore);

export const useAccountsPageView = () =>
  useAccountsStore(
    useShallow((state) => ({
      errorMessage: state.errorMessage,
      loading: state.loading,
      snapshot: state.snapshot,
    })),
  );

export const getAccountsSnapshot = (): AccountsState =>
  useAccountsStore.getState();

export const setAccountsPageLoading = (): void => {
  useAccountsStore.setState(
    {
      errorMessage: undefined,
      loading: true,
    },
    false,
    "AccountsStore/setAccountsPageLoading",
  );
};

export const clearAccountsPageLoading = (): void => {
  useAccountsStore.setState(
    {
      loading: false,
    },
    false,
    "AccountsStore/clearAccountsPageLoading",
  );
};

export const setAccountsPage = (
  snapshot: Omit<AccountsPageSnapshot, "loadedAt">,
): void => {
  useAccountsStore.setState(
    {
      errorMessage: undefined,
      loading: false,
      snapshot: {
        ...snapshot,
        loadedAt: new Date().toISOString(),
      },
    },
    false,
    "AccountsStore/setAccountsPage",
  );
};

export const setAccountsPageError = (errorMessage: string): void => {
  useAccountsStore.setState(
    {
      errorMessage,
      loading: false,
    },
    false,
    "AccountsStore/setAccountsPageError",
  );
};
