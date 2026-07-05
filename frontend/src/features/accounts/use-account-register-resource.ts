import { useEffect, useMemo } from "react";

import {
  type AccountRecordsPageParams,
  fetchAccountHeader,
  fetchAccountRecordsPage,
  fetchLedgerLookups,
  fetchTransactionById,
  isNetworkFailure,
  type Transaction,
} from "@/api";
import {
  accountRegisterPageKey,
  clearAccountHeaderLoading,
  clearAccountRegisterPageLoading,
  clearLedgerLookupsLoading,
  getAccountsSnapshot,
  getTransactionsSnapshot,
  setAccountHeader,
  setAccountHeaderError,
  setAccountHeaderLoading,
  setAccountRegisterPage,
  setAccountRegisterPageError,
  setAccountRegisterPageLoading,
  setAccountTransactionCache,
  setAccountTransactionCacheError,
  setAccountTransactionCacheLoading,
  setLedgerLookups,
  setLedgerLookupsError,
  setLedgerLookupsLoading,
  useAccountHeaderView,
  useAccountRegisterPageView,
  useAccountTransactionCacheView,
  useLedgerLookupsView,
} from "@/store";

export type AccountRegisterParams = AccountRecordsPageParams & {
  readonly accountId: number;
};

const emptyRecords: readonly { readonly transaction_id: number }[] = [];

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

export const refreshAccountRegisterPage = async (
  params: AccountRegisterParams,
): Promise<void> => {
  setAccountRegisterPageLoading(params);

  const result = await fetchAccountRecordsPage(params.accountId, params);
  if (result.data) {
    setAccountRegisterPage(
      params,
      result.data.total_count,
      result.data.records,
    );
    return;
  }

  setAccountRegisterPageError(params, apiErrorMessage(result.error));
};

const ensureTransactions = async (
  transactionIds: readonly number[],
): Promise<void> => {
  const snapshot = getAccountsSnapshot();
  const missingIds = [...new Set(transactionIds)].filter(
    (transactionId) =>
      !snapshot.transactionCache[transactionId] &&
      !snapshot.transactionCacheLoading[transactionId] &&
      !snapshot.transactionCacheErrors[transactionId],
  );

  // Concurrent register renders can still race before the loading flag is visible; duplicated fetches settle into the same cache slot.
  await Promise.all(
    missingIds.map(async (transactionId) => {
      setAccountTransactionCacheLoading(transactionId);
      const result = await fetchTransactionById(transactionId);
      if (result.data) {
        setAccountTransactionCache(result.data);
        return;
      }
      setAccountTransactionCacheError(
        transactionId,
        apiErrorMessage(result.error),
      );
    }),
  );
};

export const refreshAccountTransaction = async (
  transactionId: number,
): Promise<void> => {
  setAccountTransactionCacheLoading(transactionId);

  const result = await fetchTransactionById(transactionId);
  if (result.data) {
    setAccountTransactionCache(result.data);
    return;
  }

  setAccountTransactionCacheError(transactionId, apiErrorMessage(result.error));
};

export const useAccountRegisterResource = (params: AccountRegisterParams) => {
  const header = useAccountHeaderView(params.accountId);
  const register = useAccountRegisterPageView(params);
  const lookups = useLedgerLookupsView();
  const records = register.displayedSnapshot?.records ?? emptyRecords;
  const transactionIds = useMemo(
    () => records.map((record) => record.transaction_id),
    [records],
  );
  const transactionCache = useAccountTransactionCacheView();
  const transactions = useMemo(
    () =>
      Object.fromEntries(
        [...new Set(transactionIds)]
          .map((transactionId) => [
            transactionId,
            transactionCache.transactionCache[transactionId]?.transaction,
          ])
          .filter(([, transaction]) => transaction),
      ) as Readonly<Record<number, Transaction>>,
    [transactionCache.transactionCache, transactionIds],
  );

  useEffect(() => {
    const snapshot = getAccountsSnapshot();
    if (
      snapshot.accountHeaders[params.accountId] ||
      snapshot.accountHeaderLoading[params.accountId]
    ) {
      return;
    }

    let active = true;
    setAccountHeaderLoading(params.accountId);

    void fetchAccountHeader(params.accountId).then((result) => {
      if (!active) {
        return;
      }

      if (
        result.account.data &&
        result.balances.data &&
        result.creditLimitHistory.data
      ) {
        setAccountHeader(params.accountId, {
          account: result.account.data,
          balances: result.balances.data.balances,
          creditLimitHistory:
            result.creditLimitHistory.data.credit_limit_history,
        });
        return;
      }

      setAccountHeaderError(
        params.accountId,
        apiErrorMessage(
          result.account.error ??
            result.balances.error ??
            result.creditLimitHistory.error,
        ),
      );
    });

    return () => {
      active = false;
      clearAccountHeaderLoading(params.accountId);
    };
  }, [header.snapshot, params.accountId]);

  useEffect(() => {
    const snapshot = getAccountsSnapshot();
    const key = accountRegisterPageKey(params);
    if (
      snapshot.registerPages[key] ||
      snapshot.registerLoadingPageKey === key
    ) {
      return;
    }

    let active = true;
    setAccountRegisterPageLoading(params);

    void fetchAccountRecordsPage(params.accountId, params).then((result) => {
      if (!active) {
        return;
      }

      if (result.data) {
        setAccountRegisterPage(
          params,
          result.data.total_count,
          result.data.records,
        );
        return;
      }

      setAccountRegisterPageError(params, apiErrorMessage(result.error));
    });

    return () => {
      active = false;
      clearAccountRegisterPageLoading(params);
    };
  }, [params]);

  useEffect(() => {
    const snapshot = getTransactionsSnapshot();
    if (snapshot.lookups || snapshot.lookupsLoading) {
      return;
    }

    let active = true;
    void loadLedgerLookups(() => active);

    return () => {
      active = false;
      clearLedgerLookupsLoading();
    };
  }, []);

  useEffect(() => {
    if (transactionIds.length === 0) {
      return;
    }

    void ensureTransactions(transactionIds);
  }, [transactionIds]);

  return {
    header,
    lookups,
    register,
    transactions: {
      errors: transactionCache.transactionCacheErrors,
      transactions,
    },
  };
};
