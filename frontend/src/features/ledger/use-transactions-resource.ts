import { useEffect, useMemo } from "react";

import {
  apiErrorMessage,
  type CategoryEconomicIntent,
  fetchCategoryPickerCategories,
  fetchLedgerLookups,
  fetchTransactionPage,
  type Transaction,
  type TransactionPageParams,
} from "@/api";
import { refreshFeaturedBalances } from "@/features/featured-balances";
import { refreshOverview } from "@/features/overview";
import {
  categoryPickerIntentKey,
  clearTransactionPageLoading,
  getTransactionsSnapshot,
  invalidateAccountHeader,
  invalidateAccountRegisterPages,
  invalidateAccountTransactionCache,
  invalidateGroupRegisterPages,
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
  transactionPageRequestKey,
  useCategoryPickerCategoriesView,
  useLedgerLookupsView,
  useTransactionPageView,
} from "@/store";

interface LoadedTransactionPage {
  readonly offset: number;
  readonly totalCount: number | undefined;
  readonly transactions: readonly Transaction[];
}

const effectivePageParams = (
  params: TransactionPageParams,
  offset: number,
): TransactionPageParams => ({
  filters: params.filters,
  limit: params.limit,
  offset,
});

const loadLedgerLookups = async (
  shouldCommit: () => boolean = () => true,
): Promise<void> => {
  setLedgerLookupsLoading();

  const result = await fetchLedgerLookups();
  if (!shouldCommit()) {
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
};

export const useTransactionsResource = (params: TransactionPageParams) => {
  const page = useTransactionPageView(params);
  const lookups = useLedgerLookupsView();

  useEffect(() => {
    const snapshot = getTransactionsSnapshot();
    const key = transactionPageKey(params);
    const requestKey = transactionPageRequestKey(params);
    if (snapshot.pages[key] || snapshot.loadingPageKey === requestKey) {
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
    void loadLedgerLookups(() => active);

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

    const requestEpoch = snapshot.categoryPickerCategoryEpoch;
    setCategoryPickerCategoriesLoading(normalizedIntents);

    void fetchCategoryPickerCategories(normalizedIntents).then((result) => {
      if (result.data) {
        setCategoryPickerCategories(
          normalizedIntents,
          result.data.categories,
          requestEpoch,
        );
        return;
      }

      setCategoryPickerCategoriesError(
        normalizedIntents,
        apiErrorMessage(result.error),
        requestEpoch,
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

export const refreshLedgerLookups = async (): Promise<void> => {
  await loadLedgerLookups();
};

export const invalidateAccountRegistersForTransaction = (
  transaction: Transaction,
  previousTransaction?: Transaction,
): void => {
  const accountIds = new Set(
    [previousTransaction, transaction]
      .filter((value): value is Transaction => Boolean(value))
      .flatMap((value) => value.records.map((record) => record.account_id)),
  );

  invalidateAccountTransactionCache(transaction.transaction_id);
  invalidateGroupRegisterPages();

  for (const accountId of accountIds) {
    invalidateAccountHeader(accountId);
    invalidateAccountRegisterPages(accountId);
  }
};

export const refreshTransactionPageAfterSave = async (
  params: TransactionPageParams,
  transactionId: number,
  transaction?: Transaction,
  previousTransaction?: Transaction,
): Promise<boolean> => {
  if (transaction) {
    invalidateAccountRegistersForTransaction(transaction, previousTransaction);
  }

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
