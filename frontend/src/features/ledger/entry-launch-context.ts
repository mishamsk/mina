import type { Transaction } from "@/api";
import {
  getAccountsSnapshot,
  getTransactionsSnapshot,
  type TransactionEntryLaunchContext,
} from "@/store";

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
      const accountsSnapshot = getAccountsSnapshot();
      return {
        recentTransactions: registerTransactionIds
          .map(
            (transactionId) =>
              accountsSnapshot.transactionCache[transactionId]?.transaction,
          )
          .filter(
            (transaction): transaction is Transaction =>
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
