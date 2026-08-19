import { useEffect, useEffectEvent, useMemo, useRef } from "react";

import {
  apiErrorDetails,
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
  seedAccountTransactionCache,
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

let ledgerLookupRequestEpoch = 0;
const pendingPageRefreshCallbacks = new Map<string, Set<() => void>>();
const backgroundPageRefreshes = new Map<
  string,
  Promise<readonly Transaction[] | undefined>
>();
const backgroundPageRefreshEpochs = new Map<string, number>();

const queuePageRefreshCallback = (
  params: TransactionPageParams,
  callback: () => void,
): void => {
  const key = transactionPageKey(params);
  const callbacks = pendingPageRefreshCallbacks.get(key) ?? new Set();
  callbacks.add(callback);
  pendingPageRefreshCallbacks.set(key, callbacks);
};

const cancelPageRefreshCallback = (params: TransactionPageParams): void => {
  pendingPageRefreshCallbacks.delete(transactionPageKey(params));
};

const cancelAllPageRefreshCallbacks = (): void => {
  pendingPageRefreshCallbacks.clear();
};

const settlePageRefreshCallbacks = (params: TransactionPageParams): void => {
  const key = transactionPageKey(params);
  const callbacks = pendingPageRefreshCallbacks.get(key);
  if (!callbacks) {
    return;
  }

  pendingPageRefreshCallbacks.delete(key);
  for (const callback of callbacks) {
    callback();
  }
};

const effectivePageParams = (
  params: TransactionPageParams,
  offset: number,
): TransactionPageParams => ({
  filters: params.filters,
  limit: params.limit,
  offset,
  sort: params.sort,
  sortDirection: params.sortDirection,
});

const loadLedgerLookups = async (
  shouldCommit: () => boolean = () => true,
): Promise<void> => {
  const requestEpoch = ++ledgerLookupRequestEpoch;
  setLedgerLookupsLoading();

  const result = await fetchLedgerLookups();
  if (!shouldCommit() || requestEpoch !== ledgerLookupRequestEpoch) {
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
  const pageKey = transactionPageKey(params);
  const requestKey = transactionPageRequestKey(params);
  const page = useTransactionPageView(params);
  const lookups = useLedgerLookupsView();
  const catchupPromiseRef = useRef<Promise<unknown> | undefined>(undefined);

  useEffect(
    () => () => {
      pendingPageRefreshCallbacks.delete(pageKey);
    },
    [pageKey, requestKey],
  );

  const loadPage = useEffectEvent((isActive: () => boolean) => {
    const requestParams = params;
    const snapshot = getTransactionsSnapshot();
    const key = transactionPageKey(requestParams);
    const pageAtLoadStart = snapshot.pages[key];
    const pageGenerationAtLoadStart = snapshot.pageGeneration;
    if (!pageAtLoadStart) {
      cancelPageRefreshCallback(requestParams);
    }
    if (
      (pageAtLoadStart && !snapshot.stalePageKeys[key]) ||
      (snapshot.loadingPageKey === requestKey &&
        snapshot.loadingPageGeneration === pageGenerationAtLoadStart)
    ) {
      return;
    }

    if (!pageAtLoadStart) {
      setTransactionPageLoading(requestParams);
    }

    catchupPromiseRef.current ??= triggerRecurringOccurrenceCatchup().catch(
      () => undefined,
    );

    void catchupPromiseRef.current
      .then(() => fetchTransactionPage(requestParams))
      .then((result) => {
        if (!isActive()) {
          if (!pageAtLoadStart) {
            clearTransactionPageLoading(
              requestParams,
              pageGenerationAtLoadStart,
            );
          }
          return;
        }
        if (
          getTransactionsSnapshot().pageGeneration !== pageGenerationAtLoadStart
        ) {
          if (!pageAtLoadStart) {
            clearTransactionPageLoading(
              requestParams,
              pageGenerationAtLoadStart,
            );
          }
          return;
        }

        if (result.data) {
          const effectiveParams = effectivePageParams(
            requestParams,
            result.data.offset,
          );
          if (pageAtLoadStart) {
            const refreshed = setRefreshedTransactionPage(
              effectiveParams,
              result.data.total_count,
              result.data.transactions,
              pageAtLoadStart,
            );
            if (refreshed) {
              settlePageRefreshCallbacks(requestParams);
            }
          } else {
            setTransactionPage(
              effectiveParams,
              result.data.total_count,
              result.data.transactions,
              requestParams,
            );
          }
          return;
        }

        if (pageAtLoadStart) {
          const repeatedFailure = markTransactionPageStale(
            requestParams,
            pageAtLoadStart,
            apiErrorDetails(result.error),
          );
          if (repeatedFailure) {
            settlePageRefreshCallbacks(requestParams);
          }
        } else {
          setTransactionPageError(requestParams, apiErrorMessage(result.error));
        }
      });
  });

  useEffect(() => {
    let active = true;
    loadPage(() => active);
    return () => {
      active = false;
    };
  }, [
    page.generation,
    page.refreshFailed,
    page.snapshot,
    page.stale,
    requestKey,
  ]);

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
  cancelAllPageRefreshCallbacks();
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

const refreshTransactionPageInBackground = (
  params: TransactionPageParams,
): Promise<readonly Transaction[] | undefined> => {
  const key = transactionPageKey(params);
  const refreshEpoch = (backgroundPageRefreshEpochs.get(key) ?? 0) + 1;
  backgroundPageRefreshEpochs.set(key, refreshEpoch);
  const pageAtRefreshStart = getTransactionsSnapshot().pages[key];
  const refresh = (async (): Promise<readonly Transaction[] | undefined> => {
    const result = await fetchTransactionPage(params);
    if (backgroundPageRefreshEpochs.get(key) !== refreshEpoch) {
      return (
        backgroundPageRefreshes.get(key) ??
        getTransactionsSnapshot().pages[key]?.transactions
      );
    }
    if (!result.data) {
      markTransactionPageStale(
        params,
        pageAtRefreshStart,
        apiErrorDetails(result.error),
      );
      return pageAtRefreshStart?.transactions;
    }

    const refreshed = setRefreshedTransactionPage(
      effectivePageParams(params, result.data.offset),
      result.data.total_count,
      result.data.transactions,
      pageAtRefreshStart,
    );
    if (refreshed) {
      settlePageRefreshCallbacks(params);
    }
    return result.data.transactions;
  })();
  backgroundPageRefreshes.set(key, refresh);
  void refresh.then(
    () => {
      if (backgroundPageRefreshEpochs.get(key) === refreshEpoch) {
        backgroundPageRefreshes.delete(key);
        backgroundPageRefreshEpochs.delete(key);
      }
    },
    () => {
      if (backgroundPageRefreshEpochs.get(key) === refreshEpoch) {
        backgroundPageRefreshes.delete(key);
        backgroundPageRefreshEpochs.delete(key);
      }
    },
  );
  return refresh;
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
    readonly onPageRefresh?: (rowRemainsVisible: boolean) => void;
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
    if (options.onPageRefresh) {
      queuePageRefreshCallback(params, () => {
        options.onPageRefresh?.(
          Boolean(
            getTransactionsSnapshot().pages[
              transactionPageKey(params)
            ]?.transactions.some(
              (current) => current.transaction_id === transactionId,
            ),
          ),
        );
      });
    }
    void refreshTransactionPageInBackground(params);
    void Promise.all([refreshFeaturedBalances(), refreshOverview()]);
    return Boolean(
      getTransactionsSnapshot().pages[
        transactionPageKey(params)
      ]?.transactions.some(
        (current) => current.transaction_id === transactionId,
      ),
    );
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
  options: {
    readonly onPageRefresh?: (rowRemainsVisible: boolean) => void;
    readonly pageRefreshMode?: "background" | "blocking";
    readonly retainAccountTransactionSnapshot?: boolean;
  } = {},
): Promise<boolean> => {
  const retainAccountTransactionSnapshot = () => {
    if (!options.retainAccountTransactionSnapshot) {
      return;
    }
    seedAccountTransactionCache(transaction);
  };
  const snapshot = getTransactionsSnapshot();
  const currentPage = snapshot.lastLoadedPageKey
    ? snapshot.pages[snapshot.lastLoadedPageKey]
    : undefined;
  if (currentPage) {
    const refresh = refreshTransactionPageAfterSave(
      currentPage.params,
      transaction.transaction_id,
      transaction,
      previousTransaction,
      {
        onPageRefresh: options.onPageRefresh,
        pageRefreshMode: options.pageRefreshMode ?? "blocking",
      },
    );
    retainAccountTransactionSnapshot();
    return refresh;
  }

  invalidateReferencePagesAfterTransactionMutation();
  invalidateAccountRegistersForTransaction(transaction, previousTransaction);
  retainAccountTransactionSnapshot();
  cancelAllPageRefreshCallbacks();
  invalidateTransactionPages();
  await Promise.all([refreshFeaturedBalances(), refreshOverview()]);
  return false;
};

export const refreshTransactionPageAfterEditModeSave = async (
  params: TransactionPageParams,
  transactions: readonly Transaction[],
): Promise<readonly Transaction[]> => {
  invalidateReferencePagesAfterTransactionMutation();
  markOtherTransactionPagesStale(params);
  for (const transaction of transactions) {
    invalidateAccountRegistersForTransaction(transaction);
  }

  const [refreshedTransactions] = await Promise.all([
    refreshTransactionPageInBackground(params),
    refreshFeaturedBalances(),
    refreshOverview(),
  ]);
  return refreshedTransactions ?? [];
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
