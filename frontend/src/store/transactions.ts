import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type {
  Account,
  AccountBalance,
  Category,
  HouseholdFlowDataset,
  Member,
  Tag,
  Transaction,
  TransactionMonthTotalsResponse,
} from "@/api";
import {
  normalizeTransactionFilters,
  type TransactionFilters,
  transactionFilterSignature,
} from "@/models/transaction-filters";
import type {
  TransactionSort,
  TransactionSortDirection,
} from "@/models/transaction-sorting";

import { createSelectors } from "./selectors";

export interface TransactionsPageParams {
  readonly anchorDate?: string;
  readonly filters?: Partial<TransactionFilters>;
  readonly includeExpectedByDefault?: boolean;
  readonly limit: number;
  readonly offset: number;
  readonly sort: TransactionSort;
  readonly sortDirection: TransactionSortDirection;
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

export interface FeaturedBalanceRow {
  readonly account: Account;
  readonly balance: AccountBalance;
}

export interface FeaturedBalancesSnapshot {
  readonly loadedAt: string;
  readonly rows: readonly FeaturedBalanceRow[];
}

export interface OverviewBalanceRow {
  readonly account: Account;
  readonly balance: AccountBalance;
}

export interface OverviewSnapshot {
  readonly accounts: readonly Account[];
  readonly balanceRows: readonly OverviewBalanceRow[];
  readonly loadedAt: string;
  readonly flowReport: HouseholdFlowDataset | undefined;
  readonly flowReportErrorMessage: string | undefined;
  readonly month: string;
  readonly monthTotals: TransactionMonthTotalsResponse;
  readonly recentTransactions: readonly Transaction[];
}

interface TransactionPageError {
  readonly message: string;
}

interface TransactionsState {
  readonly featuredBalances: FeaturedBalancesSnapshot | undefined;
  readonly featuredBalancesErrorMessage: string | undefined;
  readonly featuredBalancesLoading: boolean;
  readonly lastTransactionsPageSearch: string;
  readonly lastLoadedPageKey: string | undefined;
  readonly loadingPageGeneration: number | undefined;
  readonly loadingPageKey: string | undefined;
  readonly lookupErrorMessage: string | undefined;
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly lookupsLoading: boolean;
  readonly overview: OverviewSnapshot | undefined;
  readonly overviewErrorMessage: string | undefined;
  readonly overviewLoading: boolean;
  readonly pageErrors: Readonly<Record<string, TransactionPageError>>;
  readonly pageGeneration: number;
  readonly pages: Readonly<Record<string, TransactionPageSnapshot>>;
  readonly refreshFailedPageKeys: Readonly<Record<string, boolean>>;
  readonly stalePageKeys: Readonly<Record<string, boolean>>;
}

const initialTransactionsState: TransactionsState = {
  featuredBalances: undefined,
  featuredBalancesErrorMessage: undefined,
  featuredBalancesLoading: false,
  lastTransactionsPageSearch: "",
  lastLoadedPageKey: undefined,
  loadingPageGeneration: undefined,
  loadingPageKey: undefined,
  lookupErrorMessage: undefined,
  lookups: undefined,
  lookupsLoading: false,
  overview: undefined,
  overviewErrorMessage: undefined,
  overviewLoading: false,
  pageErrors: {},
  pageGeneration: 0,
  pages: {},
  refreshFailedPageKeys: {},
  stalePageKeys: {},
};

const transactionsStore = create<TransactionsState>()(
  devtools(() => initialTransactionsState, { name: "TransactionsStore" }),
);

export const useTransactionsStore = createSelectors(transactionsStore);

export const transactionPageKey = (params: TransactionsPageParams): string => {
  const filterSignature = transactionFilterSignature(params.filters);
  return JSON.stringify([
    params.limit,
    params.offset,
    params.sort,
    params.sortDirection,
    params.anchorDate ?? "",
    params.includeExpectedByDefault ?? false,
    filterSignature,
  ]);
};

export const transactionPageRequestKey = (
  params: TransactionsPageParams,
): string => transactionPageKey(params);

export const useTransactionPageView = (params: TransactionsPageParams) => {
  const key = transactionPageKey(params);
  return useTransactionsStore(
    useShallow((state) => {
      const snapshot = state.pages[key];
      const fallbackSnapshot = state.lastLoadedPageKey
        ? state.pages[state.lastLoadedPageKey]
        : undefined;
      const requestKey = transactionPageRequestKey(params);

      return {
        displayedSnapshot: snapshot ?? fallbackSnapshot,
        errorMessage: state.pageErrors[key]?.message,
        generation: state.pageGeneration,
        loading: state.loadingPageKey === requestKey,
        refreshFailed: state.refreshFailedPageKeys[key] ?? false,
        snapshot,
        stale: state.stalePageKeys[key] ?? false,
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

export const useFeaturedBalancesView = () =>
  useTransactionsStore(
    useShallow((state) => ({
      errorMessage: state.featuredBalancesErrorMessage,
      loading: state.featuredBalancesLoading,
      snapshot: state.featuredBalances,
    })),
  );

export const useOverviewView = () =>
  useTransactionsStore(
    useShallow((state) => ({
      errorMessage: state.overviewErrorMessage,
      loading: state.overviewLoading,
      snapshot: state.overview,
    })),
  );

export const useLastTransactionsPageSearch = (): string =>
  useTransactionsStore((state) => state.lastTransactionsPageSearch);

export const getTransactionsSnapshot = (): TransactionsState =>
  useTransactionsStore.getState();

export const setLastTransactionsPageSearch = (search: string): void => {
  useTransactionsStore.setState(
    {
      lastTransactionsPageSearch: search,
    },
    false,
    "TransactionsStore/setLastTransactionsPageSearch",
  );
};

export const setTransactionPageLoading = (
  params: TransactionsPageParams,
): void => {
  useTransactionsStore.setState(
    (state) => ({
      loadingPageGeneration: state.pageGeneration,
      loadingPageKey: transactionPageRequestKey(params),
    }),
    false,
    "TransactionsStore/setTransactionPageLoading",
  );
};

export const clearTransactionPageLoading = (
  params: TransactionsPageParams,
  expectedGeneration?: number,
): void => {
  const key = transactionPageRequestKey(params);
  useTransactionsStore.setState(
    (state) => {
      const matches =
        state.loadingPageKey === key &&
        (expectedGeneration === undefined ||
          state.loadingPageGeneration === expectedGeneration);
      return {
        loadingPageGeneration: matches
          ? undefined
          : state.loadingPageGeneration,
        loadingPageKey: matches ? undefined : state.loadingPageKey,
      };
    },
    false,
    "TransactionsStore/clearTransactionPageLoading",
  );
};

export const setTransactionPage = (
  params: TransactionsPageParams,
  totalCount: number | undefined,
  transactions: readonly Transaction[],
  loadingParams: TransactionsPageParams,
  pageErrorsAtRequestStart: TransactionsState["pageErrors"],
): void => {
  const key = transactionPageKey({
    ...params,
    filters: normalizeTransactionFilters(params.filters),
  });
  const sourceKey = transactionPageKey(loadingParams);
  const loadingKey = transactionPageRequestKey(loadingParams);
  useTransactionsStore.setState(
    (state) => {
      const pageErrors = { ...state.pageErrors };
      const refreshFailedPageKeys = { ...state.refreshFailedPageKeys };
      const stalePageKeys = { ...state.stalePageKeys };
      if (pageErrors[key] === pageErrorsAtRequestStart[key]) {
        delete pageErrors[key];
      }
      if (pageErrors[sourceKey] === pageErrorsAtRequestStart[sourceKey]) {
        delete pageErrors[sourceKey];
      }
      delete refreshFailedPageKeys[key];
      delete stalePageKeys[key];
      return {
        lastLoadedPageKey: key,
        loadingPageGeneration:
          state.loadingPageKey === loadingKey
            ? undefined
            : state.loadingPageGeneration,
        loadingPageKey:
          state.loadingPageKey === loadingKey
            ? undefined
            : state.loadingPageKey,
        pageErrors,
        pages: {
          ...state.pages,
          [key]: {
            loadedAt: new Date().toISOString(),
            params,
            totalCount,
            transactions,
          },
        },
        refreshFailedPageKeys,
        stalePageKeys,
      };
    },
    false,
    "TransactionsStore/setTransactionPage",
  );
};

export const updateDisplayedTransactionPage = (
  params: TransactionsPageParams,
  transaction: Transaction,
): void => {
  const key = transactionPageKey(params);
  useTransactionsStore.setState(
    (state) => {
      const page = state.pages[key];
      if (!page) {
        return state;
      }

      const pageError = state.pageErrors[key];
      const pageStale = state.stalePageKeys[key];
      const transactionDisplayed = page.transactions.some(
        (current) => current.transaction_id === transaction.transaction_id,
      );
      return {
        lastLoadedPageKey: key,
        pageGeneration: state.pageGeneration + 1,
        pages: {
          [key]: {
            ...page,
            transactions: transactionDisplayed
              ? page.transactions.map((current) =>
                  current.transaction_id === transaction.transaction_id
                    ? transaction
                    : current,
                )
              : [...page.transactions, transaction],
          },
        },
        pageErrors: pageError ? { [key]: pageError } : {},
        refreshFailedPageKeys: {},
        stalePageKeys: pageStale ? { [key]: true } : {},
      };
    },
    false,
    "TransactionsStore/updateDisplayedTransactionPage",
  );
};

export const setRefreshedTransactionPage = (
  params: TransactionsPageParams,
  totalCount: number | undefined,
  transactions: readonly Transaction[],
  pageAtRefreshStart: TransactionPageSnapshot | undefined,
  pageErrorAtRefreshStart: TransactionPageError | undefined,
): boolean => {
  const normalizedParams = {
    ...params,
    filters: normalizeTransactionFilters(params.filters),
  };
  const key = transactionPageKey(normalizedParams);
  let refreshed = false;
  useTransactionsStore.setState(
    (state) => {
      if (state.pages[key] !== pageAtRefreshStart) {
        return state;
      }

      refreshed = true;
      const pageErrors = { ...state.pageErrors };
      const refreshFailedPageKeys = { ...state.refreshFailedPageKeys };
      const stalePageKeys = { ...state.stalePageKeys };
      if (pageErrors[key] === pageErrorAtRefreshStart) {
        delete pageErrors[key];
      }
      delete refreshFailedPageKeys[key];
      delete stalePageKeys[key];
      const lastLoadedPageKey = state.lastLoadedPageKey ?? key;

      return {
        lastLoadedPageKey,
        pageErrors,
        pages: {
          ...state.pages,
          [key]: {
            loadedAt: new Date().toISOString(),
            params: normalizedParams,
            totalCount,
            transactions,
          },
        },
        refreshFailedPageKeys,
        stalePageKeys,
      };
    },
    false,
    "TransactionsStore/setRefreshedTransactionPage",
  );
  return refreshed;
};

export const markTransactionPageStale = (
  params: TransactionsPageParams,
  expectedPage: TransactionPageSnapshot | undefined,
  repeatedFailureMessage?: string,
): boolean => {
  const key = transactionPageKey(params);
  let repeatedFailure = false;
  useTransactionsStore.setState(
    (state) => {
      if (state.pages[key] !== expectedPage) {
        return state;
      }
      if (state.refreshFailedPageKeys[key] && repeatedFailureMessage) {
        repeatedFailure = true;
        return {
          pageErrors: {
            ...state.pageErrors,
            [key]: { message: repeatedFailureMessage },
          },
        };
      }
      return {
        refreshFailedPageKeys: {
          ...state.refreshFailedPageKeys,
          [key]: true,
        },
        stalePageKeys: {
          ...state.stalePageKeys,
          [key]: true,
        },
      };
    },
    false,
    "TransactionsStore/markTransactionPageStale",
  );
  return repeatedFailure;
};

export const markOtherTransactionPagesStale = (
  currentParams: TransactionsPageParams,
): void => {
  const currentKey = transactionPageKey(currentParams);
  useTransactionsStore.setState(
    (state) => {
      const staleKeys = Object.keys(state.pages).filter(
        (key) => key !== currentKey,
      );
      return {
        refreshFailedPageKeys: Object.fromEntries(
          Object.entries(state.refreshFailedPageKeys).filter(
            ([key]) => !staleKeys.includes(key),
          ),
        ),
        stalePageKeys: Object.fromEntries(staleKeys.map((key) => [key, true])),
      };
    },
    false,
    "TransactionsStore/markOtherTransactionPagesStale",
  );
};

export const setTransactionPageError = (
  params: TransactionsPageParams,
  errorMessage: string,
): void => {
  const pageKey = transactionPageKey(params);
  const requestKey = transactionPageRequestKey(params);
  useTransactionsStore.setState(
    (state) => ({
      pageErrors: {
        ...state.pageErrors,
        [pageKey]: { message: errorMessage },
      },
      loadingPageGeneration:
        state.loadingPageKey === requestKey
          ? undefined
          : state.loadingPageGeneration,
      loadingPageKey:
        state.loadingPageKey === requestKey ? undefined : state.loadingPageKey,
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

export const clearLedgerLookupsLoading = (): void => {
  useTransactionsStore.setState(
    {
      lookupsLoading: false,
    },
    false,
    "TransactionsStore/clearLedgerLookupsLoading",
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

export const setFeaturedBalancesLoading = (): void => {
  useTransactionsStore.setState(
    {
      featuredBalancesErrorMessage: undefined,
      featuredBalancesLoading: true,
    },
    false,
    "TransactionsStore/setFeaturedBalancesLoading",
  );
};

export const setFeaturedBalances = (
  rows: readonly FeaturedBalanceRow[],
): void => {
  useTransactionsStore.setState(
    {
      featuredBalances: {
        loadedAt: new Date().toISOString(),
        rows,
      },
      featuredBalancesErrorMessage: undefined,
      featuredBalancesLoading: false,
    },
    false,
    "TransactionsStore/setFeaturedBalances",
  );
};

export const setFeaturedBalancesError = (errorMessage: string): void => {
  useTransactionsStore.setState(
    {
      featuredBalancesErrorMessage: errorMessage,
      featuredBalancesLoading: false,
    },
    false,
    "TransactionsStore/setFeaturedBalancesError",
  );
};

export const setOverviewLoading = (): void => {
  useTransactionsStore.setState(
    {
      overviewErrorMessage: undefined,
      overviewLoading: true,
    },
    false,
    "TransactionsStore/setOverviewLoading",
  );
};

export const setOverview = (
  overview: Omit<OverviewSnapshot, "loadedAt">,
): void => {
  useTransactionsStore.setState(
    {
      overview: {
        ...overview,
        loadedAt: new Date().toISOString(),
      },
      overviewErrorMessage: undefined,
      overviewLoading: false,
    },
    false,
    "TransactionsStore/setOverview",
  );
};

export const setOverviewFlowReport = (
  flowReport: HouseholdFlowDataset,
): void => {
  useTransactionsStore.setState(
    (state) => ({
      overview: state.overview
        ? {
            ...state.overview,
            flowReport,
            flowReportErrorMessage: undefined,
          }
        : undefined,
    }),
    false,
    "TransactionsStore/setOverviewFlowReport",
  );
};

export const setOverviewFlowReportError = (errorMessage: string): void => {
  useTransactionsStore.setState(
    (state) => ({
      overview: state.overview
        ? { ...state.overview, flowReportErrorMessage: errorMessage }
        : undefined,
    }),
    false,
    "TransactionsStore/setOverviewFlowReportError",
  );
};

export const setOverviewError = (errorMessage: string): void => {
  useTransactionsStore.setState(
    {
      overviewErrorMessage: errorMessage,
      overviewLoading: false,
    },
    false,
    "TransactionsStore/setOverviewError",
  );
};

export const invalidateTransactionPages = (): void => {
  useTransactionsStore.setState(
    (state) => ({
      lastLoadedPageKey: undefined,
      loadingPageGeneration: undefined,
      loadingPageKey: undefined,
      pageErrors: {},
      pageGeneration: state.pageGeneration + 1,
      pages: {},
      refreshFailedPageKeys: {},
      stalePageKeys: {},
    }),
    false,
    "TransactionsStore/invalidateTransactionPages",
  );
};

export const invalidateTransactionPagesPreservingSnapshots = (): void => {
  useTransactionsStore.setState(
    (state) => ({
      loadingPageGeneration: undefined,
      loadingPageKey: undefined,
      pageErrors: {},
      pageGeneration: state.pageGeneration + 1,
      pages: Object.fromEntries(
        Object.entries(state.pages).map(([key, page]) => [key, { ...page }]),
      ),
      refreshFailedPageKeys: {},
      stalePageKeys: Object.fromEntries(
        Object.keys(state.pages).map((key) => [key, true]),
      ),
    }),
    false,
    "TransactionsStore/invalidateTransactionPagesPreservingSnapshots",
  );
};
