import { useCallback, useEffect, useRef, useState } from "react";
import type { SetURLSearchParams } from "react-router";

import type { Transaction, TransactionPageParams } from "@/api";
import {
  deleteTransactionById,
  fetchTransactionById,
  isNetworkFailure,
} from "@/api";
import { focusWithoutTooltip } from "@/components/tooltip";

import { refreshTransactionPage } from "./use-transactions-resource";

const parseOptionalPositiveInteger = (
  value: string | null,
): number | undefined => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return undefined;
  }
  return parsed;
};

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

interface FetchedTransactionDetail {
  readonly errorMessage: string | undefined;
  readonly transaction: Transaction | undefined;
  readonly transactionId: number;
}

interface UseTransactionDetailOptions {
  readonly lookupsLoaded: boolean;
  readonly onNotice: (message: string) => void;
  readonly params: TransactionPageParams;
  readonly searchParams: URLSearchParams;
  readonly setSearchParams: SetURLSearchParams;
  readonly transactions: readonly Transaction[] | undefined;
}

export const useTransactionDetail = ({
  lookupsLoaded,
  onNotice,
  params,
  searchParams,
  setSearchParams,
  transactions,
}: UseTransactionDetailOptions) => {
  const [fetchedDetail, setFetchedDetail] =
    useState<FetchedTransactionDetail>();
  const [suppressedDetailFetchId, setSuppressedDetailFetchId] = useState<
    number | undefined
  >();
  const detailRestoreFocusRef = useRef<HTMLElement | null>(null);
  const selectedTransactionId = parseOptionalPositiveInteger(
    searchParams.get("transaction"),
  );
  const selectedTransactionFromSnapshot = transactions?.find(
    (transaction) => transaction.transaction_id === selectedTransactionId,
  );
  const selectedFetchedDetail =
    fetchedDetail?.transactionId === selectedTransactionId
      ? fetchedDetail
      : undefined;
  const transaction =
    selectedTransactionFromSnapshot ?? selectedFetchedDetail?.transaction;
  const errorMessage = selectedTransactionFromSnapshot
    ? undefined
    : selectedFetchedDetail?.errorMessage;
  const detailNeedsFetch = Boolean(
    selectedTransactionId &&
    selectedTransactionId !== suppressedDetailFetchId &&
    !selectedTransactionFromSnapshot &&
    !selectedFetchedDetail,
  );
  const loading = detailNeedsFetch || Boolean(transaction && !lookupsLoaded);

  const openTransactionDetail = useCallback(
    (nextTransaction: Transaction) => {
      setSuppressedDetailFetchId(undefined);
      const activeElement = document.activeElement;
      detailRestoreFocusRef.current =
        activeElement instanceof HTMLElement ? activeElement : null;
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("transaction", String(nextTransaction.transaction_id));
        return next;
      });
    },
    [setSearchParams],
  );

  const closeTransactionDetail = useCallback(() => {
    setFetchedDetail(undefined);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("transaction");
      return next;
    });
  }, [setSearchParams]);

  const restoreDetailFocus = useCallback(() => {
    focusWithoutTooltip(detailRestoreFocusRef.current, { preventScroll: true });
  }, []);

  const deleteSelectedTransaction = useCallback(
    async (nextTransaction: Transaction) => {
      const result = await deleteTransactionById(
        nextTransaction.transaction_id,
      );
      if (result.error) {
        throw new Error(apiErrorMessage(result.error));
      }

      setSuppressedDetailFetchId(nextTransaction.transaction_id);
      closeTransactionDetail();
      onNotice("Transaction deleted.");
      await refreshTransactionPage(params);
    },
    [closeTransactionDetail, onNotice, params],
  );

  useEffect(() => {
    if (
      !selectedTransactionId ||
      selectedTransactionId === suppressedDetailFetchId ||
      selectedTransactionFromSnapshot ||
      selectedFetchedDetail
    ) {
      return;
    }

    let active = true;

    void fetchTransactionById(selectedTransactionId).then((result) => {
      if (!active) {
        return;
      }

      if (result.data) {
        setFetchedDetail({
          errorMessage: undefined,
          transaction: result.data,
          transactionId: selectedTransactionId,
        });
        return;
      }

      setFetchedDetail({
        errorMessage: apiErrorMessage(result.error),
        transaction: undefined,
        transactionId: selectedTransactionId,
      });
    });

    return () => {
      active = false;
    };
  }, [
    selectedFetchedDetail,
    selectedTransactionFromSnapshot,
    selectedTransactionId,
    suppressedDetailFetchId,
  ]);

  return {
    closeTransactionDetail,
    deleteSelectedTransaction,
    errorMessage,
    loading,
    openTransactionDetail,
    restoreDetailFocus,
    selectedTransactionId,
    transaction,
  };
};
