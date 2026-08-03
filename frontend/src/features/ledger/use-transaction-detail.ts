import { useCallback, useEffect, useRef, useState } from "react";
import type { SetURLSearchParams } from "react-router";

import type { Transaction, TransactionPageParams } from "@/api";
import {
  apiErrorMessage,
  deleteTransactionById,
  fetchTransactionById,
} from "@/api";
import { focusWithoutTooltip } from "@/components/tooltip";
import { refreshFeaturedBalances } from "@/features/featured-balances";
import { refreshOverview } from "@/features/overview";

import {
  invalidateAccountRegistersForTransaction,
  invalidateReferencePagesAfterTransactionMutation,
  refreshTransactionPage,
} from "./use-transactions-resource";

const parseOptionalPositiveInteger = (
  value: string | null,
): number | undefined => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return undefined;
  }
  return parsed;
};

const restoreFallbackSelector = "[data-transaction-detail-restore-target]";
export const transactionEntrySavedEvent = "mina:transaction-entry-saved";

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

  const closeTransactionDetail = useCallback(() => {
    setFetchedDetail(undefined);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("transaction");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const openTransactionDetail = useCallback(
    (nextTransaction: Transaction, opener?: HTMLElement) => {
      if (selectedTransactionId === nextTransaction.transaction_id) {
        closeTransactionDetail();
        const restoreTarget = opener ?? detailRestoreFocusRef.current;
        window.requestAnimationFrame(() => {
          focusWithoutTooltip(
            restoreTarget?.isConnected ? restoreTarget : undefined,
            { preventScroll: true },
          );
        });
        return;
      }

      setSuppressedDetailFetchId(undefined);
      const activeElement = document.activeElement;
      detailRestoreFocusRef.current =
        opener ?? (activeElement instanceof HTMLElement ? activeElement : null);
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("transaction", String(nextTransaction.transaction_id));
          return next;
        },
        { replace: selectedTransactionId !== undefined },
      );
    },
    [closeTransactionDetail, selectedTransactionId, setSearchParams],
  );

  const refreshSelectedTransactionDetail = useCallback(
    async (transactionId: number, nextTransaction?: Transaction) => {
      if (selectedTransactionId !== transactionId) {
        return;
      }

      if (nextTransaction) {
        setFetchedDetail({
          errorMessage: undefined,
          transaction: nextTransaction,
          transactionId,
        });
        return;
      }

      const result = await fetchTransactionById(transactionId);
      if (result.data) {
        setFetchedDetail({
          errorMessage: undefined,
          transaction: result.data,
          transactionId,
        });
        return;
      }

      setFetchedDetail({
        errorMessage: apiErrorMessage(result.error),
        transaction: undefined,
        transactionId,
      });
    },
    [selectedTransactionId],
  );

  const restoreDetailFocus = useCallback(() => {
    const fallback = document.querySelector<HTMLElement>(
      restoreFallbackSelector,
    );
    const target = detailRestoreFocusRef.current?.isConnected
      ? detailRestoreFocusRef.current
      : fallback;
    focusWithoutTooltip(target, {
      preventScroll: true,
    });
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
      invalidateReferencePagesAfterTransactionMutation();
      invalidateAccountRegistersForTransaction(nextTransaction);
      closeTransactionDetail();
      onNotice("Transaction deleted.");
      await Promise.all([
        refreshTransactionPage(params),
        refreshFeaturedBalances(),
        refreshOverview(),
      ]);
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

  useEffect(() => {
    const onEntrySaved = (event: Event) => {
      const transaction = (event as CustomEvent<Transaction>).detail;
      if (transaction.transaction_id !== selectedTransactionId) {
        return;
      }
      setFetchedDetail({
        errorMessage: undefined,
        transaction,
        transactionId: transaction.transaction_id,
      });
    };
    window.addEventListener(transactionEntrySavedEvent, onEntrySaved);
    return () => {
      window.removeEventListener(transactionEntrySavedEvent, onEntrySaved);
    };
  }, [selectedTransactionId]);

  return {
    closeTransactionDetail,
    deleteSelectedTransaction,
    errorMessage,
    loading,
    openTransactionDetail,
    refreshSelectedTransactionDetail,
    restoreDetailFocus,
    selectedTransactionId,
    transaction,
  };
};
