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
  deferRecurringDefinition,
  deleteTransactionById,
  dismissRecurringOccurrenceById,
  fetchTransactionById,
  getRecurringDefinition,
  type RecurringDefinition,
  type RecurringDefinitionDeferRequest,
  replaceLedgerTransaction,
  replaceTransactionAccount,
  restoreTransactionById,
  type Transaction,
  type TransactionPageParams,
  updateJournalRecordsCategory,
  updateJournalRecordsMember,
  updateJournalRecordsReconciliation,
  updateJournalRecordsSettlement,
  updateJournalRecordsTagsOperation,
} from "@/api";
import {
  invalidateRecurringDefinitionMutationCaches,
  refreshMountedRecurringDefinitions,
} from "@/features/recurring";
import type { TransactionFilters } from "@/models/transaction-filters";
import type {
  TransactionSort,
  TransactionSortDirection,
} from "@/models/transaction-sorting";
import {
  invalidateTransactionPages,
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
  TransactionAmountConflictError,
  transactionAmountUpdateBody,
} from "./transaction-amount-update";
import type { EditDockUpdate } from "./transaction-edit-dock";
import {
  defaultTransactionPage,
  readLiveSearchParams,
  readTransactionAnchorDateFromSearchParams,
  readTransactionPageFromSearchParams,
  transactionOffsetFromPage,
} from "./transaction-page-position";
import { useTransactionDateJump } from "./use-transaction-date-jump";
import { useTransactionDetail } from "./use-transaction-detail";
import {
  invalidateAccountRegistersForTransaction,
  publishTransactionConflictWinner,
  refreshTransactionPageAfterEditModeSave,
  refreshTransactionPageAfterSave,
  refreshTransactionPagePreservingSnapshot,
  useTransactionsResource,
} from "./use-transactions-resource";

interface Notice {
  readonly id: number;
  readonly kind: "success" | "warning";
  readonly message: string;
}

