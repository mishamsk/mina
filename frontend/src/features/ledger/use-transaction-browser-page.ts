import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  NavigationType,
  type SetURLSearchParams,
  useLocation,
  useNavigationType,
} from "react-router";

import {
  apiErrorMessage,
  cancelTransactionById,
  confirmRecurringOccurrenceById,
  deleteTransactionById,
  dismissRecurringOccurrenceById,
  fetchTransactionById,
  replaceLedgerTransaction,
  restoreTransactionById,
  type Transaction,
  type TransactionPageParams,
  updateJournalRecordsCategory,
  updateJournalRecordsMember,
  updateJournalRecordsReconciliation,
  updateJournalRecordsSettlement,
  updateJournalRecordsTagsOperation,
} from "@/api";
import type { TransactionFilters } from "@/models/transaction-filters";
import {
  setTransactionEditModeAvailable,
  setTransactionEditModeEnabled,
  transactionPageKey,
  useTransactionEditModeView,
} from "@/store";

import {
  activeEditModeRecords,
  editModeCategoryTargetRecords,
  formatEditModeSkipReasons,
  predictEditMode,
  summarizeEditModeSkips,
} from "./edit-mode-prediction";
import {
  type AmountSavePageRefresh,
  transactionAmountUpdateBody,
} from "./transaction-amount-update";
import type { EditDockUpdate } from "./transaction-edit-dock";
import {
  defaultTransactionPage,
  readTransactionPageFromSearchParams,
  transactionOffsetFromPage,
} from "./transaction-page-position";
import { useTransactionDateJump } from "./use-transaction-date-jump";
import { useTransactionDetail } from "./use-transaction-detail";
import {
  refreshTransactionPageAfterEditModeSave,
  refreshTransactionPageAfterSave,
  useTransactionsResource,
} from "./use-transactions-resource";

interface Notice {
  readonly id: number;
  readonly kind: "success" | "warning";
  readonly message: string;
}

interface UseTransactionBrowserPageOptions {
  readonly filters: TransactionFilters;
  readonly readFiltersFromSearchParams?: (
    searchParams: URLSearchParams,
  ) => TransactionFilters;
  readonly searchParams: URLSearchParams;
  readonly setSearchParams: SetURLSearchParams;
}

