import {
  getAccountsSnapshot,
  getTransactionsSnapshot,
  type TransactionEntryLaunchContext,
  type TransactionEntryRecentTransaction,
} from "@/store";

const currentRegisterRecords = () => {
  const accountsSnapshot = getAccountsSnapshot();
  const registerPages = Object.values(accountsSnapshot.registerPages);
  const pathname = window.location.pathname.replace(/\/+$/, "");
  if (pathname === "/accounts/group") {
    const prefix = new URLSearchParams(window.location.search)
      .get("prefix")
      ?.trim();
    return {
      accountsSnapshot,
      records: prefix
        ? registerPages.flatMap((page) =>
            "accountFqnPrefix" in page.params &&
            page.params.accountFqnPrefix === prefix
              ? page.records
              : [],
          )
        : [],
    };
  }

  const accountMatch = /^\/accounts\/(\d+)$/.exec(pathname);
  const accountId = accountMatch ? Number(accountMatch[1]) : undefined;
  return {
    accountsSnapshot,
    records: accountId
      ? registerPages.flatMap((page) =>
          "accountId" in page.params && page.params.accountId === accountId
            ? page.records
            : [],
        )
      : [],
  };
};

export const captureTransactionEntryLaunchContext =
  (): TransactionEntryLaunchContext => {
    const transactionsSnapshot = getTransactionsSnapshot();
    if (window.location.pathname === "/overview") {
      return {
        recentTransactions:
          transactionsSnapshot.overview?.recentTransactions.slice(0, 12) ?? [],
      };
    }

    const registerTransactionIds = [
      ...new Set(
        Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-testid='account-register-row'][data-transaction-id]",
          ),
        )
          .map((row) => Number(row.dataset.transactionId))
          .filter((transactionId) => Number.isInteger(transactionId)),
      ),
    ];
    if (registerTransactionIds.length > 0) {
      const { accountsSnapshot, records } = currentRegisterRecords();
      const recordsByTransactionId = new Map(
        records.map((record) => [record.transaction_id, record] as const),
      );
      return {
        recentTransactions: registerTransactionIds
          .map(
            (transactionId): TransactionEntryRecentTransaction | undefined => {
              const cached =
                accountsSnapshot.transactionCache[transactionId]?.transaction;
              if (cached) {
                return cached;
              }
              const record = recordsByTransactionId.get(transactionId);
              if (!record?.transaction_display_title) {
                return undefined;
              }
              return {
                accountIds: record.transaction_account_ids ?? [],
                displayTitle: record.transaction_display_title,
                initiatedDate: record.initiated_date,
                kind: "register-summary",
                transactionId,
              };
            },
          )
          .filter(
            (transaction): transaction is TransactionEntryRecentTransaction =>
              transaction !== undefined,
          )
          .slice(0, 12),
      };
    }

    if (!document.querySelector("[data-transaction-detail-restore-target]")) {
      return { recentTransactions: [] };
    }
    const page = transactionsSnapshot.lastLoadedPageKey
      ? transactionsSnapshot.pages[transactionsSnapshot.lastLoadedPageKey]
      : undefined;
    return { recentTransactions: page?.transactions.slice(0, 12) ?? [] };
  };