export type TransactionAmountDisplayMode = "native" | "usd";

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
  const [amountDisplayMode, setAmountDisplayMode] =
    useState<TransactionAmountDisplayMode>("native");
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
  const { page, pageSize, sort, sortDirection } =
    readTransactionPageFromSearchParams(searchParams);
  const anchorDate = readTransactionAnchorDateFromSearchParams(searchParams);
  const unanchoredParams: TransactionPageParams = useMemo(
    () => ({
      filters,
      limit: pageSize,
      offset: transactionOffsetFromPage(page, pageSize),
      sort,
      sortDirection,
    }),
    [filters, page, pageSize, sort, sortDirection],
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
    anchorDate,
    page,
    pageSize,
    params: unanchoredParams,
    readFiltersFromSearchParams,
    setSearchParams,
  });
  const dateJumpEnabled = sort === "initiated_date" && sortDirection === "desc";
  useEffect(() => {
    if (!dateJumpEnabled) {
      cancelDateJump();
    }
  }, [cancelDateJump, dateJumpEnabled]);
  const params: TransactionPageParams = useMemo(
    () => ({
      ...unanchoredParams,
      anchorDate,
    }),
    [anchorDate, unanchoredParams],
  );
  const {
    lookups,
    page: pageResource,
    retryPage,
  } = useTransactionsResource(params);
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
  useLayoutEffect(() => {
    if (!transactions) {
      return;
    }
    const refreshedById = new Map(
      transactions.map((transaction) => [
        transaction.transaction_id,
        transaction,
      ]),
    );
    const frame = window.requestAnimationFrame(() => {
      setSelectedTransactionsById((current) => {
        const refreshed = new Map<number, Transaction>();
        let changed = false;
        for (const [transactionId, transaction] of current) {
          const next = refreshedById.get(transactionId);
          if (!next) {
            changed = true;
            continue;
          }
          refreshed.set(transactionId, next);
          changed = changed || next !== transaction;
        }
        return changed ? refreshed : current;
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [transactions]);
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

  const toggleAmountDisplayMode = () => {
    setAmountDisplayMode((current) =>
      current === "native" ? "usd" : "native",
    );
  };

  useEffect(() => {
    if (dateJumpLoading || !dateJumpFocusRestoreRef.current) {
      return;
    }

    dateJumpFocusRestoreRef.current.focus();
    dateJumpFocusRestoreRef.current = null;
  }, [dateJumpLoading]);

  const detail = useTransactionDetail({
    lookupsLoaded: Boolean(lookups.snapshot || lookups.errorMessage),
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
        detail.closeTransactionDetail({ suppressFetch: true });
      }
      await refreshTransactionPageAfterSave(
        displayedPageParams,
        transaction.transaction_id,
        transaction,
        [],
        { pageRefreshMode: "blocking" },
      );
      showNotice("Transaction deleted.");
    },
    [detail, displayedPageParams, showNotice],
  );

  const deleteSelectedTransaction = useCallback(
    async (transaction: Transaction) => {
      const result = await deleteTransactionById(transaction.transaction_id);
      if (result.error) {
        throw new Error(apiErrorMessage(result.error));
      }

      invalidateAccountRegistersForTransaction(transaction);
      detail.closeTransactionDetail({ suppressFetch: true });
      showNotice("Transaction deleted.");
      await refreshTransactionPageAfterSave(
        params,
        transaction.transaction_id,
        undefined,
        [transaction],
        { pageRefreshMode: "blocking" },
      );
    },
    [detail, params, showNotice],
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
        [transaction],
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
        [transaction],
        { pageRefreshMode: "blocking" },
      );
      await detail.refreshSelectedTransactionDetail(transaction.transaction_id);
      showNotice("Transaction posted.");
    },
    [detail, displayedPageParams, showNotice],
  );

  const confirmRecurringOccurrenceFromRow = useCallback(
    async (transaction: Transaction, actualDate: string) => {
      if (transaction.recurring_occurrence_id === null) {
        throw new Error("This transaction is not a recurring occurrence.");
      }

      const result = await confirmRecurringOccurrenceById({
        actual_date: actualDate,
        recurring_occurrence_id: transaction.recurring_occurrence_id,
      });
      if (result.error) {
        throw new Error(
          apiErrorMessage(result.error, "Occurrence could not be confirmed."),
        );
      }

      try {
        await refreshTransactionPageAfterSave(
          displayedPageParams,
          transaction.transaction_id,
          transaction,
          [],
          { pageRefreshMode: "blocking-preserving" },
        );
      } catch {
        invalidateTransactionPages();
        showNotice(
          "Occurrence confirmed, but transactions could not be refreshed.",
          "warning",
        );
        return;
      }
      await detail.refreshSelectedTransactionDetail(transaction.transaction_id);
      showNotice("Occurrence confirmed.");
    },
    [detail, displayedPageParams, showNotice],
  );

  const loadRecurringDefinitionForProjection = useCallback(
    async (transaction: Transaction): Promise<RecurringDefinition> => {
      const definitionId = transaction.recurring_projection_definition_id;
      if (definitionId == null) {
        throw new Error("This transaction is not a recurring projection.");
      }
      const result = await getRecurringDefinition({
        path: { recurring_definition_id: definitionId },
      });
      if (!result.data) {
        throw new Error(
          apiErrorMessage(
            result.error,
            "Recurring definition could not be loaded.",
          ),
        );
      }
      return result.data;
    },
    [],
  );

  const deferRecurringProjection = useCallback(
    async (
      transaction: Transaction,
      request: RecurringDefinitionDeferRequest,
    ) => {
      const definitionId = transaction.recurring_projection_definition_id;
      if (
        definitionId == null ||
        transaction.recurring_projection_is_next !== true
      ) {
        throw new Error(
          "This transaction is not the next recurring projection.",
        );
      }
      const result = await deferRecurringDefinition({
        body: request,
        path: { recurring_definition_id: definitionId },
      });
      if (!result.data) {
        throw new Error(
          apiErrorMessage(result.error, "Projection could not be deferred."),
        );
      }

      invalidateRecurringDefinitionMutationCaches();
      let refreshedTransactions: readonly Transaction[];
      try {
        [, refreshedTransactions] = await Promise.all([
          refreshMountedRecurringDefinitions(),
          refreshTransactionPagePreservingSnapshot(displayedPageParams),
        ]);
      } catch {
        invalidateTransactionPages();
        detail.refreshSelectedProjectedTransactionDetail(
          transaction.transaction_id,
          definitionId,
          [],
        );
        showNotice(
          "Next occurrence deferred, but transactions could not be refreshed.",
          "warning",
        );
        return;
      }
      detail.refreshSelectedProjectedTransactionDetail(
        transaction.transaction_id,
        definitionId,
        refreshedTransactions,
      );
      showNotice("Next occurrence deferred.");
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
        [],
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
        transaction.etag,
        transactionAmountUpdateBody(transaction, amount),
      );
      if (!result.data) {
        if (result.response?.status === 412) {
          const refreshed = await fetchTransactionById(
            transaction.transaction_id,
          );
          if (refreshed.data) {
            const published = publishTransactionConflictWinner(
              displayedPageParams,
              refreshed.data,
              transaction,
            );
            if (published) {
              updateSelectedTransactionSnapshot(refreshed.data);
              await detail.refreshSelectedTransactionDetail(
                transaction.transaction_id,
                refreshed.data,
              );
            }
            throw new TransactionAmountConflictError(
              "This transaction changed elsewhere. The latest version is shown; review the amount and save again.",
            );
          }
          throw new TransactionAmountConflictError(
            `This transaction changed elsewhere, but the latest version could not be loaded. Your amount is preserved; refresh and try again. ${apiErrorMessage(refreshed.error)}`,
          );
        }
        throw new Error(apiErrorMessage(result.error));
      }

      updateSelectedTransactionSnapshot(result.data);
      const rowRemainsVisible = await refreshTransactionPageAfterSave(
        displayedPageParams,
        transaction.transaction_id,
        result.data,
        [transaction],
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

  const discardTransactionAmountConflict = useCallback(
    async (transaction: Transaction, onPageRefresh?: AmountSavePageRefresh) => {
      await refreshTransactionPageAfterSave(
        displayedPageParams,
        transaction.transaction_id,
        transaction,
        [],
        {
          onPageRefresh: (rowRemainsVisible) => {
            if (!rowRemainsVisible) {
              removeSelectedTransaction(transaction.transaction_id);
            }
            onPageRefresh?.(rowRemainsVisible);
          },
        },
      );
    },
    [displayedPageParams, removeSelectedTransaction],
  );

  const updateTransactionsEditReferences = useCallback(
    async (transactions: readonly Transaction[], update: EditDockUpdate) => {
      if (update.kind === "account") {
        const result = await replaceTransactionAccount(
          transactions.map((transaction) => transaction.transaction_id),
          update.sourceAccountId,
          update.replacementAccountId,
        );
        if (!result.data) {
          throw new Error(apiErrorMessage(result.error));
        }

        const pageRefresh = await refreshTransactionPageAfterEditModeSave(
          displayedPageParams,
          transactions,
          [update.replacementAccountId],
        );
        if (!pageRefresh.refreshed) {
          const replacedTransactionIds = new Set(
            transactions.map((transaction) => transaction.transaction_id),
          );
          setSelectedTransactionsById(
            (current) =>
              new Map(
                Array.from(current).filter(
                  ([transactionId]) =>
                    !replacedTransactionIds.has(transactionId),
                ),
              ),
          );
          showNotice(
            `${result.data.updated_transaction_count} transaction${result.data.updated_transaction_count === 1 ? "" : "s"} updated · ${result.data.updated_record_count} record${result.data.updated_record_count === 1 ? "" : "s"} replaced`,
          );
          return;
        }
        const visibleTransactions = pageRefresh.transactions ?? [];
        const visibleIds = new Set(
          visibleTransactions.map((transaction) => transaction.transaction_id),
        );
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
        const noLongerVisibleCount = transactions.filter(
          (transaction) => !visibleIds.has(transaction.transaction_id),
        ).length;
        showNotice(
          `${result.data.updated_transaction_count} transaction${result.data.updated_transaction_count === 1 ? "" : "s"} updated · ${result.data.updated_record_count} record${result.data.updated_record_count === 1 ? "" : "s"} replaced${noLongerVisibleCount > 0 ? ` · ${noLongerVisibleCount} no longer match this view` : ""}`,
        );
        return;
      }

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
        const pageRefresh = await refreshTransactionPageAfterEditModeSave(
          displayedPageParams,
          qualifyingTransactions,
        );
        const visibleTransactions = pageRefresh.transactions ?? [];
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
      const pageRefresh = await refreshTransactionPageAfterEditModeSave(
        displayedPageParams,
        updatedTransactions,
      );
      const visibleTransactions = pageRefresh.transactions ?? [];
      const visibleIds = new Set(
        visibleTransactions.map((transaction) => transaction.transaction_id),
      );
      const updatedById = new Map(
        visibleTransactions.map((transaction) => [
          transaction.transaction_id,
          transaction,
        ]),
      );
      setSelectedTransactionsById((current) => {
        return new Map(
          Array.from(current).flatMap(([transactionId, transaction]) => {
            if (!visibleIds.has(transactionId)) {
              return [];
            }
            return [
              [transactionId, updatedById.get(transactionId) ?? transaction],
            ];
          }),
        );
      });
      showNotice(
        `${recordIds.length} record${recordIds.length === 1 ? "" : "s"} updated.`,
      );
    },
    [displayedPageParams, lookups.snapshot?.accounts, showNotice],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      clearTransactionSelection();
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("page", String(nextPage));
        next.set("pageSize", String(pageSize));
        return next;
      });
    },
    [clearTransactionSelection, pageSize, setSearchParams],
  );

  const setPageSize = useCallback(
    (nextPageSize: number) => {
      cancelDateJump();
      clearTransactionSelection();
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete("anchor_date");
        next.set("page", String(defaultTransactionPage));
        next.set("pageSize", String(nextPageSize));
        return next;
      });
    },
    [cancelDateJump, clearTransactionSelection, setSearchParams],
  );

  const setSort = useCallback(
    (nextSort: TransactionSort) => {
      if (nextSort === sort) {
        return;
      }
      cancelDateJump();
      clearTransactionSelection();
      const current = readLiveSearchParams();
      const next = new URLSearchParams(current);
      next.delete("anchor_date");
      next.set("page", String(defaultTransactionPage));
      next.set("sort", nextSort);
      next.set("sortDir", sortDirection);
      if (current.has("transaction")) {
        const background = new URLSearchParams(next);
        background.delete("transaction");
        setSearchParams(background, { replace: true });
      }
      setSearchParams(next);
    },
    [
      cancelDateJump,
      clearTransactionSelection,
      setSearchParams,
      sort,
      sortDirection,
    ],
  );

  const setSortDirection = useCallback(
    (nextSortDirection: TransactionSortDirection) => {
      if (nextSortDirection === sortDirection) {
        return;
      }
      cancelDateJump();
      clearTransactionSelection();
      const current = readLiveSearchParams();
      const next = new URLSearchParams(current);
      next.delete("anchor_date");
      next.set("page", String(defaultTransactionPage));
      next.set("sort", sort);
      next.set("sortDir", nextSortDirection);
      if (current.has("transaction")) {
        const background = new URLSearchParams(next);
        background.delete("transaction");
        setSearchParams(background, { replace: true });
      }
      setSearchParams(next);
    },
    [
      cancelDateJump,
      clearTransactionSelection,
      setSearchParams,
      sort,
      sortDirection,
    ],
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
    amountDisplayMode,
    editMode,
    cancelDateJump,
    changeDateJumpValue,
    changeTransactionLifecycle,
    clearTransactionSelection,
    confirmRecurringOccurrenceFromRow,
    deferRecurringProjection,
    dateJumpAnchor,
    dateJumpEnabled,
    dateJumpLoading,
    dateJumpValue,
    deleteSelectedTransaction,
    deleteTransactionFromRow,
    dismissRecurringOccurrenceFromRow,
    loadRecurringDefinitionForProjection,
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
    retryPageLoad: !lookups.errorMessage ? retryPage : undefined,
    pageStale: pageResource.stale,
    selectPageTransactions,
    selectTransactionRange,
    selectedTransactionIds,
    selectedTransactions,
    selectableTransactionCount: selectableTransactions.length,
    setPage,
    setPageSize,
    setSort,
    setSortDirection,
    setEditMode: setTransactionEditModeEnabled,
    showNotice,
    sort,
    sortDirection,
    totalCount,
    toggleAmountDisplayMode,
    togglePageTransactionSelection,
    toggleTransactionSelection,
    updateSelectedTransactionSnapshot,
    transactions,
    discardTransactionAmountConflict,
    updateTransactionAmount,
    updateTransactionsEditReferences,
    updateTransactionsEditRecordState,
  };
};
