import { useEffect } from "react";

import {
  fetchLedgerLookups,
  fetchTransactionPage,
  isNetworkFailure,
  type Transaction,
  type TransactionPageParams,
} from "@/api";
import {
  getTransactionsSnapshot,
  invalidateTransactionPages,
  setLedgerLookups,
  setLedgerLookupsError,
  setLedgerLookupsLoading,
  setTransactionPage,
  setTransactionPageError,
  setTransactionPageLoading,
  transactionPageKey,
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
          params,
          result.data.total_count,
          result.data.transactions,
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

export const refreshTransactionPage = async (
  params: TransactionPageParams,
): Promise<readonly Transaction[]> => {
  invalidateTransactionPages();
  setTransactionPageLoading(params);

  const result = await fetchTransactionPage(params);
  if (result.data) {
    setTransactionPage(
      params,
      result.data.total_count,
      result.data.transactions,
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
  const transactions = await refreshTransactionPage(params);
  return transactions.some(
    (transaction) => transaction.transaction_id === transactionId,
  );
};
