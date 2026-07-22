import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type {
  Account,
  AccountBalance,
  Category,
  CategoryEconomicIntent,
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

import { createSelectors } from "./selectors";

export interface TransactionsPageParams {
  readonly anchorDate?: string;
  readonly filters?: Partial<TransactionFilters>;
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
  readonly month: string;
  readonly monthTotals: TransactionMonthTotalsResponse;
  readonly recentTransactions: readonly Transaction[];
}

export interface CategoryPickerCategoriesSnapshot {
  readonly categories: readonly Category[];
  readonly loadedAt: string;
}

interface TransactionsState {
  readonly categoryPickerCategories: Readonly<
    Record<string, CategoryPickerCategoriesSnapshot>
  >;
  readonly categoryPickerCategoryErrors: Readonly<Record<string, string>>;
  readonly categoryPickerCategoryEpoch: number;
  readonly categoryPickerCategoryLoading: Readonly<Record<string, boolean>>;
  readonly errorMessage: string | undefined;
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
  readonly pageGeneration: number;
  readonly pages: Readonly<Record<string, TransactionPageSnapshot>>;
  readonly stalePageKeys: Readonly<Record<string, boolean>>;
}

const initialTransactionsState: TransactionsState = {
  categoryPickerCategories: {},
  categoryPickerCategoryErrors: {},
  categoryPickerCategoryEpoch: 0,
  categoryPickerCategoryLoading: {},
  errorMessage: undefined,
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
  pageGeneration: 0,
  pages: {},
  stalePageKeys: {},
};

const transactionsStore = create<TransactionsState>()(
  devtools(() => initialTransactionsState, { name: "TransactionsStore" }),
);

export const useTransactionsStore = createSelectors(transactionsStore);

// When sorting becomes user-facing, add sort and sort_dir to the URL state and snapshot key.
export const transactionPageKey = (params: TransactionsPageParams): string => {
  const filterSignature = transactionFilterSignature(params.filters);
  return `${params.limit}:${params.offset}:${filterSignature}`;
};

export const transactionPageRequestKey = (
  params: TransactionsPageParams,
): string =>
  params.anchorDate
    ? `${transactionPageKey(params)}:${params.anchorDate}`
    : transactionPageKey(params);

export const categoryPickerIntentKey = (
  intents: readonly CategoryEconomicIntent[],
): string => [...new Set(intents)].sort().join(",");

export const normalizedCategoryPickerIntents = (
  intents: readonly CategoryEconomicIntent[],
): readonly CategoryEconomicIntent[] => [...new Set(intents)].sort();

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
        errorMessage: state.errorMessage,
        generation: state.pageGeneration,
        loading: state.loadingPageKey === requestKey,
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

export const useCategoryPickerCategoriesView = (
  intents: readonly CategoryEconomicIntent[],
) => {
  const intentKey = categoryPickerIntentKey(intents);
  return useTransactionsStore(
    useShallow((state) => ({
      epoch: state.categoryPickerCategoryEpoch,
      errorMessage: state.categoryPickerCategoryErrors[intentKey],
      loading: state.categoryPickerCategoryLoading[intentKey] ?? false,
      snapshot: state.categoryPickerCategories[intentKey],
    })),
  );
};

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
      errorMessage: undefined,
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
  loadingParams: TransactionsPageParams = params,
): void => {
  const key = transactionPageKey({
    ...params,
    filters: normalizeTransactionFilters(params.filters),
  });
  const loadingKey = transactionPageRequestKey(loadingParams);
  useTransactionsStore.setState(
    (state) => {
      const stalePageKeys = { ...state.stalePageKeys };
      delete stalePageKeys[key];
      return {
        errorMessage: undefined,
        lastLoadedPageKey: key,
        loadingPageGeneration:
          state.loadingPageKey === loadingKey
            ? undefined
            : state.loadingPageGeneration,
        loadingPageKey:
          state.loadingPageKey === loadingKey
            ? undefined
            : state.loadingPageKey,
        pages: {
          ...state.pages,
          [key]: {
            loadedAt: new Date().toISOString(),
            params,
            totalCount,
            transactions,
          },
        },
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

      return {
        errorMessage: undefined,
        lastLoadedPageKey: key,
        pageGeneration: state.pageGeneration + 1,
        pages: {
          [key]: {
            ...page,
            transactions: page.transactions.map((current) =>
              current.transaction_id === transaction.transaction_id
                ? transaction
                : current,
            ),
          },
        },
        stalePageKeys: {},
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
): void => {
  const normalizedParams = {
    ...params,
    filters: normalizeTransactionFilters(params.filters),
  };
  const key = transactionPageKey(normalizedParams);
  useTransactionsStore.setState(
    (state) => {
      if (state.pages[key] !== pageAtRefreshStart) {
        return state;
      }

      const stalePageKeys = { ...state.stalePageKeys };
      delete stalePageKeys[key];
      const lastLoadedPageKey = state.lastLoadedPageKey ?? key;

      return {
        errorMessage: undefined,
        lastLoadedPageKey,
        pages: {
          ...state.pages,
          [key]: {
            loadedAt: new Date().toISOString(),
            params: normalizedParams,
            totalCount,
            transactions,
          },
        },
        stalePageKeys,
      };
    },
    false,
    "TransactionsStore/setRefreshedTransactionPage",
  );
};

export const markTransactionPageStale = (
  params: TransactionsPageParams,
  expectedPage: TransactionPageSnapshot | undefined,
): void => {
  const key = transactionPageKey(params);
  useTransactionsStore.setState(
    (state) => {
      if (state.pages[key] !== expectedPage) {
        return state;
      }
      return {
        stalePageKeys: {
          ...state.stalePageKeys,
          [key]: true,
        },
      };
    },
    false,
    "TransactionsStore/markTransactionPageStale",
  );
};

export const setTransactionPageError = (
  params: TransactionsPageParams,
  errorMessage: string,
): void => {
  const key = transactionPageRequestKey(params);
  useTransactionsStore.setState(
    (state) => ({
      errorMessage,
      loadingPageGeneration:
        state.loadingPageKey === key ? undefined : state.loadingPageGeneration,
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

export const setCategoryPickerCategoriesLoading = (
  intents: readonly CategoryEconomicIntent[],
): void => {
  const intentKey = categoryPickerIntentKey(intents);
  useTransactionsStore.setState(
    (state) => {
      const categoryPickerCategoryErrors = {
        ...state.categoryPickerCategoryErrors,
      };
      delete categoryPickerCategoryErrors[intentKey];
      return {
        categoryPickerCategoryErrors,
        categoryPickerCategoryLoading: {
          ...state.categoryPickerCategoryLoading,
          [intentKey]: true,
        },
      };
    },
    false,
    "TransactionsStore/setCategoryPickerCategoriesLoading",
  );
};

export const setCategoryPickerCategories = (
  intents: readonly CategoryEconomicIntent[],
  categories: readonly Category[],
  requestEpoch?: number,
): void => {
  const normalizedIntents = normalizedCategoryPickerIntents(intents);
  const intentKey = categoryPickerIntentKey(normalizedIntents);
  useTransactionsStore.setState(
    (state) => {
      if (
        requestEpoch !== undefined &&
        requestEpoch !== state.categoryPickerCategoryEpoch
      ) {
        return state;
      }
      const categoryPickerCategoryErrors = {
        ...state.categoryPickerCategoryErrors,
      };
      delete categoryPickerCategoryErrors[intentKey];
      return {
        categoryPickerCategories: {
          ...state.categoryPickerCategories,
          [intentKey]: {
            categories,
            loadedAt: new Date().toISOString(),
          },
        },
        categoryPickerCategoryErrors,
        categoryPickerCategoryLoading: {
          ...state.categoryPickerCategoryLoading,
          [intentKey]: false,
        },
      };
    },
    false,
    "TransactionsStore/setCategoryPickerCategories",
  );
};

export const setCategoryPickerCategoriesError = (
  intents: readonly CategoryEconomicIntent[],
  errorMessage: string,
  requestEpoch?: number,
): void => {
  const intentKey = categoryPickerIntentKey(intents);
  useTransactionsStore.setState(
    (state) => {
      if (
        requestEpoch !== undefined &&
        requestEpoch !== state.categoryPickerCategoryEpoch
      ) {
        return state;
      }
      return {
        categoryPickerCategoryErrors: {
          ...state.categoryPickerCategoryErrors,
          [intentKey]: errorMessage,
        },
        categoryPickerCategoryLoading: {
          ...state.categoryPickerCategoryLoading,
          [intentKey]: false,
        },
      };
    },
    false,
    "TransactionsStore/setCategoryPickerCategoriesError",
  );
};

export const invalidateCategoryPickerCategories = (): void => {
  useTransactionsStore.setState(
    (state) => ({
      categoryPickerCategories: {},
      categoryPickerCategoryErrors: {},
      categoryPickerCategoryEpoch: state.categoryPickerCategoryEpoch + 1,
      categoryPickerCategoryLoading: {},
    }),
    false,
    "TransactionsStore/invalidateCategoryPickerCategories",
  );
};

export const invalidateTransactionPages = (): void => {
  useTransactionsStore.setState(
    (state) => ({
      errorMessage: undefined,
      lastLoadedPageKey: undefined,
      loadingPageGeneration: undefined,
      loadingPageKey: undefined,
      pageGeneration: state.pageGeneration + 1,
      pages: {},
      stalePageKeys: {},
    }),
    false,
    "TransactionsStore/invalidateTransactionPages",
  );
};
