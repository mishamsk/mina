import { useEffect, useMemo } from "react";

import {
  type CategoryEconomicIntent,
  fetchCategoryPickerCategories,
  fetchLedgerLookups,
  fetchTransactionPage,
  isNetworkFailure,
  type Transaction,
  type TransactionPageParams,
} from "@/api";
import { refreshFeaturedBalances } from "@/features/featured-balances";
import { refreshOverview } from "@/features/overview";
import {
  categoryPickerIntentKey,
  clearTransactionPageLoading,
  getTransactionsSnapshot,
  invalidateTransactionPages,
  normalizedCategoryPickerIntents,
  setCategoryPickerCategories,
  setCategoryPickerCategoriesError,
  setCategoryPickerCategoriesLoading,
  setLedgerLookups,
  setLedgerLookupsError,
  setLedgerLookupsLoading,
  setTransactionPage,
  setTransactionPageError,
  setTransactionPageLoading,
  transactionPageKey,
  useCategoryPickerCategoriesView,
  useLedgerLookupsView,
  useTransactionPageView,
} from "@/store";

const apiErrorMessage = (error: unknown): string => {
  if (isNetworkFailure(error)) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "object" &&
    error.error !== null &&
    "message" in error.error &&
    typeof error.error.message === "string"
  ) {
    return error.error.message;
  }
  return "The API request failed.";
};

interface LoadedTransactionPage {
  readonly offset: number;
  readonly totalCount: number | undefined;
  readonly transactions: readonly Transaction[];
}

const effectivePageParams = (
  params: TransactionPageParams,
  offset: number,
): TransactionPageParams => ({
  limit: params.limit,
  offset,
});

export const useTransactionsResource = (params: TransactionPageParams) => {
  const page = useTransactionPageView(params);
  const lookups = useLedgerLookupsView();

  useEffect(() => {
    const snapshot = getTransactionsSnapshot();
    const key = transactionPageKey(params);
    if (snapshot.pages[key] || snapshot.loadingPageKey === key) {
      return;
    }

    let active = true;
    setTransactionPageLoading(params);

    void fetchTransactionPage(params).then((result) => {
      if (!active) {
        return;
      }

      if (result.data) {
        setTransactionPage(
          effectivePageParams(params, result.data.offset),
          result.data.total_count,
          result.data.transactions,
          params,
        );
        return;
      }

      setTransactionPageError(params, apiErrorMessage(result.error));
    });

    return () => {
      active = false;
    };
  }, [page.snapshot, params]);

  useEffect(() => {
    const snapshot = getTransactionsSnapshot();
    if (snapshot.lookups || snapshot.lookupsLoading) {
      return;
    }

    let active = true;
    setLedgerLookupsLoading();

    void fetchLedgerLookups().then((result) => {
      if (!active) {
        return;
      }

      if (
        result.accounts.data &&
        result.categories.data &&
        result.tags.data &&
        result.members.data
      ) {
        setLedgerLookups({
          accounts: result.accounts.data.accounts,
          categories: result.categories.data.categories,
          members: result.members.data.members,
          tags: result.tags.data.tags,
        });
        return;
      }

      setLedgerLookupsError(
        apiErrorMessage(
          result.accounts.error ??
            result.categories.error ??
            result.tags.error ??
            result.members.error,
        ),
      );
    });

    return () => {
      active = false;
    };
  }, []);

  return { lookups, page };
};

export const useCategoryPickerCategoriesResource = (
  intents: readonly CategoryEconomicIntent[],
  enabled: boolean,
  retryToken = 0,
) => {
  const intentKey = categoryPickerIntentKey(intents);
  const normalizedIntents = useMemo(
    () => normalizedCategoryPickerIntents(intents),
    [intents],
  );
  const categories = useCategoryPickerCategoriesView(normalizedIntents);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const snapshot = getTransactionsSnapshot();
    if (
      snapshot.categoryPickerCategories[intentKey] ||
      snapshot.categoryPickerCategoryLoading[intentKey]
    ) {
      return;
    }

    setCategoryPickerCategoriesLoading(normalizedIntents);

    void fetchCategoryPickerCategories(normalizedIntents).then((result) => {
      if (result.data) {
        setCategoryPickerCategories(normalizedIntents, result.data.categories);
        return;
      }

      setCategoryPickerCategoriesError(
        normalizedIntents,
        apiErrorMessage(result.error),
      );
    });
  }, [enabled, intentKey, normalizedIntents, retryToken]);

  return categories;
};

export const refreshTransactionPage = async (
  params: TransactionPageParams,
): Promise<readonly Transaction[]> => {
  invalidateTransactionPages();
  setTransactionPageLoading(params);

  const result = await fetchTransactionPage(params);
  if (result.data) {
    setTransactionPage(
      effectivePageParams(params, result.data.offset),
      result.data.total_count,
      result.data.transactions,
      params,
    );
    return result.data.transactions;
  }

  setTransactionPageError(params, apiErrorMessage(result.error));
  return [];
};

export const refreshTransactionPageAfterSave = async (
  params: TransactionPageParams,
  transactionId: number,
): Promise<boolean> => {
  const [transactions] = await Promise.all([
    refreshTransactionPage(params),
    refreshFeaturedBalances(),
    refreshOverview(),
  ]);
  return transactions.some(
    (transaction) => transaction.transaction_id === transactionId,
  );
};

export const jumpToTransactionDatePage = async (
  params: TransactionPageParams & { readonly anchorDate: string },
  isActive: () => boolean = () => true,
): Promise<LoadedTransactionPage | undefined> => {
  setTransactionPageLoading(params);

  const result = await fetchTransactionPage(params);
  if (!isActive()) {
    clearTransactionPageLoading(params);
    return undefined;
  }

  if (result.data) {
    const loadedPage = {
      offset: result.data.offset,
      totalCount: result.data.total_count,
      transactions: result.data.transactions,
    };
    // Anchor responses must return a page-aligned offset so this effective key satisfies the URL page without a second fetch.
    setTransactionPage(
      effectivePageParams(params, result.data.offset),
      result.data.total_count,
      result.data.transactions,
      params,
    );
    return loadedPage;
  }

  setTransactionPageError(params, apiErrorMessage(result.error));
  return undefined;
};
