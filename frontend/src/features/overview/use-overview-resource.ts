import { useEffect } from "react";

import {
  type Account,
  type AccountBalance,
  apiErrorMessage,
  fetchAccountsByIds,
  fetchOverviewAccountBalances,
  fetchOverviewAccounts,
  fetchTransactionMonthTotalsByMonth,
  fetchTransactionPage,
  type Transaction,
} from "@/api";
import type { OverviewBalanceRow } from "@/store";
import {
  getTransactionsSnapshot,
  setOverview,
  setOverviewError,
  setOverviewLoading,
  useOverviewView,
} from "@/store";
import { localYearMonth } from "@/utils/date";

const recentActivityLimit = 8;

let overviewLoadGeneration = 0;

const nextOverviewLoadGeneration = (): number => {
  overviewLoadGeneration += 1;
  setOverviewLoading();
  return overviewLoadGeneration;
};

const isCurrentOverviewLoad = (generation: number): boolean =>
  generation === overviewLoadGeneration;

const overviewBalanceRows = (
  accounts: readonly Account[],
  balances: readonly AccountBalance[],
): readonly OverviewBalanceRow[] => {
  const accountsById = new Map(
    accounts.map((account) => [account.account_id, account]),
  );

  return balances.flatMap((balance) => {
    const account = accountsById.get(balance.account_id);
    return account ? [{ account, balance }] : [];
  });
};

const overviewAccountIds = (
  balances: readonly AccountBalance[],
  transactions: readonly Transaction[],
): readonly number[] => [
  ...balances.map((balance) => balance.account_id),
  ...transactions.flatMap((transaction) =>
    transaction.records.map((record) => record.account_id),
  ),
];

const fetchMissingOverviewAccounts = async (
  accounts: readonly Account[],
  accountIds: readonly number[],
): Promise<{
  readonly accounts: readonly Account[];
  readonly error?: unknown;
}> => {
  const knownAccountIds = new Set(
    accounts.map((account) => account.account_id),
  );
  const missingAccountIds = accountIds.filter(
    (accountId) => !knownAccountIds.has(accountId),
  );

  if (missingAccountIds.length === 0) {
    return { accounts: [], error: undefined };
  }

  const results = await fetchAccountsByIds(missingAccountIds);
  const failedResult = results.find((result) => !result.data);
  if (failedResult) {
    return { accounts: [], error: failedResult.error };
  }

  return {
    accounts: results.flatMap((result) => (result.data ? [result.data] : [])),
    error: undefined,
  };
};

const loadOverview = async (
  generation: number,
  month: string,
  shouldCommit: () => boolean = () => true,
): Promise<void> => {
  const [accountsResult, balancesResult, totalsResult, transactionsResult] =
    await Promise.all([
      fetchOverviewAccounts(),
      fetchOverviewAccountBalances(),
      fetchTransactionMonthTotalsByMonth(month),
      fetchTransactionPage({ limit: recentActivityLimit, offset: 0 }),
    ]);

  const commitCurrent = () =>
    shouldCommit() && isCurrentOverviewLoad(generation);
  if (!commitCurrent()) {
    return;
  }

  if (!accountsResult.data) {
    setOverviewError(apiErrorMessage(accountsResult.error));
    return;
  }

  if (!balancesResult.data) {
    setOverviewError(apiErrorMessage(balancesResult.error));
    return;
  }

  if (!totalsResult.data) {
    setOverviewError(apiErrorMessage(totalsResult.error));
    return;
  }

  if (!transactionsResult.data) {
    setOverviewError(apiErrorMessage(transactionsResult.error));
    return;
  }

  const missingAccountsResult = await fetchMissingOverviewAccounts(
    accountsResult.data.accounts,
    overviewAccountIds(
      balancesResult.data.balances,
      transactionsResult.data.transactions,
    ),
  );
  if (!commitCurrent()) {
    return;
  }

  if (missingAccountsResult.error) {
    setOverviewError(apiErrorMessage(missingAccountsResult.error));
    return;
  }

  const accounts = [
    ...accountsResult.data.accounts,
    ...missingAccountsResult.accounts,
  ];

  setOverview({
    accounts,
    balanceRows: overviewBalanceRows(accounts, balancesResult.data.balances),
    month,
    monthTotals: totalsResult.data,
    recentTransactions: transactionsResult.data.transactions,
  });
};

export const refreshOverview = async (
  month = localYearMonth(),
): Promise<void> => {
  const snapshot = getTransactionsSnapshot();
  if (!snapshot.overview && !snapshot.overviewLoading) {
    return;
  }

  await loadOverview(nextOverviewLoadGeneration(), month);
};

export const useOverviewResource = (month = localYearMonth()) => {
  const overview = useOverviewView();

  useEffect(() => {
    const snapshot = getTransactionsSnapshot();
    if (snapshot.overview?.month === month && !snapshot.overviewLoading) {
      return;
    }

    let active = true;
    const generation = nextOverviewLoadGeneration();

    void loadOverview(generation, month, () => active);

    return () => {
      active = false;
    };
    // Snapshot commits re-run this effect so the fresh store state can hit the early return above.
  }, [month, overview.snapshot]);

  return overview;
};
