import { useCallback, useEffect, useEffectEvent, useState } from "react";

import {
  apiErrorDetails,
  apiErrorMessage,
  fetchLedgerLookups,
  fetchTransactionPage,
  type Transaction,
  type TransactionPageParams,
} from "@/api";
import { refreshFeaturedBalances } from "@/features/featured-balances";
import { refreshOverview } from "@/features/overview";
import { transactionFilterUsesRelativeTime } from "@/models/transaction-filters";
import {
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
  invalidateTransactionPagesPreservingSnapshots,
  markOtherTransactionPagesStale,
  markTransactionPageStale,
  seedAccountTransactionCache,
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
  useLedgerLookupsView,
  useTransactionPageView,
} from "@/store";

interface LoadedTransactionPage {
  readonly offset: number;
  readonly totalCount: number | undefined;
  readonly transactions: readonly Transaction[];
}

interface BackgroundPageRefresh {
  readonly refreshed: boolean;
  readonly transactions: readonly Transaction[] | undefined;
}

let ledgerLookupRequestEpoch = 0;
const pendingPageRefreshCallbacks = new Map<string, Set<() => void>>();
const backgroundPageRefreshes = new Map<
  string,
  Promise<BackgroundPageRefresh>
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
  anchorDate: params.anchorDate,
  filters: params.filters,
  includeExpectedByDefault: params.includeExpectedByDefault,
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
  const [pageRetryToken, setPageRetryToken] = useState(0);
  const usesRelativeTime = transactionFilterUsesRelativeTime(params.filters);

  useEffect(
    () => () => {
      pendingPageRefreshCallbacks.delete(pageKey);
    },
    [pageKey, requestKey],
  );

  useEffect(() => {
    if (!usesRelativeTime) return;
    return () => {
      const snapshot = getTransactionsSnapshot().pages[pageKey];
      if (snapshot) markTransactionPageStale(snapshot.params, snapshot);
    };
  }, [pageKey, usesRelativeTime]);

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

    void fetchTransactionPage(requestParams)
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
              snapshot.pageErrors[key],
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
              snapshot.pageErrors,
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
      })
      .catch((error: unknown) => {
        const errorMessage =
          error instanceof Error ? error.message : apiErrorMessage(error);
        const errorDetails =
          error instanceof Error ? error.message : apiErrorDetails(error);
        if (
          !isActive() ||
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
        if (pageAtLoadStart) {
          const repeatedFailure = markTransactionPageStale(
            requestParams,
            pageAtLoadStart,
            errorDetails,
          );
          if (repeatedFailure) {
            settlePageRefreshCallbacks(requestParams);
          }
        } else {
          setTransactionPageError(requestParams, errorMessage);
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
    pageRetryToken,
    requestKey,
  ]);

  useEffect(() => {
    const snapshot = getTransactionsSnapshot();
    if (snapshot.lookups || snapshot.lookupsLoading) {
      return;
    }

    void loadLedgerLookups();
  }, []);

  const retryPage = useCallback(() => {
    const snapshot = getTransactionsSnapshot();
    const currentPage = snapshot.pages[pageKey];
    if (currentPage && !snapshot.stalePageKeys[pageKey]) {
      markTransactionPageStale(params, currentPage);
    }
    setPageRetryToken((current) => current + 1);
  }, [pageKey, params]);

  return { lookups, page, retryPage };
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

export const refreshTransactionPage = async (
  params: TransactionPageParams,
): Promise<readonly Transaction[]> => {
  cancelAllPageRefreshCallbacks();
  invalidateTransactionPages();
  setTransactionPageLoading(params);

  const snapshotAtRequestStart = getTransactionsSnapshot();
  const result = await fetchTransactionPage(params);
  if (result.data) {
    setTransactionPage(
      effectivePageParams(params, result.data.offset),
      result.data.total_count,
      result.data.transactions,
      params,
      snapshotAtRequestStart.pageErrors,
    );
    return result.data.transactions;
  }

  setTransactionPageError(params, apiErrorMessage(result.error));
  return [];
};

const refreshTransactionPageInBackground = (
  params: TransactionPageParams,
): Promise<BackgroundPageRefresh> => {
  const key = transactionPageKey(params);
  const refreshEpoch = (backgroundPageRefreshEpochs.get(key) ?? 0) + 1;
  backgroundPageRefreshEpochs.set(key, refreshEpoch);
  const snapshotAtRefreshStart = getTransactionsSnapshot();
  const pageAtRefreshStart = snapshotAtRefreshStart.pages[key];
  const refresh = (async (): Promise<BackgroundPageRefresh> => {
    const result = await fetchTransactionPage(params);
    if (backgroundPageRefreshEpochs.get(key) !== refreshEpoch) {
      return (
        backgroundPageRefreshes.get(key) ?? {
          refreshed: true,
          transactions: getTransactionsSnapshot().pages[key]?.transactions,
        }
      );
    }
    if (!result.data) {
      markTransactionPageStale(
        params,
        pageAtRefreshStart,
        apiErrorDetails(result.error),
      );
      return {
        refreshed: false,
        transactions: pageAtRefreshStart?.transactions,
      };
    }

    const refreshed = setRefreshedTransactionPage(
      effectivePageParams(params, result.data.offset),
      result.data.total_count,
      result.data.transactions,
      pageAtRefreshStart,
      snapshotAtRefreshStart.pageErrors[key],
    );
    if (refreshed) {
      settlePageRefreshCallbacks(params);
    } else {
      const currentPage = getTransactionsSnapshot().pages[key];
      markTransactionPageStale(params, currentPage);
    }
    return {
      refreshed,
      transactions: refreshed
        ? result.data.transactions
        : getTransactionsSnapshot().pages[key]?.transactions,
    };
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

export const refreshTransactionPagePreservingSnapshot = async (
  params: TransactionPageParams,
): Promise<readonly Transaction[]> => {
  markOtherTransactionPagesStale(params);
  const refresh = await refreshTransactionPageInBackground(params);
  if (!refresh.refreshed) {
    throw new Error("Transactions could not be refreshed.");
  }
  return refresh.transactions ?? [];
};

export const refreshLedgerLookups = async (): Promise<void> => {
  await loadLedgerLookups();
};

export const recurringDefinitionMutationEvent =
  "mina:recurring-definition-mutated";

export const invalidateTransactionsForRecurringDefinitionMutation =
  (): void => {
    invalidateTransactionPagesPreservingSnapshots();
    window.dispatchEvent(new Event(recurringDefinitionMutationEvent));
  };

export const invalidateReferencePagesAfterTransactionMutation = (): void => {
  invalidateAccountsPage();
  invalidateCategoriesPage();
  invalidateTagsPage();
  invalidateMembersPage();
};

export const invalidateAccountRegistersForTransaction = (
  transaction: Transaction,
  previousTransactions: readonly Transaction[] = [],
): void => {
  const accountIds = new Set(
    [...previousTransactions, transaction].flatMap((value) =>
      value.records.map((record) => record.account_id),
    ),
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
  previousTransactions: readonly Transaction[] = [],
  options: {
    readonly onPageRefresh?: (rowRemainsVisible: boolean) => void;
    readonly pageRefreshMode?:
      "background" | "blocking" | "blocking-preserving";
  } = {},
): Promise<boolean> => {
  invalidateReferencePagesAfterTransactionMutation();
  if (transaction) {
    invalidateAccountRegistersForTransaction(transaction, previousTransactions);
  }

  if (options.pageRefreshMode === "blocking-preserving") {
    const [transactions] = await Promise.all([
      refreshTransactionPagePreservingSnapshot(params),
      refreshFeaturedBalances(),
      refreshOverview(),
    ]);
    return transactions.some(
      (current) => current.transaction_id === transactionId,
    );
  }

  if (options.pageRefreshMode !== "blocking") {
    const pageStale = Boolean(
      getTransactionsSnapshot().stalePageKeys[transactionPageKey(params)],
    );
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
    if (!pageStale) {
      void refreshTransactionPageInBackground(params);
    }
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

export const publishTransactionConflictWinner = (
  params: TransactionPageParams,
  transaction: Transaction,
  previousTransaction: Transaction,
): boolean => {
  const displayedTransaction = getTransactionsSnapshot().pages[
    transactionPageKey(params)
  ]?.transactions.find(
    (current) => current.transaction_id === transaction.transaction_id,
  );
  if (
    displayedTransaction &&
    normalizedTimestampSortKey(displayedTransaction.updated_at) >
      normalizedTimestampSortKey(transaction.updated_at)
  ) {
    return false;
  }
  invalidateReferencePagesAfterTransactionMutation();
  invalidateAccountRegistersForTransaction(transaction, [previousTransaction]);
  updateDisplayedTransactionPage(params, transaction);
  void Promise.all([refreshFeaturedBalances(), refreshOverview()]);
  return true;
};

const normalizedTimestampSortKey = (value: string): string => {
  const utc = /^(.*?)(?:\.(\d+))?Z$/.exec(value);
  return utc ? `${utc[1]}.${(utc[2] ?? "").padEnd(9, "0")}Z` : value;
};

export const refreshViewsAfterEntrySave = async (
  transaction: Transaction,
  previousTransactions: readonly Transaction[] = [],
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
      previousTransactions,
      {
        onPageRefresh: options.onPageRefresh,
        pageRefreshMode: options.pageRefreshMode ?? "blocking",
      },
    );
    retainAccountTransactionSnapshot();
    return refresh;
  }

  invalidateReferencePagesAfterTransactionMutation();
  invalidateAccountRegistersForTransaction(transaction, previousTransactions);
  retainAccountTransactionSnapshot();
  cancelAllPageRefreshCallbacks();
  invalidateTransactionPages();
  await Promise.all([refreshFeaturedBalances(), refreshOverview()]);
  return false;
};

export const refreshTransactionPageAfterEditModeSave = async (
  params: TransactionPageParams,
  transactions: readonly Transaction[],
  additionalAccountIds: readonly number[] = [],
): Promise<BackgroundPageRefresh> => {
  invalidateReferencePagesAfterTransactionMutation();
  markOtherTransactionPagesStale(params);
  for (const transaction of transactions) {
    invalidateAccountRegistersForTransaction(transaction);
  }
  for (const accountId of additionalAccountIds) {
    invalidateAccountHeader(accountId);
    invalidateAccountRegisterPages(accountId);
  }

  const [pageRefresh] = await Promise.all([
    refreshTransactionPageInBackground(params),
    refreshFeaturedBalances(),
    refreshOverview(),
  ]);
  return pageRefresh;
};

export const jumpToTransactionDatePage = async (
  params: TransactionPageParams & { readonly anchorDate: string },
  isActive: () => boolean = () => true,
): Promise<LoadedTransactionPage | undefined> => {
  setTransactionPageLoading(params);

  const snapshotAtRequestStart = getTransactionsSnapshot();
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
      snapshotAtRequestStart.pageErrors,
    );
    return loadedPage;
  }

  clearTransactionPageLoading(params);
  setTransactionPageError(
    { ...params, anchorDate: undefined },
    apiErrorMessage(result.error),
  );
  return undefined;
};
