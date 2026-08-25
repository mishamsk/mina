import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { type SetURLSearchParams, useLocation } from "react-router";

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

interface ResponseLocalDetail {
  readonly locationKey: string;
  readonly navigationPending: boolean;
  readonly transaction: Transaction;
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
  const locationKey = useLocation().key;
  const [autoFocusOnTransactionChange, setAutoFocusOnTransactionChange] =
    useState(
      () =>
        parseOptionalPositiveInteger(searchParams.get("transaction")) !==
        undefined,
    );
  const [fetchedDetail, setFetchedDetail] =
    useState<FetchedTransactionDetail>();
  const [responseLocalDetail, setResponseLocalDetail] =
    useState<ResponseLocalDetail>();
  const responseLocalDetailRef = useRef(responseLocalDetail);
  const [suppressedDetailFetchId, setSuppressedDetailFetchId] = useState<
    number | undefined
  >();
  const detailRestoreFocusRef = useRef<HTMLElement | null>(null);
  const suppressNextRestoreFocusRef = useRef(false);
  const suppressNextTransactionChangeAutoFocusRef = useRef(false);
  const rowOpenedTransactionIdRef = useRef<number | undefined>(undefined);
  const selectedPersistedTransactionId = parseOptionalPositiveInteger(
    searchParams.get("transaction"),
  );
  let currentResponseLocalDetail = responseLocalDetail;
  if (
    currentResponseLocalDetail &&
    currentResponseLocalDetail.locationKey !== locationKey
  ) {
    if (currentResponseLocalDetail.navigationPending) {
      currentResponseLocalDetail = {
        ...currentResponseLocalDetail,
        locationKey,
        navigationPending: false,
      };
      setResponseLocalDetail(currentResponseLocalDetail);
    } else {
      currentResponseLocalDetail = undefined;
      setResponseLocalDetail(undefined);
    }
  }
  const selectedResponseLocalDetail = selectedPersistedTransactionId
    ? undefined
    : currentResponseLocalDetail?.transaction;
  const selectedTransactionId =
    selectedResponseLocalDetail?.transaction_id ??
    selectedPersistedTransactionId;
  const selectedTransactionIdRef = useRef(selectedTransactionId);
  const selectedTransactionFromSnapshot = transactions?.find(
    (transaction) => transaction.transaction_id === selectedTransactionId,
  );
  const selectedFetchedDetail =
    fetchedDetail?.transactionId === selectedTransactionId
      ? fetchedDetail
      : undefined;
  const transaction =
    selectedResponseLocalDetail ??
    selectedFetchedDetail?.transaction ??
    selectedTransactionFromSnapshot;
  const errorMessage = transaction
    ? undefined
    : selectedFetchedDetail?.errorMessage;
  const detailNeedsFetch = Boolean(
    selectedPersistedTransactionId &&
    selectedPersistedTransactionId !== suppressedDetailFetchId &&
    !selectedTransactionFromSnapshot &&
    !selectedFetchedDetail,
  );
  const loading = detailNeedsFetch || Boolean(transaction && !lookupsLoaded);

  useLayoutEffect(() => {
    responseLocalDetailRef.current = currentResponseLocalDetail;
    selectedTransactionIdRef.current = selectedTransactionId;
  }, [currentResponseLocalDetail, selectedTransactionId]);

