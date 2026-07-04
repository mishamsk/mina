import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type {
  Account,
  Category,
  CategoryEconomicIntent,
  Member,
  Tag,
  Transaction,
} from "@/api";

import { createSelectors } from "./selectors";

export interface TransactionsPageParams {
  readonly anchorDate?: string;
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

export interface CategoryPickerCategoriesSnapshot {
  readonly categories: readonly Category[];
  readonly loadedAt: string;
}

interface TransactionsState {
  readonly categoryPickerCategories: Readonly<
    Record<string, CategoryPickerCategoriesSnapshot>
  >;
  readonly categoryPickerCategoryErrors: Readonly<Record<string, string>>;
  readonly categoryPickerCategoryLoading: Readonly<Record<string, boolean>>;
  readonly errorMessage: string | undefined;
  readonly lastLoadedPageKey: string | undefined;
  readonly loadingPageKey: string | undefined;
  readonly lookupErrorMessage: string | undefined;
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly lookupsLoading: boolean;
  readonly pages: Readonly<Record<string, TransactionPageSnapshot>>;
}

const initialTransactionsState: TransactionsState = {
  categoryPickerCategories: {},
  categoryPickerCategoryErrors: {},
  categoryPickerCategoryLoading: {},
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
        loading: state.loadingPageKey === requestKey,
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

export const useCategoryPickerCategoriesView = (
  intents: readonly CategoryEconomicIntent[],
) => {
  const intentKey = categoryPickerIntentKey(intents);
  return useTransactionsStore(
    useShallow((state) => ({
      errorMessage: state.categoryPickerCategoryErrors[intentKey],
      loading: state.categoryPickerCategoryLoading[intentKey] ?? false,
      snapshot: state.categoryPickerCategories[intentKey],
    })),
  );
};

export const getTransactionsSnapshot = (): TransactionsState =>
  useTransactionsStore.getState();

export const setTransactionPageLoading = (
  params: TransactionsPageParams,
): void => {
  useTransactionsStore.setState(
    {
      errorMessage: undefined,
      loadingPageKey: transactionPageRequestKey(params),
    },
    false,
    "TransactionsStore/setTransactionPageLoading",
  );
};

export const clearTransactionPageLoading = (
  params: TransactionsPageParams,
): void => {
  const key = transactionPageRequestKey(params);
  useTransactionsStore.setState(
    (state) => ({
      loadingPageKey:
        state.loadingPageKey === key ? undefined : state.loadingPageKey,
    }),
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
  const key = transactionPageKey(params);
  const loadingKey = transactionPageRequestKey(loadingParams);
  useTransactionsStore.setState(
    (state) => ({
      errorMessage: undefined,
      lastLoadedPageKey: key,
      loadingPageKey:
        state.loadingPageKey === loadingKey ? undefined : state.loadingPageKey,
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
  const key = transactionPageRequestKey(params);
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
): void => {
  const normalizedIntents = normalizedCategoryPickerIntents(intents);
  const intentKey = categoryPickerIntentKey(normalizedIntents);
  useTransactionsStore.setState(
    (state) => {
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
): void => {
  const intentKey = categoryPickerIntentKey(intents);
  useTransactionsStore.setState(
    (state) => ({
      categoryPickerCategoryErrors: {
        ...state.categoryPickerCategoryErrors,
        [intentKey]: errorMessage,
      },
      categoryPickerCategoryLoading: {
        ...state.categoryPickerCategoryLoading,
        [intentKey]: false,
      },
    }),
    false,
    "TransactionsStore/setCategoryPickerCategoriesError",
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
