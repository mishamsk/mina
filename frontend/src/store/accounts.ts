import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type {
  Account,
  AccountBalance,
  AccountRecordsPageParams,
  CreditLimitHistory,
  GroupRecordsPageParams,
  JournalRecord,
  Transaction,
} from "@/api";

import { createSelectors } from "./selectors";

export interface AccountsPageSnapshot {
  readonly accounts: readonly Account[];
  readonly balances: readonly AccountBalance[];
  readonly loadedAt: string;
}

export interface AccountHeaderSnapshot {
  readonly account: Account;
  readonly balances: readonly AccountBalance[];
  readonly creditLimitHistory: readonly CreditLimitHistory[];
  readonly loadedAt: string;
}

export interface AccountRegisterPageSnapshot {
  readonly loadedAt: string;
  readonly params: AccountRecordsPageParams & { readonly accountId: number };
  readonly records: readonly JournalRecord[];
  readonly totalCount: number | undefined;
}

export interface GroupRegisterPageSnapshot {
  readonly loadedAt: string;
  readonly params: GroupRecordsPageParams;
  readonly records: readonly JournalRecord[];
  readonly totalCount: number | undefined;
}

export interface AccountTransactionSnapshot {
  readonly loadedAt: string;
  readonly transaction: Transaction;
}

interface AccountsState {
  readonly accountHeaderErrors: Readonly<Record<number, string>>;
  readonly accountHeaderLoading: Readonly<Record<number, boolean>>;
  readonly accountHeaders: Readonly<Record<number, AccountHeaderSnapshot>>;
  readonly registerLastLoadedPageKeyByAccountId: Readonly<
    Record<number, string>
  >;
  readonly registerLastLoadedPageKeyByGroupPrefix: Readonly<
    Record<string, string>
  >;
  readonly registerLoadingPageKey: string | undefined;
  readonly registerPageErrors: Readonly<Record<string, string>>;
  readonly registerPages: Readonly<
    Record<string, AccountRegisterPageSnapshot | GroupRegisterPageSnapshot>
  >;
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly snapshot: AccountsPageSnapshot | undefined;
  readonly transactionCacheGeneration: number;
  readonly transactionCache: Readonly<
    Record<number, AccountTransactionSnapshot>
  >;
  readonly transactionCacheErrors: Readonly<Record<number, string>>;
  readonly transactionCacheLoading: Readonly<Record<number, number>>;
}

