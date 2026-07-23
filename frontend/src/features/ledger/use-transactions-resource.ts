import { useEffect, useMemo, useRef } from "react";

import {
  apiErrorMessage,
  type CategoryEconomicIntent,
  fetchCategoryPickerCategories,
  fetchLedgerLookups,
  fetchTransactionPage,
  type Transaction,
  type TransactionPageParams,
  triggerRecurringOccurrenceCatchup,
} from "@/api";
import { refreshFeaturedBalances } from "@/features/featured-balances";
import { refreshOverview } from "@/features/overview";
import {
  categoryPickerIntentKey,
  clearTransactionPageLoading,
  getTransactionsSnapshot,
  invalidateAccountHeader,
  invalidateAccountRegisterPages,
  invalidateAccountsPage,
  invalidateAccountTransactionCache,
  invalidateCategoriesPage,
  invalidateGroupRegisterPages,
  invalidateMembersPage,
  invalidateTagsPage,
  invalidateTransactionPages,
  markOtherTransactionPagesStale,
  markTransactionPageStale,
  normalizedCategoryPickerIntents,
  setCategoryPickerCategories,
  setCategoryPickerCategoriesError,
  setCategoryPickerCategoriesLoading,
  setLedgerLookups,
  setLedgerLookupsError,
  setLedgerLookupsLoading,
  setRefreshedTransactionPage,
  setTransactionPage,
  setTransactionPageError,
  setTransactionPageLoading,
  transactionPageKey,
  transactionPageRequestKey,
  updateDisplayedTransactionPage,
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
  const catchupPromiseRef = useRef<Promise<unknown> | undefined>(undefined);

  useEffect(() => {
    const snapshot = getTransactionsSnapshot();
    const key = transactionPageKey(params);
    const requestKey = transactionPageRequestKey(params);
    const pageAtLoadStart = snapshot.pages[key];
    const pageGenerationAtLoadStart = snapshot.pageGeneration;
    if (
      (pageAtLoadStart && !snapshot.stalePageKeys[key]) ||
      (snapshot.loadingPageKey === requestKey &&
        snapshot.loadingPageGeneration === pageGenerationAtLoadStart)
    ) {
      return;
    }

    let active = true;
    if (!pageAtLoadStart) {
      setTransactionPageLoading(params);
    }

    catchupPromiseRef.current ??= triggerRecurringOccurrenceCatchup().catch(
      () => undefined,
    );

    void catchupPromiseRef.current
      .then(() => fetchTransactionPage(params))
      .then((result) => {
        if (!active) {
          if (!pageAtLoadStart) {
            clearTransactionPageLoading(params, pageGenerationAtLoadStart);
          }
          return;
        }
        if (
          getTransactionsSnapshot().pageGeneration !== pageGenerationAtLoadStart
        ) {
          if (!pageAtLoadStart) {
            clearTransactionPageLoading(params, pageGenerationAtLoadStart);
          }
          return;
        }

        if (result.data) {
          const effectiveParams = effectivePageParams(
            params,
            result.data.offset,
          );
          if (pageAtLoadStart) {
            setRefreshedTransactionPage(
              effectiveParams,
              result.data.total_count,
              result.data.transactions,
              pageAtLoadStart,
            );
          } else {
            setTransactionPage(
              effectiveParams,
              result.data.total_count,
              result.data.transactions,
              params,
            );
          }
          return;
        }

        if (pageAtLoadStart) {
          markTransactionPageStale(params, pageAtLoadStart);
        } else {
          setTransactionPageError(params, apiErrorMessage(result.error));
        }
      });

    return () => {
      active = false;
    };
  }, [page.generation, page.snapshot, page.stale, params]);

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

export const useLedgerLookupsResource = (enabled = true) => {
  const lookups = useLedgerLookupsView();

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const snapshot = getTransactionsSnapshot();
    if (snapshot.lookups || snapshot.lookupsLoading) {
      return;
    }
    void loadLedgerLookups();
  }, [enabled]);

  return lookups;
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
  }, [categories.epoch, enabled, intentKey, normalizedIntents, retryToken]);

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

const refreshTransactionPageInBackground = async (
  params: TransactionPageParams,
): Promise<void> => {
  const key = transactionPageKey(params);
  const pageAtRefreshStart = getTransactionsSnapshot().pages[key];
  const result = await fetchTransactionPage(params);
  if (!result.data) {
    markTransactionPageStale(params, pageAtRefreshStart);
    return;
  }

  setRefreshedTransactionPage(
    effectivePageParams(params, result.data.offset),
    result.data.total_count,
    result.data.transactions,
    pageAtRefreshStart,
  );
};

export const refreshLedgerLookups = async (): Promise<void> => {
  await loadLedgerLookups();
};

export const invalidateReferencePagesAfterTransactionMutation = (): void => {
  invalidateAccountsPage();
  invalidateCategoriesPage();
  invalidateTagsPage();
  invalidateMembersPage();
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
  options: {
    readonly pageRefreshMode?: "background" | "blocking";
  } = {},
): Promise<boolean> => {
  invalidateReferencePagesAfterTransactionMutation();
  if (transaction) {
    invalidateAccountRegistersForTransaction(transaction, previousTransaction);
  }

  if (options.pageRefreshMode !== "blocking") {
    if (transaction) {
      updateDisplayedTransactionPage(params, transaction);
    }
    const rowWasVisible = Boolean(
      getTransactionsSnapshot().pages[
        transactionPageKey(params)
      ]?.transactions.some(
        (current) => current.transaction_id === transactionId,
      ),
    );
    void Promise.all([
      refreshTransactionPageInBackground(params),
      refreshFeaturedBalances(),
      refreshOverview(),
    ]);
    return rowWasVisible;
  }

  const [transactions] = await Promise.all([
    refreshTransactionPage(params),
    refreshFeaturedBalances(),
    refreshOverview(),
  ]);
  return transactions.some(
    (current) => current.transaction_id === transactionId,
  );
};

export const refreshViewsAfterEntrySave = async (
  transaction: Transaction,
  previousTransaction?: Transaction,
): Promise<boolean> => {
  const snapshot = getTransactionsSnapshot();
  const currentPage = snapshot.lastLoadedPageKey
    ? snapshot.pages[snapshot.lastLoadedPageKey]
    : undefined;
  if (currentPage) {
    return refreshTransactionPageAfterSave(
      currentPage.params,
      transaction.transaction_id,
      transaction,
      previousTransaction,
      { pageRefreshMode: "blocking" },
    );
  }

  invalidateReferencePagesAfterTransactionMutation();
  invalidateAccountRegistersForTransaction(transaction, previousTransaction);
  invalidateTransactionPages();
  await Promise.all([refreshFeaturedBalances(), refreshOverview()]);
  return false;
};

export const refreshTransactionPageAfterBulkSave = async (
  params: TransactionPageParams,
  transactions: readonly Transaction[],
): Promise<void> => {
  invalidateReferencePagesAfterTransactionMutation();
  markOtherTransactionPagesStale(params);
  for (const transaction of transactions) {
    invalidateAccountRegistersForTransaction(transaction);
  }

  await Promise.all([
    refreshTransactionPageInBackground(params),
    refreshFeaturedBalances(),
    refreshOverview(),
  ]);
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