export const useTransactionBrowserPage = ({
  filters,
  readFiltersFromSearchParams,
  searchParams,
  setSearchParams,
}: UseTransactionBrowserPageOptions) => {
  const { enabled: editMode, pendingAmountSave } = useTransactionEditModeView();
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousLocationKeyRef = useRef(location.key);
  const historyNavigationRef = useRef(false);
  const editModeDetailClosePendingRef = useRef(false);
  const [notice, setNotice] = useState<Notice | undefined>();
  const [selectedTransactionsById, setSelectedTransactionsById] = useState<
    ReadonlyMap<number, Transaction>
  >(() => new Map());
  const selectedTransactionIds = useMemo(
    () => new Set(selectedTransactionsById.keys()),
    [selectedTransactionsById],
  );
  const clearTransactionSelection = useCallback(() => {
    setSelectedTransactionsById(new Map());
  }, []);
  const updateSelectedTransactionSnapshot = useCallback(
    (transaction: Transaction) => {
      setSelectedTransactionsById((current) => {
        if (!current.has(transaction.transaction_id)) {
          return current;
        }
        const next = new Map(current);
        next.set(transaction.transaction_id, transaction);
        return next;
      });
    },
    [],
  );
  const removeSelectedTransaction = useCallback((transactionId: number) => {
    setSelectedTransactionsById((current) => {
      if (!current.has(transactionId)) {
        return current;
      }
      const next = new Map(current);
      next.delete(transactionId);
      return next;
    });
  }, []);
  const dateJumpFocusRestoreRef = useRef<HTMLButtonElement | null>(null);
  const { page, pageSize } = readTransactionPageFromSearchParams(searchParams);
  const params: TransactionPageParams = useMemo(
    () => ({
      filters,
      limit: pageSize,
      offset: transactionOffsetFromPage(page, pageSize),
    }),
    [filters, page, pageSize],
  );
  const {
    cancelDateJump,
    dateJumpAnchor,
    dateJumpLoading,
    dateJumpValue,
    jumpToAdjacentDate,
    jumpToDate,
    jumpToToday,
    setDateJumpValue,
  } = useTransactionDateJump({
    page,
    pageSize,
    params,
    readFiltersFromSearchParams,
    setSearchParams,
  });
  const { lookups, page: pageResource } = useTransactionsResource(params);
  const displayedSnapshot = pageResource.displayedSnapshot;
  const displayedPageParams = displayedSnapshot?.params ?? params;
  const transactions = displayedSnapshot?.transactions;
  const totalCount = displayedSnapshot?.totalCount;
  const displayedPageKey = transactionPageKey(displayedPageParams);
  const displayedPageKeyRef = useRef(displayedPageKey);
  useLayoutEffect(() => {
    const previousPageKey = displayedPageKeyRef.current;
    displayedPageKeyRef.current = displayedPageKey;
    if (previousPageKey !== displayedPageKey) {
      clearTransactionSelection();
    }
  }, [clearTransactionSelection, displayedPageKey]);
  const selectedTransactions = useMemo(
    () => Array.from(selectedTransactionsById.values()),
    [selectedTransactionsById],
  );
  const loading =
    pageResource.loading ||
    dateJumpLoading ||
    lookups.loading ||
    (Boolean(transactions) && !lookups.snapshot);
  const errorMessage =
    lookups.errorMessage ??
    (pageResource.snapshot ? undefined : pageResource.errorMessage);
  const refreshErrorMessage = pageResource.snapshot
    ? pageResource.errorMessage
    : undefined;

  const showNotice = useCallback(
    (message: string, kind: Notice["kind"] = "success") => {
      setNotice((current) => ({
        id: (current?.id ?? 0) + 1,
        kind,
        message,
      }));
    },
    [],
  );

  const dismissNotice = useCallback(() => {
    setNotice(undefined);
  }, []);

  useEffect(() => {
    if (dateJumpLoading || !dateJumpFocusRestoreRef.current) {
      return;
    }

    dateJumpFocusRestoreRef.current.focus();
    dateJumpFocusRestoreRef.current = null;
  }, [dateJumpLoading]);

  const detail = useTransactionDetail({
    lookupsLoaded: Boolean(lookups.snapshot),
    onNotice: showNotice,
    params,
    searchParams,
    setSearchParams,
    transactions,
  });
  const { closeTransactionDetail, selectedTransactionId } = detail;

  useEffect(() => {
    setTransactionEditModeAvailable(true);
    return () => {
      setTransactionEditModeAvailable(false);
    };
  }, []);

  useLayoutEffect(() => {
    const locationChanged = previousLocationKeyRef.current !== location.key;
    const historyNavigation =
      locationChanged && navigationType === NavigationType.Pop;
    historyNavigationRef.current = historyNavigation;
    previousLocationKeyRef.current = location.key;
    const editModeDetailClose =
      locationChanged && editModeDetailClosePendingRef.current;
    if (locationChanged) {
      editModeDetailClosePendingRef.current = false;
    }
    if (
      locationChanged &&
      navigationType !== NavigationType.Push &&
      editMode &&
      !editModeDetailClose
    ) {
      setTransactionEditModeEnabled(false);
    }
  }, [editMode, location.key, navigationType]);

  useEffect(() => {
    if (editMode) {
      cancelDateJump();
    }
    if (editMode && selectedTransactionId && !historyNavigationRef.current) {
      editModeDetailClosePendingRef.current = true;
      closeTransactionDetail();
    }
    const frame = window.requestAnimationFrame(() => {
      setSelectedTransactionsById(new Map());
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [editMode, cancelDateJump, closeTransactionDetail, selectedTransactionId]);

  const selectableTransactions = useMemo(
    () =>
      (transactions ?? []).filter(
        (transaction) => transaction.lifecycle_status === "active",
      ),
    [transactions],
  );

  const toggleTransactionSelection = useCallback(
    (transactionId: number) => {
      setSelectedTransactionsById((current) => {
        const next = new Map(current);
        if (next.has(transactionId)) {
          next.delete(transactionId);
        } else {
          const transaction = transactions?.find(
            (candidate) => candidate.transaction_id === transactionId,
          );
          if (transaction) {
            next.set(transactionId, transaction);
          }
        }
        return next;
      });
    },
    [transactions],
  );

  const selectPageTransactions = useCallback(() => {
    setSelectedTransactionsById(
      new Map(
        selectableTransactions.map((transaction) => [
          transaction.transaction_id,
          transaction,
        ]),
      ),
    );
  }, [selectableTransactions]);

  const selectTransactionRange = useCallback(
    (transactionIds: readonly number[]) => {
      setSelectedTransactionsById(() => {
        const next = new Map<number, Transaction>();
        for (const transactionId of transactionIds) {
          const transaction = transactions?.find(
            (candidate) => candidate.transaction_id === transactionId,
          );
          if (transaction) {
            next.set(transactionId, transaction);
          }
        }
        return next;
      });
    },
    [transactions],
  );

  const togglePageTransactionSelection = useCallback(() => {
    setSelectedTransactionsById((current) =>
      selectableTransactions.length > 0 &&
      selectableTransactions.every((transaction) =>
        current.has(transaction.transaction_id),
      )
        ? new Map()
        : new Map(
            selectableTransactions.map((transaction) => [
              transaction.transaction_id,
              transaction,
            ]),
          ),
    );
  }, [selectableTransactions]);

  const deleteTransactionFromRow = useCallback(
    async (transaction: Transaction) => {
      const result = await deleteTransactionById(transaction.transaction_id);
      if (result.error) {
        throw new Error(apiErrorMessage(result.error));
      }

      if (detail.selectedTransactionId === transaction.transaction_id) {
        detail.closeTransactionDetail();
      }
      await refreshTransactionPageAfterSave(
        displayedPageParams,
        transaction.transaction_id,
        transaction,
        undefined,
        { pageRefreshMode: "blocking" },
      );
      showNotice("Transaction deleted.");
    },
    [detail, displayedPageParams, showNotice],
  );

  const changeTransactionLifecycle = useCallback(
    async (transaction: Transaction, action: "cancel" | "restore") => {
      const result =
        action === "cancel"
          ? await cancelTransactionById(transaction.transaction_id)
          : await restoreTransactionById(transaction.transaction_id);
      if (!result.data) {
        throw new Error(apiErrorMessage(result.error));
      }
      await refreshTransactionPageAfterSave(
        displayedPageParams,
        transaction.transaction_id,
        result.data,
        transaction,
        { pageRefreshMode: "blocking" },
      );
      await detail.refreshSelectedTransactionDetail(
        transaction.transaction_id,
        result.data,
      );
      showNotice(
        action === "cancel"
          ? "Transaction cancelled."
          : "Transaction restored.",
      );
    },
    [detail, displayedPageParams, showNotice],
  );

  const postTransaction = useCallback(
    async (transaction: Transaction, postedDate?: string) => {
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
      await refreshTransactionPageAfterSave(
        displayedPageParams,
        transaction.transaction_id,
        transaction,
        transaction,
        { pageRefreshMode: "blocking" },
      );
      await detail.refreshSelectedTransactionDetail(transaction.transaction_id);
      showNotice("Transaction posted.");
    },
    [detail, displayedPageParams, showNotice],
  );

  const confirmRecurringOccurrenceFromRow = useCallback(
    async (transaction: Transaction) => {
      if (transaction.recurring_occurrence_id === null) {
        throw new Error("This transaction is not a recurring occurrence.");
      }

      const result = await confirmRecurringOccurrenceById({
        recurring_occurrence_id: transaction.recurring_occurrence_id,
      });
      if (result.error) {
        throw new Error(
          apiErrorMessage(result.error, "Occurrence could not be confirmed."),
        );
      }

      await refreshTransactionPageAfterSave(
        displayedPageParams,
        transaction.transaction_id,
        transaction,
        undefined,
        { pageRefreshMode: "blocking" },
      );
      await detail.refreshSelectedTransactionDetail(transaction.transaction_id);
      showNotice("Occurrence confirmed.");
    },
    [detail, displayedPageParams, showNotice],
  );

  const dismissRecurringOccurrenceFromRow = useCallback(
    async (transaction: Transaction) => {
      if (transaction.recurring_occurrence_id === null) {
        throw new Error("This transaction is not a recurring occurrence.");
      }

      const result = await dismissRecurringOccurrenceById({
        recurring_occurrence_id: transaction.recurring_occurrence_id,
      });
      if (result.error) {
        throw new Error(
          apiErrorMessage(result.error, "Occurrence could not be dismissed."),
        );
      }

      if (detail.selectedTransactionId === transaction.transaction_id) {
        detail.closeTransactionDetail();
      }
      await refreshTransactionPageAfterSave(
        displayedPageParams,
        transaction.transaction_id,
        transaction,
        undefined,
        { pageRefreshMode: "blocking" },
      );
      showNotice("Occurrence dismissed.");
    },
    [detail, displayedPageParams, showNotice],
  );

  const updateTransactionAmount = useCallback(
    async (
      transaction: Transaction,
      amount: string,
      onPageRefresh?: AmountSavePageRefresh,
    ) => {
      const result = await replaceLedgerTransaction(
        transaction.transaction_id,
        transactionAmountUpdateBody(transaction, amount),
      );
      if (!result.data) {
        throw new Error(apiErrorMessage(result.error));
      }

      updateSelectedTransactionSnapshot(result.data);
      const rowRemainsVisible = await refreshTransactionPageAfterSave(
        displayedPageParams,
        transaction.transaction_id,
        result.data,
        transaction,
        {
          onPageRefresh: (visible) => {
            if (!visible) {
              removeSelectedTransaction(transaction.transaction_id);
            }
            onPageRefresh?.(visible);
          },
        },
      );
      if (!rowRemainsVisible) {
        removeSelectedTransaction(transaction.transaction_id);
      }
      await detail.refreshSelectedTransactionDetail(
        transaction.transaction_id,
        result.data,
      );
      return rowRemainsVisible;
    },
    [
      detail,
      displayedPageParams,
      removeSelectedTransaction,
      updateSelectedTransactionSnapshot,
    ],
  );

  const updateTransactionsEditReferences = useCallback(
    async (transactions: readonly Transaction[], update: EditDockUpdate) => {
      const accountsById = new Map(
        (lookups.snapshot?.accounts ?? []).map((account) => [
          account.account_id,
          account,
        ]),
      );
      const skipSummary = summarizeEditModeSkips(
        transactions,
        update.kind,
        accountsById,
      );
      const qualifyingTransactions = transactions.filter(
        (transaction) =>
          !predictEditMode(transaction, update.kind, accountsById).skip,
      );
      const recordIds = qualifyingTransactions.flatMap((transaction) =>
        (update.kind === "category"
          ? editModeCategoryTargetRecords(transaction, accountsById)
          : activeEditModeRecords(transaction)
        ).map((record) => record.record_id),
      );

      if (recordIds.length > 0) {
        const result =
          update.kind === "category"
            ? await updateJournalRecordsCategory(recordIds, update.categoryId)
            : update.kind === "tags"
              ? await updateJournalRecordsTagsOperation(
                  recordIds,
                  update.operation,
                  update.tagIds,
                )
              : await updateJournalRecordsMember(recordIds, update.memberId);
        if (result.error) {
          throw new Error(apiErrorMessage(result.error));
        }
      }

      let noLongerVisibleCount = 0;
      if (qualifyingTransactions.length > 0) {
        const visibleTransactions =
          await refreshTransactionPageAfterEditModeSave(
            displayedPageParams,
            qualifyingTransactions,
          );
        const visibleIds = new Set(
          visibleTransactions.map((transaction) => transaction.transaction_id),
        );
        noLongerVisibleCount = qualifyingTransactions.filter(
          (transaction) => !visibleIds.has(transaction.transaction_id),
        ).length;
        const updatedById = new Map(
          visibleTransactions.map((transaction) => [
            transaction.transaction_id,
            transaction,
          ]),
        );
        setSelectedTransactionsById(
          (current) =>
            new Map(
              Array.from(current).flatMap(([transactionId, transaction]) => {
                if (!visibleIds.has(transactionId)) {
                  return [];
                }
                return [
                  [
                    transactionId,
                    updatedById.get(transactionId) ?? transaction,
                  ],
                ];
              }),
            ),
        );
      }

      showNotice(
        `${qualifyingTransactions.length} updated · ${skipSummary.count} require full edit${
          skipSummary.count > 0
            ? `: ${formatEditModeSkipReasons(skipSummary)}`
            : ""
        }${noLongerVisibleCount > 0 ? ` · ${noLongerVisibleCount} no longer match this view` : ""}`,
        qualifyingTransactions.length === 0 && skipSummary.count > 0
          ? "warning"
          : "success",
      );
    },
    [displayedPageParams, lookups.snapshot?.accounts, showNotice],
  );

  const updateTransactionsEditRecordState = useCallback(
    async (
      selected: readonly Transaction[],
      update:
        | {
            readonly kind: "reconciliation";
            readonly value: "reconciled" | "unreconciled";
          }
        | { readonly kind: "settlement"; readonly value: "pending" | "posted" },
    ) => {
      const accountsById = new Map(
        lookups.snapshot?.accounts.map((account) => [
          account.account_id,
          account,
        ]),
      );
      const recordIds = selected.flatMap((transaction) =>
        transaction.records
          .filter((record) => {
            if (update.kind === "reconciliation") {
              return true;
            }
            const accountType = accountsById.get(
              record.account_id,
            )?.account_type;
            return accountType === "owned" || accountType === "party";
          })
          .map((record) => record.record_id),
      );
      if (recordIds.length === 0) {
        throw new Error("The selection has no applicable records.");
      }
      const result =
        update.kind === "settlement"
          ? await updateJournalRecordsSettlement(recordIds, update.value)
          : await updateJournalRecordsReconciliation(recordIds, update.value);
      if (result.error) {
        throw new Error(apiErrorMessage(result.error));
      }

      const updatedTransactions = await Promise.all(
        selected.map(async (transaction) => {
          const refreshed = await fetchTransactionById(
            transaction.transaction_id,
          );
          if (!refreshed.data) {
            throw new Error(apiErrorMessage(refreshed.error));
          }
          return refreshed.data;
        }),
      );
      await refreshTransactionPageAfterEditModeSave(
        displayedPageParams,
        updatedTransactions,
      );
      setSelectedTransactionsById((current) => {
        const next = new Map(current);
        for (const transaction of updatedTransactions) {
          if (next.has(transaction.transaction_id)) {
            next.set(transaction.transaction_id, transaction);
          }
        }
        return next;
      });
      showNotice(
        `${recordIds.length} record${recordIds.length === 1 ? "" : "s"} updated.`,
      );
    },
    [displayedPageParams, lookups.snapshot?.accounts, showNotice],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      cancelDateJump();
      clearTransactionSelection();
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("page", String(nextPage));
        next.set("pageSize", String(pageSize));
        return next;
      });
    },
    [cancelDateJump, clearTransactionSelection, pageSize, setSearchParams],
  );

  const setPageSize = useCallback(
    (nextPageSize: number) => {
      cancelDateJump();
      clearTransactionSelection();
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("page", String(defaultTransactionPage));
        next.set("pageSize", String(nextPageSize));
        return next;
      });
    },
    [cancelDateJump, clearTransactionSelection, setSearchParams],
  );

  const jumpToPreviousDate = useCallback(
    (trigger: HTMLButtonElement) => {
      dateJumpFocusRestoreRef.current = trigger;
      jumpToAdjacentDate(-1);
    },
    [jumpToAdjacentDate],
  );

  const jumpToNextDate = useCallback(
    (trigger: HTMLButtonElement) => {
      dateJumpFocusRestoreRef.current = trigger;
      jumpToAdjacentDate(1);
    },
    [jumpToAdjacentDate],
  );

  const jumpToCurrentDate = useCallback(
    (trigger: HTMLButtonElement) => {
      dateJumpFocusRestoreRef.current = trigger;
      jumpToToday();
    },
    [jumpToToday],
  );

  const changeDateJumpValue = useCallback(
    (value: string) => {
      setDateJumpValue(value);
      void jumpToDate(value);
    },
    [jumpToDate, setDateJumpValue],
  );

  return {
    editMode,
    cancelDateJump,
    changeDateJumpValue,
    changeTransactionLifecycle,
    clearTransactionSelection,
    confirmRecurringOccurrenceFromRow,
    dateJumpAnchor,
    dateJumpLoading,
    dateJumpValue,
    deleteTransactionFromRow,
    dismissRecurringOccurrenceFromRow,
    detail,
    dismissNotice,
    errorMessage,
    jumpToNextDate,
    jumpToCurrentDate,
    jumpToPreviousDate,
    loading,
    lookups,
    notice,
    page,
    pageSize,
    params,
    pendingAmountSave,
    postTransaction,
    refreshErrorMessage,
    selectPageTransactions,
    selectTransactionRange,
    selectedTransactionIds,
    selectedTransactions,
    selectableTransactionCount: selectableTransactions.length,
    setPage,
    setPageSize,
    setEditMode: setTransactionEditModeEnabled,
    showNotice,
    totalCount,
    togglePageTransactionSelection,
    toggleTransactionSelection,
    updateSelectedTransactionSnapshot,
    transactions,
    updateTransactionAmount,
    updateTransactionsEditReferences,
    updateTransactionsEditRecordState,
  };
};
