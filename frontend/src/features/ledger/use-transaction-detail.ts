import { useCallback, useEffect, useRef, useState } from "react";
import type { SetURLSearchParams } from "react-router";

import type { Transaction } from "@/api";
import { apiErrorMessage, fetchTransactionById } from "@/api";
import { focusWithoutTooltip } from "@/components/tooltip";

import { readLiveSearchParams } from "./transaction-page-position";

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
  readonly onFetchedTransaction?: (transaction: Transaction) => void;
  readonly searchParams: URLSearchParams;
  readonly setSearchParams: SetURLSearchParams;
  readonly transactions: readonly Transaction[] | undefined;
}

export const useTransactionDetail = ({
  lookupsLoaded,
  onFetchedTransaction,
  searchParams,
  setSearchParams,
  transactions,
}: UseTransactionDetailOptions) => {
  const [autoFocusOnTransactionChange, setAutoFocusOnTransactionChange] =
    useState(
      () =>
        parseOptionalPositiveInteger(searchParams.get("transaction")) !==
        undefined,
    );
  const [fetchedDetail, setFetchedDetail] =
    useState<FetchedTransactionDetail>();
  const [suppressedDetailFetchId, setSuppressedDetailFetchId] = useState<
    number | undefined
  >();
  const detailRestoreFocusRef = useRef<HTMLElement | null>(null);
  const rowOpenedTransactionIdRef = useRef<number | undefined>(undefined);
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
    selectedFetchedDetail?.transaction ?? selectedTransactionFromSnapshot;
  const errorMessage = transaction
    ? undefined
    : selectedFetchedDetail?.errorMessage;
  const detailNeedsFetch = Boolean(
    selectedTransactionId &&
    selectedTransactionId !== suppressedDetailFetchId &&
    !selectedTransactionFromSnapshot &&
    !selectedFetchedDetail,
  );
  const loading = detailNeedsFetch || Boolean(transaction && !lookupsLoaded);

  const closeTransactionDetail = useCallback(
    (options: { readonly suppressFetch?: boolean } = {}) => {
      setSuppressedDetailFetchId(
        options.suppressFetch ? selectedTransactionId : undefined,
      );
      setFetchedDetail(undefined);
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("transaction");
          return next;
        },
        { replace: true },
      );
    },
    [selectedTransactionId, setSearchParams],
  );

  const openTransactionDetail = useCallback(
    (
      nextTransaction: Transaction | number,
      opener?: HTMLElement,
      options: { readonly toggle?: boolean } = {},
    ) => {
      const nextTransactionId =
        typeof nextTransaction === "number"
          ? nextTransaction
          : nextTransaction.transaction_id;
      if (
        selectedTransactionId === nextTransactionId &&
        options.toggle !== false
      ) {
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

      setAutoFocusOnTransactionChange(false);
      rowOpenedTransactionIdRef.current = nextTransactionId;
      detailRestoreFocusRef.current = opener ?? null;
      if (selectedTransactionId === nextTransactionId) {
        const liveSearchParams = readLiveSearchParams();
        if (
          parseOptionalPositiveInteger(liveSearchParams.get("transaction")) ===
          nextTransactionId
        ) {
          return;
        }
      }

      setSuppressedDetailFetchId(undefined);
      const activeElement = document.activeElement;
      detailRestoreFocusRef.current =
        opener ?? (activeElement instanceof HTMLElement ? activeElement : null);
      const next = readLiveSearchParams();
      next.set("transaction", String(nextTransactionId));
      setSearchParams(next, { replace: selectedTransactionId !== undefined });
    },
    [closeTransactionDetail, selectedTransactionId, setSearchParams],
  );

  const refreshSelectedTransactionDetail = useCallback(
    async (
      transactionId: number,
      nextTransaction?: Transaction,
    ): Promise<Transaction | undefined> => {
      if (selectedTransactionId !== transactionId) {
        return undefined;
      }

      if (nextTransaction) {
        setFetchedDetail({
          errorMessage: undefined,
          transaction: nextTransaction,
          transactionId,
        });
        return nextTransaction;
      }

      const result = await fetchTransactionById(transactionId);
      if (result.data) {
        onFetchedTransaction?.(result.data);
        setFetchedDetail({
          errorMessage: undefined,
          transaction: result.data,
          transactionId,
        });
        return result.data;
      }

      setFetchedDetail({
        errorMessage: apiErrorMessage(result.error),
        transaction: undefined,
        transactionId,
      });
      return undefined;
    },
    [onFetchedTransaction, selectedTransactionId],
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
        onFetchedTransaction?.(result.data);
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
    onFetchedTransaction,
  ]);

  useEffect(() => {
    if (!selectedTransactionId) {
      rowOpenedTransactionIdRef.current = undefined;
      return;
    }
    if (rowOpenedTransactionIdRef.current === selectedTransactionId) {
      rowOpenedTransactionIdRef.current = undefined;
      return;
    }
    setAutoFocusOnTransactionChange(true);
  }, [selectedTransactionId]);

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
    autoFocusOnTransactionChange,
    closeTransactionDetail,
    errorMessage,
    loading,
    openTransactionDetail,
    refreshSelectedTransactionDetail,
    restoreDetailFocus,
    selectedTransactionId,
    transaction,
  };
};
