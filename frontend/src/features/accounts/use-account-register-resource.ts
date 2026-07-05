import { useEffect, useMemo } from "react";

import {
  type AccountRecordsPageParams,
  fetchAccountHeader,
  fetchAccountRecordsPage,
  fetchGroupRecordsPage,
  fetchLedgerLookups,
  fetchTransactionById,
  type GroupRecordsPageParams,
  isNetworkFailure,
  type JournalRecord,
  type Transaction,
} from "@/api";
import {
  accountRegisterPageKey,
  type AccountRegisterPageSnapshot,
  clearAccountHeaderLoading,
  clearAccountRegisterPageLoading,
  clearGroupRegisterPageLoading,
  clearLedgerLookupsLoading,
  getAccountsSnapshot,
  getTransactionsSnapshot,
  groupRegisterPageKey,
  type GroupRegisterPageSnapshot,
  setAccountHeader,
  setAccountHeaderError,
  setAccountHeaderLoading,
  setAccountRegisterPage,
  setAccountRegisterPageError,
  setAccountRegisterPageLoading,
  setAccountTransactionCache,
  setAccountTransactionCacheError,
  setAccountTransactionCacheLoading,
  setGroupRegisterPage,
  setGroupRegisterPageError,
  setGroupRegisterPageLoading,
  setLedgerLookups,
  setLedgerLookupsError,
  setLedgerLookupsLoading,
  useAccountHeaderView,
  useAccountRegisterPageView,
  useAccountTransactionCacheView,
  useGroupRegisterPageView,
  useLedgerLookupsView,
} from "@/store";

export type AccountRegisterParams = AccountRecordsPageParams & {
  readonly accountId: number;
};

export type GroupRegisterParams = GroupRecordsPageParams;

const emptyRecords: readonly { readonly transaction_id: number }[] = [];

type RegisterPageSnapshot =
  AccountRegisterPageSnapshot | GroupRegisterPageSnapshot;

interface RegisterPageView {
  readonly displayedSnapshot: RegisterPageSnapshot | undefined;
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly snapshot: RegisterPageSnapshot | undefined;
}

type RegisterFetchResult =
  | Awaited<ReturnType<typeof fetchAccountRecordsPage>>
  | Awaited<ReturnType<typeof fetchGroupRecordsPage>>;

interface RegisterResourceOptions<Params> {
  readonly clearRegisterPageLoading: (params: Params) => void;
  readonly fetchRegisterPage: (params: Params) => Promise<RegisterFetchResult>;
  readonly params: Params;
  readonly register: RegisterPageView;
  readonly registerPageKey: (params: Params) => string;
  readonly setRegisterPage: (
    params: Params,
    totalCount: number | undefined,
    records: readonly JournalRecord[],
  ) => void;
  readonly setRegisterPageError: (params: Params, errorMessage: string) => void;
  readonly setRegisterPageLoading: (params: Params) => void;
}

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

export const refreshGroupRegisterPage = async (
  params: GroupRegisterParams,
): Promise<void> => {
  setGroupRegisterPageLoading(params);

  const result = await fetchGroupRecordsPage(params);
  if (result.data) {
    setGroupRegisterPage(params, result.data.total_count, result.data.records);
    return;
  }

  setGroupRegisterPageError(params, apiErrorMessage(result.error));
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

const fetchAccountRegisterPage = (
  params: AccountRegisterParams,
): Promise<RegisterFetchResult> =>
  fetchAccountRecordsPage(params.accountId, params);

const fetchGroupRegisterPage = (
  params: GroupRegisterParams,
): Promise<RegisterFetchResult> => fetchGroupRecordsPage(params);

const useRegisterPageResource = <Params>({
  clearRegisterPageLoading,
  fetchRegisterPage,
  params,
  register,
  registerPageKey,
  setRegisterPage,
  setRegisterPageError,
  setRegisterPageLoading,
}: RegisterResourceOptions<Params>) => {
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
    const key = registerPageKey(params);
    if (
      snapshot.registerPages[key] ||
      snapshot.registerLoadingPageKey === key
    ) {
      return;
    }

    let active = true;
    setRegisterPageLoading(params);

    void fetchRegisterPage(params).then((result) => {
      if (!active) {
        return;
      }

      if (result.data) {
        setRegisterPage(params, result.data.total_count, result.data.records);
        return;
      }

      setRegisterPageError(params, apiErrorMessage(result.error));
    });

    return () => {
      active = false;
      clearRegisterPageLoading(params);
    };
  }, [
    clearRegisterPageLoading,
    fetchRegisterPage,
    params,
    registerPageKey,
    setRegisterPage,
    setRegisterPageError,
    setRegisterPageLoading,
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
    lookups,
    register,
    transactions: {
      errors: transactionCache.transactionCacheErrors,
      transactions,
    },
  };
};

export const useAccountRegisterResource = (params: AccountRegisterParams) => {
  const header = useAccountHeaderView(params.accountId);
  const register = useAccountRegisterPageView(params);
  const registerResource = useRegisterPageResource({
    clearRegisterPageLoading: clearAccountRegisterPageLoading,
    fetchRegisterPage: fetchAccountRegisterPage,
    params,
    register,
    registerPageKey: accountRegisterPageKey,
    setRegisterPage: setAccountRegisterPage,
    setRegisterPageError: setAccountRegisterPageError,
    setRegisterPageLoading: setAccountRegisterPageLoading,
  });

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

  return {
    header,
    ...registerResource,
  };
};

export const useGroupRegisterResource = (params: GroupRegisterParams) => {
  const register = useGroupRegisterPageView(params);

  return useRegisterPageResource({
    clearRegisterPageLoading: clearGroupRegisterPageLoading,
    fetchRegisterPage: fetchGroupRegisterPage,
    params,
    register,
    registerPageKey: groupRegisterPageKey,
    setRegisterPage: setGroupRegisterPage,
    setRegisterPageError: setGroupRegisterPageError,
    setRegisterPageLoading: setGroupRegisterPageLoading,
  });
};