const initialAccountsState: AccountsState = {
  accountHeaderErrors: {},
  accountHeaderLoading: {},
  accountHeaders: {},
  registerLastLoadedPageKeyByAccountId: {},
  registerLastLoadedPageKeyByGroupPrefix: {},
  registerLoadingPageKey: undefined,
  registerPageErrors: {},
  registerPages: {},
  errorMessage: undefined,
  loading: false,
  snapshot: undefined,
  transactionCacheGeneration: 1,
  transactionCache: {},
  transactionCacheErrors: {},
  transactionCacheLoading: {},
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

export const accountRegisterPageKey = (
  params: AccountRecordsPageParams & { readonly accountId: number },
): string =>
  `${params.accountId}:${params.limit}:${params.offset}:${
    params.includeRunningBalance ? "running" : "plain"
  }`;

export const groupRegisterPageKey = (params: GroupRecordsPageParams): string =>
  `group:${encodeURIComponent(params.accountFqnPrefix)}:${params.limit}:${
    params.offset
  }`;

export const useAccountHeaderView = (accountId: number) =>
  useAccountsStore(
    useShallow((state) => ({
      errorMessage: state.accountHeaderErrors[accountId],
      loading: state.accountHeaderLoading[accountId] ?? false,
      snapshot: state.accountHeaders[accountId],
    })),
  );

export const useAccountRegisterPageView = (
  params: AccountRecordsPageParams & { readonly accountId: number },
) => {
  const key = accountRegisterPageKey(params);
  return useAccountsStore(
    useShallow((state) => {
      const snapshot = state.registerPages[key];
      const fallbackKey =
        state.registerLastLoadedPageKeyByAccountId[params.accountId];
      const fallbackSnapshot = fallbackKey
        ? state.registerPages[fallbackKey]
        : undefined;

      return {
        displayedSnapshot: snapshot ?? fallbackSnapshot,
        errorMessage: state.registerPageErrors[key],
        loading: state.registerLoadingPageKey === key,
        snapshot,
      };
    }),
  );
};

export const useGroupRegisterPageView = (params: GroupRecordsPageParams) => {
  const key = groupRegisterPageKey(params);
  return useAccountsStore(
    useShallow((state) => {
      const snapshot = state.registerPages[key] as
        GroupRegisterPageSnapshot | undefined;
      const fallbackKey =
        state.registerLastLoadedPageKeyByGroupPrefix[params.accountFqnPrefix];
      const fallbackSnapshot = fallbackKey
        ? (state.registerPages[fallbackKey] as
            GroupRegisterPageSnapshot | undefined)
        : undefined;

      return {
        displayedSnapshot: snapshot ?? fallbackSnapshot,
        errorMessage: state.registerPageErrors[key],
        loading: state.registerLoadingPageKey === key,
        snapshot,
      };
    }),
  );
};

export const useAccountTransactionCacheView = () =>
  useAccountsStore(
    useShallow((state) => ({
      transactionCache: state.transactionCache,
      transactionCacheErrors: state.transactionCacheErrors,
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

export const setAccountHeaderLoading = (accountId: number): void => {
  useAccountsStore.setState(
    (state) => {
      const accountHeaderErrors = { ...state.accountHeaderErrors };
      delete accountHeaderErrors[accountId];
      return {
        accountHeaderErrors,
        accountHeaderLoading: {
          ...state.accountHeaderLoading,
          [accountId]: true,
        },
      };
    },
    false,
    "AccountsStore/setAccountHeaderLoading",
  );
};

export const clearAccountHeaderLoading = (accountId: number): void => {
  useAccountsStore.setState(
    (state) => ({
      accountHeaderLoading: {
        ...state.accountHeaderLoading,
        [accountId]: false,
      },
    }),
    false,
    "AccountsStore/clearAccountHeaderLoading",
  );
};

export const setAccountHeader = (
  accountId: number,
  snapshot: Omit<AccountHeaderSnapshot, "loadedAt">,
): void => {
  useAccountsStore.setState(
    (state) => {
      const accountHeaderErrors = { ...state.accountHeaderErrors };
      delete accountHeaderErrors[accountId];
      return {
        accountHeaderErrors,
        accountHeaderLoading: {
          ...state.accountHeaderLoading,
          [accountId]: false,
        },
        accountHeaders: {
          ...state.accountHeaders,
          [accountId]: {
            ...snapshot,
            loadedAt: new Date().toISOString(),
          },
        },
      };
    },
    false,
    "AccountsStore/setAccountHeader",
  );
};

export const setAccountHeaderError = (
  accountId: number,
  errorMessage: string,
): void => {
  useAccountsStore.setState(
    (state) => ({
      accountHeaderErrors: {
        ...state.accountHeaderErrors,
        [accountId]: errorMessage,
      },
      accountHeaderLoading: {
        ...state.accountHeaderLoading,
        [accountId]: false,
      },
    }),
    false,
    "AccountsStore/setAccountHeaderError",
  );
};

export const invalidateAccountHeaders = (): void => {
  useAccountsStore.setState(
    {
      accountHeaderErrors: {},
      accountHeaders: {},
    },
    false,
    "AccountsStore/invalidateAccountHeaders",
  );
};

export const invalidateAccountHeader = (accountId: number): void => {
  useAccountsStore.setState(
    (state) => {
      const accountHeaderErrors = { ...state.accountHeaderErrors };
      const accountHeaders = { ...state.accountHeaders };
      delete accountHeaderErrors[accountId];
      delete accountHeaders[accountId];
      return {
        accountHeaderErrors,
        accountHeaders,
      };
    },
    false,
    "AccountsStore/invalidateAccountHeader",
  );
};

export const mergeAccountsPageAccount = (account: Account): void => {
  useAccountsStore.setState(
    (state) => {
      if (!state.snapshot) {
        return state;
      }

      const accountsById = new Map(
        state.snapshot.accounts.map((snapshotAccount) => [
          snapshotAccount.account_id,
          snapshotAccount,
        ]),
      );
      accountsById.set(account.account_id, account);

      return {
        errorMessage: undefined,
        snapshot: {
          ...state.snapshot,
          accounts: [...accountsById.values()].sort((left, right) =>
            left.fqn.localeCompare(right.fqn),
          ),
          loadedAt: new Date().toISOString(),
        },
      };
    },
    false,
    "AccountsStore/mergeAccountsPageAccount",
  );
};

export const removeAccountsPageAccount = (accountId: number): void => {
  useAccountsStore.setState(
    (state) => {
      if (!state.snapshot) {
        return state;
      }

      return {
        errorMessage: undefined,
        snapshot: {
          ...state.snapshot,
          accounts: state.snapshot.accounts.filter(
            (account) => account.account_id !== accountId,
          ),
          loadedAt: new Date().toISOString(),
        },
      };
    },
    false,
    "AccountsStore/removeAccountsPageAccount",
  );
};

export const setAccountRegisterPageLoading = (
  params: AccountRecordsPageParams & { readonly accountId: number },
): void => {
  const key = accountRegisterPageKey(params);
  useAccountsStore.setState(
    (state) => {
      const registerPageErrors = { ...state.registerPageErrors };
      delete registerPageErrors[key];
      return {
        registerLoadingPageKey: key,
        registerPageErrors,
      };
    },
    false,
    "AccountsStore/setAccountRegisterPageLoading",
  );
};

export const setGroupRegisterPageLoading = (
  params: GroupRecordsPageParams,
): void => {
  const key = groupRegisterPageKey(params);
  useAccountsStore.setState(
    (state) => {
      const registerPageErrors = { ...state.registerPageErrors };
      delete registerPageErrors[key];
      return {
        registerLoadingPageKey: key,
        registerPageErrors,
      };
    },
    false,
    "AccountsStore/setGroupRegisterPageLoading",
  );
};

export const clearAccountRegisterPageLoading = (
  params: AccountRecordsPageParams & { readonly accountId: number },
): void => {
  const key = accountRegisterPageKey(params);
  useAccountsStore.setState(
    (state) => ({
      registerLoadingPageKey:
        state.registerLoadingPageKey === key
          ? undefined
          : state.registerLoadingPageKey,
    }),
    false,
    "AccountsStore/clearAccountRegisterPageLoading",
  );
};

export const clearGroupRegisterPageLoading = (
  params: GroupRecordsPageParams,
): void => {
  const key = groupRegisterPageKey(params);
  useAccountsStore.setState(
    (state) => ({
      registerLoadingPageKey:
        state.registerLoadingPageKey === key
          ? undefined
          : state.registerLoadingPageKey,
    }),
    false,
    "AccountsStore/clearGroupRegisterPageLoading",
  );
};

export const setAccountRegisterPage = (
  params: AccountRecordsPageParams & { readonly accountId: number },
  totalCount: number | undefined,
  records: readonly JournalRecord[],
): void => {
  const key = accountRegisterPageKey(params);
  useAccountsStore.setState(
    (state) => {
      const registerPageErrors = { ...state.registerPageErrors };
      delete registerPageErrors[key];
      return {
        registerLastLoadedPageKeyByAccountId: {
          ...state.registerLastLoadedPageKeyByAccountId,
          [params.accountId]: key,
        },
        registerLoadingPageKey:
          state.registerLoadingPageKey === key
            ? undefined
            : state.registerLoadingPageKey,
        registerPageErrors,
        registerPages: {
          ...state.registerPages,
          [key]: {
            loadedAt: new Date().toISOString(),
            params,
            records,
            totalCount,
          },
        },
      };
    },
    false,
    "AccountsStore/setAccountRegisterPage",
  );
};

export const setGroupRegisterPage = (
  params: GroupRecordsPageParams,
  totalCount: number | undefined,
  records: readonly JournalRecord[],
): void => {
  const key = groupRegisterPageKey(params);
  useAccountsStore.setState(
    (state) => {
      const registerPageErrors = { ...state.registerPageErrors };
      delete registerPageErrors[key];
      return {
        registerLastLoadedPageKeyByGroupPrefix: {
          ...state.registerLastLoadedPageKeyByGroupPrefix,
          [params.accountFqnPrefix]: key,
        },
        registerLoadingPageKey:
          state.registerLoadingPageKey === key
            ? undefined
            : state.registerLoadingPageKey,
        registerPageErrors,
        registerPages: {
          ...state.registerPages,
          [key]: {
            loadedAt: new Date().toISOString(),
            params,
            records,
            totalCount,
          },
        },
      };
    },
    false,
    "AccountsStore/setGroupRegisterPage",
  );
};

export const setAccountRegisterPageError = (
  params: AccountRecordsPageParams & { readonly accountId: number },
  errorMessage: string,
): void => {
  const key = accountRegisterPageKey(params);
  useAccountsStore.setState(
    (state) => ({
      registerLoadingPageKey:
        state.registerLoadingPageKey === key
          ? undefined
          : state.registerLoadingPageKey,
      registerPageErrors: {
        ...state.registerPageErrors,
        [key]: errorMessage,
      },
    }),
    false,
    "AccountsStore/setAccountRegisterPageError",
  );
};

export const setGroupRegisterPageError = (
  params: GroupRecordsPageParams,
  errorMessage: string,
): void => {
  const key = groupRegisterPageKey(params);
  useAccountsStore.setState(
    (state) => ({
      registerLoadingPageKey:
        state.registerLoadingPageKey === key
          ? undefined
          : state.registerLoadingPageKey,
      registerPageErrors: {
        ...state.registerPageErrors,
        [key]: errorMessage,
      },
    }),
    false,
    "AccountsStore/setGroupRegisterPageError",
  );
};

export const invalidateAccountRegisterPages = (accountId: number): void => {
  useAccountsStore.setState(
    (state) => {
      const registerPages = Object.fromEntries(
        Object.entries(state.registerPages).filter(
          ([key]) => !key.startsWith(`${accountId}:`),
        ),
      );
      const registerPageErrors = Object.fromEntries(
        Object.entries(state.registerPageErrors).filter(
          ([key]) => !key.startsWith(`${accountId}:`),
        ),
      );
      const registerLastLoadedPageKeyByAccountId = {
        ...state.registerLastLoadedPageKeyByAccountId,
      };
      delete registerLastLoadedPageKeyByAccountId[accountId];

      return {
        registerLastLoadedPageKeyByAccountId,
        registerLoadingPageKey: state.registerLoadingPageKey?.startsWith(
          `${accountId}:`,
        )
          ? undefined
          : state.registerLoadingPageKey,
        registerPageErrors,
        registerPages,
      };
    },
    false,
    "AccountsStore/invalidateAccountRegisterPages",
  );
};

export const invalidateGroupRegisterPages = (): void => {
  useAccountsStore.setState(
    (state) => {
      const registerPages = Object.fromEntries(
        Object.entries(state.registerPages).filter(
          ([key]) => !key.startsWith("group:"),
        ),
      );
      const registerPageErrors = Object.fromEntries(
        Object.entries(state.registerPageErrors).filter(
          ([key]) => !key.startsWith("group:"),
        ),
      );

      return {
        registerLastLoadedPageKeyByGroupPrefix: {},
        registerLoadingPageKey: state.registerLoadingPageKey?.startsWith(
          "group:",
        )
          ? undefined
          : state.registerLoadingPageKey,
        registerPageErrors,
        registerPages,
      };
    },
    false,
    "AccountsStore/invalidateGroupRegisterPages",
  );
};

export const invalidateAllAccountRegisterPages = (): void => {
  useAccountsStore.setState(
    {
      registerLastLoadedPageKeyByAccountId: {},
      registerLastLoadedPageKeyByGroupPrefix: {},
      registerLoadingPageKey: undefined,
      registerPageErrors: {},
      registerPages: {},
    },
    false,
    "AccountsStore/invalidateAllAccountRegisterPages",
  );
};

export const invalidateAllAccountTransactionCache = (): void => {
  useAccountsStore.setState(
    (state) => ({
      transactionCacheGeneration: state.transactionCacheGeneration + 1,
      transactionCache: {},
      transactionCacheErrors: {},
      transactionCacheLoading: {},
    }),
    false,
    "AccountsStore/invalidateAllAccountTransactionCache",
  );
};

export const invalidateAccountTransactionCache = (
  transactionId: number,
): void => {
  useAccountsStore.setState(
    (state) => {
      const transactionCache = { ...state.transactionCache };
      const transactionCacheErrors = { ...state.transactionCacheErrors };
      const transactionCacheLoading = { ...state.transactionCacheLoading };
      delete transactionCache[transactionId];
      delete transactionCacheErrors[transactionId];
      delete transactionCacheLoading[transactionId];
      return {
        transactionCache,
        transactionCacheErrors,
        transactionCacheLoading,
      };
    },
    false,
    "AccountsStore/invalidateAccountTransactionCache",
  );
};

export const setAccountTransactionCacheLoading = (
  transactionId: number,
): number => {
  const generation = useAccountsStore.getState().transactionCacheGeneration;
  useAccountsStore.setState(
    (state) => {
      const transactionCacheErrors = { ...state.transactionCacheErrors };
      delete transactionCacheErrors[transactionId];
      return {
        transactionCacheErrors,
        transactionCacheLoading: {
          ...state.transactionCacheLoading,
          [transactionId]: generation,
        },
      };
    },
    false,
    "AccountsStore/setAccountTransactionCacheLoading",
  );
  return generation;
};

export const setAccountTransactionCache = (
  transaction: Transaction,
  generation: number,
): void => {
  useAccountsStore.setState(
    (state) => {
      if (state.transactionCacheGeneration !== generation) {
        return state;
      }
      const transactionCacheErrors = { ...state.transactionCacheErrors };
      const transactionCacheLoading = { ...state.transactionCacheLoading };
      delete transactionCacheErrors[transaction.transaction_id];
      delete transactionCacheLoading[transaction.transaction_id];
      return {
        transactionCache: {
          ...state.transactionCache,
          [transaction.transaction_id]: {
            loadedAt: new Date().toISOString(),
            transaction,
          },
        },
        transactionCacheErrors,
        transactionCacheLoading,
      };
    },
    false,
    "AccountsStore/setAccountTransactionCache",
  );
};

export const setAccountTransactionCacheError = (
  transactionId: number,
  errorMessage: string,
  generation: number,
): void => {
  useAccountsStore.setState(
    (state) => {
      if (state.transactionCacheGeneration !== generation) {
        return state;
      }
      const transactionCacheLoading = { ...state.transactionCacheLoading };
      delete transactionCacheLoading[transactionId];
      return {
        transactionCacheErrors: {
          ...state.transactionCacheErrors,
          [transactionId]: errorMessage,
        },
        transactionCacheLoading,
      };
    },
    false,
    "AccountsStore/setAccountTransactionCacheError",
  );
};
