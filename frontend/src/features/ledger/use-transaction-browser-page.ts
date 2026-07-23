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
  confirmRecurringOccurrenceById,
  deleteTransactionById,
  dismissRecurringOccurrenceById,
  fetchTransactionById,
  type JournalRecord,
  replaceLedgerTransaction,
  type Transaction,
  type TransactionPageParams,
  updateJournalRecordCategory,
  updateJournalRecordPostingStatus,
  updateJournalRecordsCategory,
  updateJournalRecordsTags,
  updateJournalRecordTags,
} from "@/api";
import type { TransactionFilters } from "@/models/transaction-filters";
import {
  setTransactionBulkEditAvailable,
  setTransactionBulkEditEnabled,
  transactionPageKey,
  useTransactionBulkEditView,
} from "@/store";

import { activeTransactionRecords, linePostingStatus } from "./format";
import { useInlineEditCoordinator } from "./inline-editing";
import {
  type RecordUpdate,
  recordUpdateBody,
  transactionWithRecordUpdate,
} from "./record-editing";
import {
  defaultTransactionPage,
  readTransactionPageFromSearchParams,
  transactionOffsetFromPage,
} from "./transaction-page-position";
import { useTransactionDateJump } from "./use-transaction-date-jump";
import { useTransactionDetail } from "./use-transaction-detail";
import {
  refreshTransactionPageAfterBulkSave,
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

const sameTagIds = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length &&
  left.every((tagId, index) => tagId === right[index]);

const sortedTagIds = (tagIds: readonly number[]): readonly number[] =>
  [...tagIds].sort((left, right) => left - right);

const isUniformBulkField = (
  transaction: Transaction,
  field: "category" | "member" | "tags",
): boolean => {
  const records = activeTransactionRecords(transaction);
  if (records.length === 0) {
    return false;
  }

  if (field === "category") {
    return new Set(records.map((record) => record.category_id)).size === 1;
  }
  if (field === "member") {
    return (
      new Set(records.map((record) => record.member_id ?? null)).size === 1
    );
  }

  const firstTagIds = sortedTagIds(records[0]!.tag_ids);
  return records.every((record) =>
    sameTagIds(sortedTagIds(record.tag_ids), firstTagIds),
  );
};

export const useTransactionBrowserPage = ({
  filters,
  readFiltersFromSearchParams,
  searchParams,
  setSearchParams,
}: UseTransactionBrowserPageOptions) => {
  const inlineEdit = useInlineEditCoordinator();
  const { enabled: bulkEditMode } = useTransactionBulkEditView();
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousLocationKeyRef = useRef(location.key);
  const historyNavigationRef = useRef(false);
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
  const errorMessage = pageResource.errorMessage ?? lookups.errorMessage;

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
  const { discardActive: discardActiveInlineEdit } = inlineEdit;

  useEffect(() => {
    setTransactionBulkEditAvailable(true);
    return () => {
      setTransactionBulkEditAvailable(false);
    };
  }, []);

  useLayoutEffect(() => {
    const locationChanged = previousLocationKeyRef.current !== location.key;
    const historyNavigation =
      locationChanged && navigationType === NavigationType.Pop;
    historyNavigationRef.current = historyNavigation;
    previousLocationKeyRef.current = location.key;
    if (
      locationChanged &&
      navigationType !== NavigationType.Push &&
      bulkEditMode
    ) {
      setTransactionBulkEditEnabled(false);
    }
  }, [bulkEditMode, location.key, navigationType]);

  useEffect(() => {
    if (bulkEditMode) {
      cancelDateJump();
    }
    discardActiveInlineEdit();
    if (
      bulkEditMode &&
      selectedTransactionId &&
      !historyNavigationRef.current
    ) {
      closeTransactionDetail();
    }
    const frame = window.requestAnimationFrame(() => {
      setSelectedTransactionsById(new Map());
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    bulkEditMode,
    cancelDateJump,
    closeTransactionDetail,
    discardActiveInlineEdit,
    selectedTransactionId,
  ]);

  const selectableTransactions = useMemo(
    () =>
      (transactions ?? []).filter(
        (transaction) => linePostingStatus(transaction) !== "expected",
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

  const updateRecord = useCallback(
    async (
      transaction: Transaction,
      record: JournalRecord,
      update: RecordUpdate,
    ) => {
      let nextTransaction: Transaction;
      let nextDetailTransaction: Transaction | undefined;
      if (update.kind === "category") {
        const result = await updateJournalRecordCategory(
          record.record_id,
          update.categoryId,
        );
        if (result.error) {
          throw new Error(apiErrorMessage(result.error));
        }
        const refreshed = await fetchTransactionById(
          transaction.transaction_id,
        );
        if (!refreshed.data) {
          throw new Error(apiErrorMessage(refreshed.error));
        }
        nextTransaction = refreshed.data;
        nextDetailTransaction = refreshed.data;
      } else if (update.kind === "tags") {
        if (
          record.tag_ids.length === update.tagIds.length &&
          record.tag_ids.every((tagId) => update.tagIds.includes(tagId))
        ) {
          return;
        }
        const result = await updateJournalRecordTags(
          record.record_id,
          record.tag_ids,
          update.tagIds,
        );
        if (result.error) {
          throw new Error(apiErrorMessage(result.error));
        }
        nextTransaction = transactionWithRecordUpdate(
          transaction,
          [record.record_id],
          update,
        );
      } else if (update.kind === "postingStatus") {
        const result = await updateJournalRecordPostingStatus(
          record.record_id,
          update.postingStatus,
        );
        if (result.error) {
          throw new Error(apiErrorMessage(result.error));
        }
        nextTransaction = transactionWithRecordUpdate(
          transaction,
          [record.record_id],
          update,
        );
      } else {
        const result = await replaceLedgerTransaction(
          transaction.transaction_id,
          recordUpdateBody(transaction, [record.record_id], update),
        );
        if (!result.data) {
          throw new Error(apiErrorMessage(result.error));
        }
        await refreshTransactionPageAfterSave(
          displayedPageParams,
          transaction.transaction_id,
          result.data,
          transaction,
        );
        await detail.refreshSelectedTransactionDetail(
          transaction.transaction_id,
          result.data,
        );
        return;
      }

      await refreshTransactionPageAfterSave(
        displayedPageParams,
        transaction.transaction_id,
        nextTransaction,
        transaction,
      );
      await detail.refreshSelectedTransactionDetail(
        transaction.transaction_id,
        nextDetailTransaction,
      );
    },
    [detail, displayedPageParams],
  );

  const updateTransactionRecordReferences = useCallback(
    async (
      transaction: Transaction,
      records: readonly JournalRecord[],
      update: Extract<
        RecordUpdate,
        { readonly kind: "category" | "member" | "tags" }
      >,
    ) => {
      const recordIds = records.map((record) => record.record_id);
      if (recordIds.length === 0) {
        return true;
      }

      let nextTransaction: Transaction;
      let nextDetailTransaction: Transaction | undefined;
      if (update.kind === "category") {
        const result = await updateJournalRecordsCategory(
          recordIds,
          update.categoryId,
        );
        if (result.error) {
          throw new Error(apiErrorMessage(result.error));
        }
        const refreshed = await fetchTransactionById(
          transaction.transaction_id,
        );
        if (!refreshed.data) {
          throw new Error(apiErrorMessage(refreshed.error));
        }
        nextTransaction = refreshed.data;
        nextDetailTransaction = refreshed.data;
      } else if (update.kind === "tags") {
        const currentTagIds = records[0]?.tag_ids ?? [];
        if (
          currentTagIds.length === update.tagIds.length &&
          currentTagIds.every((tagId) => update.tagIds.includes(tagId))
        ) {
          return true;
        }
        const result = await updateJournalRecordsTags(
          recordIds,
          currentTagIds,
          update.tagIds,
        );
        if (result.error) {
          throw new Error(apiErrorMessage(result.error));
        }
        nextTransaction = transactionWithRecordUpdate(
          transaction,
          recordIds,
          update,
        );
      } else {
        const result = await replaceLedgerTransaction(
          transaction.transaction_id,
          recordUpdateBody(transaction, recordIds, update),
        );
        if (!result.data) {
          throw new Error(apiErrorMessage(result.error));
        }
        const rowRemainsVisible = await refreshTransactionPageAfterSave(
          displayedPageParams,
          transaction.transaction_id,
          result.data,
          transaction,
        );
        await detail.refreshSelectedTransactionDetail(
          transaction.transaction_id,
          result.data,
        );
        return rowRemainsVisible;
      }

      const rowRemainsVisible = await refreshTransactionPageAfterSave(
        displayedPageParams,
        transaction.transaction_id,
        nextTransaction,
        transaction,
      );
      await detail.refreshSelectedTransactionDetail(
        transaction.transaction_id,
        nextDetailTransaction,
      );
      return rowRemainsVisible;
    },
    [detail, displayedPageParams],
  );

  const updateTransactionAmount = useCallback(
    async (
      transaction: Transaction,
      records: readonly [JournalRecord, JournalRecord],
      amount: string,
    ) => {
      const result = await replaceLedgerTransaction(
        transaction.transaction_id,
        recordUpdateBody(
          transaction,
          records.map((record) => record.record_id),
          { amount, kind: "amount" },
        ),
      );
      if (!result.data) {
        throw new Error(apiErrorMessage(result.error));
      }

      await refreshTransactionPageAfterSave(
        displayedPageParams,
        transaction.transaction_id,
        result.data,
        transaction,
      );
      await detail.refreshSelectedTransactionDetail(
        transaction.transaction_id,
        result.data,
      );
    },
    [detail, displayedPageParams],
  );

  const updateTransactionsBulkReferences = useCallback(
    async (
      transactions: readonly Transaction[],
      update: Extract<
        RecordUpdate,
        { readonly kind: "category" | "member" | "tags" }
      >,
    ) => {
      const qualifyingTransactions = transactions.filter((transaction) =>
        isUniformBulkField(transaction, update.kind),
      );
      const skippedCount = transactions.length - qualifyingTransactions.length;
      const updatedTransactions: Transaction[] = [];

      if (update.kind === "category") {
        const recordIds = qualifyingTransactions.flatMap((transaction) =>
          activeTransactionRecords(transaction).map(
            (record) => record.record_id,
          ),
        );
        if (recordIds.length > 0) {
          const result = await updateJournalRecordsCategory(
            recordIds,
            update.categoryId,
          );
          if (result.error) {
            throw new Error(apiErrorMessage(result.error));
          }
          const categoryUpdatedTransactions = qualifyingTransactions.map(
            (transaction) => {
              const categorizedRecordIds = new Set(
                activeTransactionRecords(transaction).map(
                  (record) => record.record_id,
                ),
              );
              return {
                ...transaction,
                records: transaction.records.map((record) =>
                  categorizedRecordIds.has(record.record_id)
                    ? { ...record, category_id: update.categoryId }
                    : record,
                ),
              };
            },
          );
          updatedTransactions.push(...categoryUpdatedTransactions);
        }
      } else if (update.kind === "tags") {
        const groups = new Map<
          string,
          { readonly currentTagIds: readonly number[]; recordIds: number[] }
        >();
        for (const transaction of qualifyingTransactions) {
          const records = activeTransactionRecords(transaction);
          const currentTagIds = sortedTagIds(records[0]!.tag_ids);
          const key = currentTagIds.join(",");
          const group = groups.get(key) ?? {
            currentTagIds,
            recordIds: [],
          };
          group.recordIds.push(...records.map((record) => record.record_id));
          groups.set(key, group);
        }
        for (const group of groups.values()) {
          const nextTagIds = Array.from(
            new Set([...group.currentTagIds, ...update.tagIds]),
          );
          if (sameTagIds(group.currentTagIds, sortedTagIds(nextTagIds))) {
            continue;
          }
          const result = await updateJournalRecordsTags(
            group.recordIds,
            group.currentTagIds,
            nextTagIds,
          );
          if (result.error) {
            throw new Error(apiErrorMessage(result.error));
          }
        }
        for (const transaction of qualifyingTransactions) {
          const records = activeTransactionRecords(transaction);
          const currentTagIds = sortedTagIds(records[0]!.tag_ids);
          const nextTagIds = Array.from(
            new Set([...currentTagIds, ...update.tagIds]),
          );
          updatedTransactions.push(
            transactionWithRecordUpdate(
              transaction,
              records.map((record) => record.record_id),
              { kind: "tags", tagIds: nextTagIds },
            ),
          );
        }
      } else {
        updatedTransactions.push(
          ...(await Promise.all(
            qualifyingTransactions.map(async (transaction) => {
              const result = await replaceLedgerTransaction(
                transaction.transaction_id,
                recordUpdateBody(
                  transaction,
                  activeTransactionRecords(transaction).map(
                    (record) => record.record_id,
                  ),
                  update,
                ),
              );
              if (!result.data) {
                throw new Error(apiErrorMessage(result.error));
              }
              return result.data;
            }),
          )),
        );
      }

      if (qualifyingTransactions.length > 0) {
        setSelectedTransactionsById((current) => {
          const next = new Map(current);
          for (const transaction of updatedTransactions) {
            if (next.has(transaction.transaction_id)) {
              next.set(transaction.transaction_id, transaction);
            }
          }
          return next;
        });
        await refreshTransactionPageAfterBulkSave(
          displayedPageParams,
          qualifyingTransactions,
        );
      }

      showNotice(
        `${qualifyingTransactions.length} updated, ${skippedCount} skipped${
          skippedCount > 0 ? ": mixed records" : ""
        }.`,
        qualifyingTransactions.length === 0 && skippedCount > 0
          ? "warning"
          : "success",
      );
    },
    [displayedPageParams, showNotice],
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
    bulkEditMode,
    cancelDateJump,
    changeDateJumpValue,
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
    inlineEdit,
    loading,
    lookups,
    notice,
    page,
    pageSize,
    params,
    selectPageTransactions,
    selectTransactionRange,
    selectedTransactionIds,
    selectedTransactions,
    selectableTransactionCount: selectableTransactions.length,
    setPage,
    setPageSize,
    setBulkEditMode: setTransactionBulkEditEnabled,
    showNotice,
    totalCount,
    togglePageTransactionSelection,
    toggleTransactionSelection,
    updateSelectedTransactionSnapshot,
    transactions,
    updateRecord,
    updateTransactionAmount,
    updateTransactionsBulkReferences,
    updateTransactionRecordReferences,
  };
};
