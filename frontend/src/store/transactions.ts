import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type {
  Account,
  AccountBalance,
  Category,
  CategoryEconomicIntent,
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
  readonly pageErrorMessages: Readonly<Record<string, string>>;
  readonly pageGeneration: number;
  readonly pages: Readonly<Record<string, TransactionPageSnapshot>>;
  readonly refreshFailedPageKeys: Readonly<Record<string, boolean>>;
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
  pageErrorMessages: {},
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
  return `${params.limit}:${params.offset}:${params.sort}:${params.sortDirection}:${filterSignature}`;
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
        errorMessage:
          state.pageErrorMessages[key] ??
          (snapshot ? undefined : state.errorMessage),
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
      const pageErrorMessages = { ...state.pageErrorMessages };
      const refreshFailedPageKeys = { ...state.refreshFailedPageKeys };
      const stalePageKeys = { ...state.stalePageKeys };
      delete pageErrorMessages[key];
      delete refreshFailedPageKeys[key];
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
        pageErrorMessages,
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

      const pageErrorMessage = state.pageErrorMessages[key];
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
        pageErrorMessages: pageErrorMessage ? { [key]: pageErrorMessage } : {},
        refreshFailedPageKeys: {},
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
      const pageErrorMessages = { ...state.pageErrorMessages };
      const refreshFailedPageKeys = { ...state.refreshFailedPageKeys };
      const stalePageKeys = { ...state.stalePageKeys };
      delete pageErrorMessages[key];
      delete refreshFailedPageKeys[key];
      delete stalePageKeys[key];
      const lastLoadedPageKey = state.lastLoadedPageKey ?? key;

      return {
        lastLoadedPageKey,
        pageErrorMessages,
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
          pageErrorMessages: {
            ...state.pageErrorMessages,
            [key]: repeatedFailureMessage,
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

export const addCategoryPickerCategory = (category: Category): void => {
  useTransactionsStore.setState(
    (state) => ({
      categoryPickerCategories: Object.fromEntries(
        Object.entries(state.categoryPickerCategories).map(
          ([intentKey, snapshot]) => [
            intentKey,
            intentKey.split(",").includes(category.economic_intent)
              ? {
                  categories: [
                    ...snapshot.categories.filter(
                      (current) => current.category_id !== category.category_id,
                    ),
                    category,
                  ].sort((left, right) => left.fqn.localeCompare(right.fqn)),
                  loadedAt: new Date().toISOString(),
                }
              : snapshot,
          ],
        ),
      ),
    }),
    false,
    "TransactionsStore/addCategoryPickerCategory",
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
      pageErrorMessages: {},
      pageGeneration: state.pageGeneration + 1,
      pages: {},
      refreshFailedPageKeys: {},
      stalePageKeys: {},
    }),
    false,
    "TransactionsStore/invalidateTransactionPages",
  );
};