  const closeTransactionDetail = useCallback(
    (options: { readonly suppressFetch?: boolean } = {}) => {
      setSuppressedDetailFetchId(
        options.suppressFetch ? selectedPersistedTransactionId : undefined,
      );
      setFetchedDetail(undefined);
      setResponseLocalDetail(undefined);
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("transaction");
          return next;
        },
        { replace: true },
      );
    },
    [selectedPersistedTransactionId, setSearchParams],
  );

  const openTransactionDetail = useCallback(
    (
      nextTransaction: Transaction | number,
      opener?: HTMLElement,
      options: {
        readonly autoFocusOnTransactionChange?: boolean;
        readonly toggle?: boolean;
      } = {},
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

      setAutoFocusOnTransactionChange(
        options.autoFocusOnTransactionChange ?? false,
      );
      rowOpenedTransactionIdRef.current = nextTransactionId;
      detailRestoreFocusRef.current = opener ?? null;
      if (
        typeof nextTransaction !== "number" &&
        nextTransaction.recurring_projection_definition_id != null
      ) {
        setFetchedDetail(undefined);
        setResponseLocalDetail({
          locationKey,
          navigationPending: true,
          transaction: nextTransaction,
        });
        const next = readLiveSearchParams();
        next.delete("transaction");
        setSearchParams(next, { replace: selectedTransactionId !== undefined });
        return;
      }
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
      setResponseLocalDetail(undefined);
      const activeElement = document.activeElement;
      detailRestoreFocusRef.current =
        opener ?? (activeElement instanceof HTMLElement ? activeElement : null);
      const next = readLiveSearchParams();
      next.set("transaction", String(nextTransactionId));
      setSearchParams(next, { replace: selectedTransactionId !== undefined });
    },
    [
      closeTransactionDetail,
      locationKey,
      selectedTransactionId,
      setSearchParams,
    ],
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

  const refreshSelectedProjectedTransactionDetail = useCallback(
    (
      deferredTransactionId: Transaction["transaction_id"],
      recurringDefinitionId: NonNullable<
        Transaction["recurring_projection_definition_id"]
      >,
      refreshedTransactions: readonly Transaction[],
      options: {
        readonly autoFocusOnTransactionChange?: boolean;
        readonly onlyIfSourceSelected?: boolean;
      } = {},
    ) => {
      const currentResponseLocalDetail = responseLocalDetailRef.current;
      if (
        options.autoFocusOnTransactionChange !== undefined &&
        currentResponseLocalDetail?.transaction
          .recurring_projection_definition_id === recurringDefinitionId &&
        currentResponseLocalDetail.transaction.transaction_id ===
          deferredTransactionId
      ) {
        suppressNextTransactionChangeAutoFocusRef.current =
          !options.autoFocusOnTransactionChange;
        setAutoFocusOnTransactionChange(options.autoFocusOnTransactionChange);
      }
      setResponseLocalDetail((current) => {
        if (
          !current ||
          current.transaction.recurring_projection_definition_id !==
            recurringDefinitionId ||
          (options.onlyIfSourceSelected === true &&
            current.transaction.transaction_id !== deferredTransactionId)
        ) {
          return current;
        }

        const nextTransaction =
          current.transaction.transaction_id === deferredTransactionId
            ? refreshedTransactions.find(
                (candidate) =>
                  candidate.recurring_projection_definition_id ===
                    recurringDefinitionId &&
                  candidate.recurring_projection_is_next === true,
              )
            : refreshedTransactions.find(
                (candidate) =>
                  candidate.transaction_id ===
                  current.transaction.transaction_id,
              );
        if (!nextTransaction) {
          suppressNextRestoreFocusRef.current = true;
          return undefined;
        }
        return { ...current, transaction: nextTransaction };
      });
    },
    [],
  );

  const restoreDetailFocus = useCallback((force = false) => {
    if (suppressNextRestoreFocusRef.current && !force) {
      suppressNextRestoreFocusRef.current = false;
      return;
    }
    suppressNextRestoreFocusRef.current = false;
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

  const isTransactionDetailSelected = useCallback(
    (transactionId: Transaction["transaction_id"]) =>
      selectedTransactionIdRef.current === transactionId,
    [],
  );

  useEffect(
    () => () => {
      selectedTransactionIdRef.current = undefined;
    },
    [],
  );

  useEffect(() => {
    if (
      !selectedPersistedTransactionId ||
      selectedPersistedTransactionId === suppressedDetailFetchId ||
      selectedTransactionFromSnapshot ||
      selectedFetchedDetail
    ) {
      return;
    }

    let active = true;

    void fetchTransactionById(selectedPersistedTransactionId).then((result) => {
      if (!active) {
        return;
      }

      if (result.data) {
        onFetchedTransaction?.(result.data);
        setFetchedDetail({
          errorMessage: undefined,
          transaction: result.data,
          transactionId: selectedPersistedTransactionId,
        });
        return;
      }

      setFetchedDetail({
        errorMessage: apiErrorMessage(result.error),
        transaction: undefined,
        transactionId: selectedPersistedTransactionId,
      });
    });

    return () => {
      active = false;
    };
  }, [
    selectedFetchedDetail,
    selectedTransactionFromSnapshot,
    selectedPersistedTransactionId,
    suppressedDetailFetchId,
    onFetchedTransaction,
  ]);

  useEffect(() => {
    if (suppressNextTransactionChangeAutoFocusRef.current) {
      suppressNextTransactionChangeAutoFocusRef.current = false;
      return;
    }
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
    isTransactionDetailSelected,
    loading,
    openTransactionDetail,
    refreshSelectedProjectedTransactionDetail,
    refreshSelectedTransactionDetail,
    restoreDetailFocus,
    selectedTransactionId,
    transaction,
  };
};
