import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type { Account, Category, Member, Tag, Transaction } from "@/api";

import { createSelectors } from "./selectors";

export interface TransactionsPageParams {
  readonly limit: number;
  readonly offset: number;
}

export interface TransactionPageSnapshot {
  readonly loadedAt: string;
  readonly params: TransactionsPageParams;
  readonly totalCount: number | undefined;
  readonly transactions: readonly Transaction[];
}

export interface LedgerLookupsSnapshot {
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly loadedAt: string;
  readonly members: readonly Member[];
  readonly tags: readonly Tag[];
}

interface TransactionsState {
  readonly errorMessage: string | undefined;
  readonly lastLoadedPageKey: string | undefined;
  readonly loadingPageKey: string | undefined;
  readonly lookupErrorMessage: string | undefined;
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly lookupsLoading: boolean;
  readonly pages: Readonly<Record<string, TransactionPageSnapshot>>;
}

const initialTransactionsState: TransactionsState = {
  errorMessage: undefined,
  lastLoadedPageKey: undefined,
  loadingPageKey: undefined,
  lookupErrorMessage: undefined,
  lookups: undefined,
  lookupsLoading: false,
  pages: {},
};

const transactionsStore = create<TransactionsState>()(
  devtools(() => initialTransactionsState, { name: "TransactionsStore" }),
);

export const useTransactionsStore = createSelectors(transactionsStore);

// When sorting becomes user-facing, add sort and sort_dir to the URL state and snapshot key.
export const transactionPageKey = (params: TransactionsPageParams): string =>
  `${params.limit}:${params.offset}`;

export const useTransactionPageView = (params: TransactionsPageParams) => {
  const key = transactionPageKey(params);
  return useTransactionsStore(
    useShallow((state) => {
      const snapshot = state.pages[key];
      const fallbackSnapshot = state.lastLoadedPageKey
        ? state.pages[state.lastLoadedPageKey]
        : undefined;

      return {
        displayedSnapshot: snapshot ?? fallbackSnapshot,
        errorMessage: state.errorMessage,
        loading: state.loadingPageKey === key,
        snapshot,
      };
    }),
  );
};

export const useLedgerLookupsView = () =>
  useTransactionsStore(
    useShallow((state) => ({
      errorMessage: state.lookupErrorMessage,
      loading: state.lookupsLoading,
      snapshot: state.lookups,
    })),
  );

export const getTransactionsSnapshot = (): TransactionsState =>
  useTransactionsStore.getState();

export const setTransactionPageLoading = (
  params: TransactionsPageParams,
): void => {
  useTransactionsStore.setState(
    {
      errorMessage: undefined,
      loadingPageKey: transactionPageKey(params),
    },
    false,
    "TransactionsStore/setTransactionPageLoading",
  );
};

export const setTransactionPage = (
  params: TransactionsPageParams,
  totalCount: number | undefined,
  transactions: readonly Transaction[],
): void => {
  const key = transactionPageKey(params);
  useTransactionsStore.setState(
    (state) => ({
      errorMessage: undefined,
      lastLoadedPageKey: key,
      loadingPageKey:
        state.loadingPageKey === key ? undefined : state.loadingPageKey,
      pages: {
        ...state.pages,
        [key]: {
          loadedAt: new Date().toISOString(),
          params,
          totalCount,
          transactions,
        },
      },
    }),
    false,
    "TransactionsStore/setTransactionPage",
  );
};

export const setTransactionPageError = (
  params: TransactionsPageParams,
  errorMessage: string,
): void => {
  const key = transactionPageKey(params);
  useTransactionsStore.setState(
    (state) => ({
      errorMessage,
      loadingPageKey:
        state.loadingPageKey === key ? undefined : state.loadingPageKey,
    }),
    false,
    "TransactionsStore/setTransactionPageError",
  );
};

export const setLedgerLookupsLoading = (): void => {
  useTransactionsStore.setState(
    {
      lookupErrorMessage: undefined,
      lookupsLoading: true,
    },
    false,
    "TransactionsStore/setLedgerLookupsLoading",
  );
};

export const setLedgerLookups = (
  lookups: Omit<LedgerLookupsSnapshot, "loadedAt">,
): void => {
  useTransactionsStore.setState(
    {
      lookupErrorMessage: undefined,
      lookups: {
        ...lookups,
        loadedAt: new Date().toISOString(),
      },
      lookupsLoading: false,
    },
    false,
    "TransactionsStore/setLedgerLookups",
  );
};

export const setLedgerLookupsError = (errorMessage: string): void => {
  useTransactionsStore.setState(
    {
      lookupErrorMessage: errorMessage,
      lookupsLoading: false,
    },
    false,
    "TransactionsStore/setLedgerLookupsError",
  );
};

export const invalidateTransactionPages = (): void => {
  useTransactionsStore.setState(
    {
      errorMessage: undefined,
      lastLoadedPageKey: undefined,
      loadingPageKey: undefined,
      pages: {},
    },
    false,
    "TransactionsStore/invalidateTransactionPages",
  );
};
