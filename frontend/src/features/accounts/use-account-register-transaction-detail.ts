import { useState } from "react";
import type { SetURLSearchParams } from "react-router";

import {
  apiErrorMessage,
  cancelTransactionById,
  confirmExpectedTransactionById,
  deleteTransactionById,
  dismissExpectedTransactionById,
  restoreTransactionById,
  type Transaction,
  updateJournalRecordsSettlement,
} from "@/api";
import {
  isMaterializedExpectedRecurringTransaction,
  refreshViewsAfterEntrySave,
  useTransactionDetail,
} from "@/features/ledger";
import { seedAccountTransactionCache } from "@/store";

interface AccountRegisterDetailNotice {
  readonly id: number;
  readonly message: string;
}

interface UseAccountRegisterTransactionDetailOptions {
  readonly lookupsLoaded: boolean;
  readonly searchParams: URLSearchParams;
  readonly setSearchParams: SetURLSearchParams;
  readonly transactions: readonly Transaction[];
}

export const useAccountRegisterTransactionDetail = ({
  lookupsLoaded,
  searchParams,
  setSearchParams,
  transactions,
}: UseAccountRegisterTransactionDetailOptions) => {
  const [notice, setNotice] = useState<AccountRegisterDetailNotice>();
  const showNotice = (message: string) => {
    setNotice((current) => ({ id: (current?.id ?? 0) + 1, message }));
  };
  const detail = useTransactionDetail({
    lookupsLoaded,
    onFetchedTransaction: seedAccountTransactionCache,
    searchParams,
    setSearchParams,
    transactions,
  });

  const refreshDetailAfterMutation = async (
    transaction: Transaction,
    previousTransaction: Transaction,
  ) => {
    await detail.refreshSelectedTransactionDetail(
      transaction.transaction_id,
      transaction,
    );
    await refreshViewsAfterEntrySave(transaction, [previousTransaction], {
      retainAccountTransactionSnapshot: true,
    });
  };

  const changeTransactionLifecycle = async (
    transaction: Transaction,
    action: "cancel" | "restore",
  ) => {
    const result =
      action === "cancel"
        ? await cancelTransactionById(transaction.transaction_id)
        : await restoreTransactionById(transaction.transaction_id);
    if (!result.data) {
      throw new Error(apiErrorMessage(result.error));
    }
    await refreshDetailAfterMutation(result.data, transaction);
    showNotice(
      action === "cancel" ? "Transaction cancelled." : "Transaction restored.",
    );
  };

  const postTransaction = async (
    transaction: Transaction,
    postedDate?: string,
  ) => {
    const recordIds = transaction.records
      .filter(
        (record) => !record.tombstoned_at && record.settlement === "pending",
      )
      .map((record) => record.record_id);
    if (recordIds.length === 0) {
      throw new Error("This transaction has no pending balance records.");
    }

    const result = await updateJournalRecordsSettlement(recordIds, "posted", {
      postedDate,
    });
    if (result.error) {
      throw new Error(apiErrorMessage(result.error));
    }
    const postedTransaction = await detail.refreshSelectedTransactionDetail(
      transaction.transaction_id,
    );
    await refreshViewsAfterEntrySave(
      postedTransaction ?? transaction,
      [transaction],
      {
        retainAccountTransactionSnapshot: Boolean(postedTransaction),
      },
    );
    showNotice("Transaction posted.");
  };

  const deleteTransaction = async (transaction: Transaction) => {
    const result = await deleteTransactionById(transaction.transaction_id);
    if (result.error) {
      throw new Error(apiErrorMessage(result.error));
    }
    detail.closeTransactionDetail({ suppressFetch: true });
    showNotice("Transaction deleted.");
    await refreshViewsAfterEntrySave(transaction, [transaction]);
  };

  const confirmExpectedTransaction = async (
    transaction: Transaction,
    actualDate: string,
  ) => {
    if (!isMaterializedExpectedRecurringTransaction(transaction)) {
      throw new Error(
        "This transaction is not a materialized expected transaction.",
      );
    }
    const result = await confirmExpectedTransactionById({
      actual_date: actualDate,
      transaction_id: transaction.transaction_id,
    });
    if (result.error) {
      throw new Error(
        apiErrorMessage(
          result.error,
          "Expected transaction could not be confirmed.",
        ),
      );
    }
    await refreshViewsAfterEntrySave(transaction, [transaction]);
    await detail.refreshSelectedTransactionDetail(transaction.transaction_id);
    showNotice("Expected transaction confirmed.");
  };

  const dismissExpectedTransaction = async (transaction: Transaction) => {
    if (!isMaterializedExpectedRecurringTransaction(transaction)) {
      throw new Error(
        "This transaction is not a materialized expected transaction.",
      );
    }
    const result = await dismissExpectedTransactionById({
      transaction_id: transaction.transaction_id,
    });
    if (result.error) {
      throw new Error(
        apiErrorMessage(
          result.error,
          "Expected transaction could not be dismissed.",
        ),
      );
    }
    detail.closeTransactionDetail();
    await refreshViewsAfterEntrySave(transaction, [transaction]);
    showNotice("Expected transaction dismissed.");
  };

  return {
    changeTransactionLifecycle,
    confirmExpectedTransaction,
    deleteTransaction,
    detail,
    dismissNotice: () => {
      setNotice(undefined);
    },
    dismissExpectedTransaction,
    notice,
    postTransaction,
  };
};
