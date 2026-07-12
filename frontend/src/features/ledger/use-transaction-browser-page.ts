import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SetURLSearchParams } from "react-router";

import {
  apiErrorMessage,
  confirmRecurringOccurrenceById,
  deleteTransactionById,
  dismissRecurringOccurrenceById,
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

import { type RecordUpdate, recordUpdateBody } from "./record-editing";
import {
  defaultTransactionPage,
  readTransactionPageFromSearchParams,
  transactionOffsetFromPage,
} from "./transaction-page-position";
import { useTransactionDateJump } from "./use-transaction-date-jump";
import { useTransactionDetail } from "./use-transaction-detail";
import {
  refreshTransactionPageAfterSave,
  useTransactionsResource,
} from "./use-transactions-resource";

interface Notice {
  readonly id: number;
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
  const [notice, setNotice] = useState<Notice | undefined>();
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
  const transactions = displayedSnapshot?.transactions;
  const totalCount = displayedSnapshot?.totalCount;
  const loading =
    pageResource.loading ||
    dateJumpLoading ||
    lookups.loading ||
    (Boolean(transactions) && !lookups.snapshot);
  const errorMessage = pageResource.errorMessage ?? lookups.errorMessage;

  const showNotice = useCallback((message: string) => {
    setNotice((current) => ({
      id: (current?.id ?? 0) + 1,
      message,
    }));
  }, []);

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
        params,
        transaction.transaction_id,
        transaction,
      );
      showNotice("Transaction deleted.");
    },
    [detail, params, showNotice],
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
        params,
        transaction.transaction_id,
        transaction,
      );
      showNotice("Occurrence confirmed.");
    },
    [params, showNotice],
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
        params,
        transaction.transaction_id,
        transaction,
      );
      showNotice("Occurrence dismissed.");
    },
    [detail, params, showNotice],
  );

  const updateRecord = useCallback(
    async (
      transaction: Transaction,
      record: JournalRecord,
      update: RecordUpdate,
    ) => {
      if (update.kind === "category") {
        const result = await updateJournalRecordCategory(
          record.record_id,
          update.categoryId,
        );
        if (result.error) {
          throw new Error(apiErrorMessage(result.error));
        }
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
      } else if (update.kind === "postingStatus") {
        const result = await updateJournalRecordPostingStatus(
          record.record_id,
          update.postingStatus,
        );
        if (result.error) {
          throw new Error(apiErrorMessage(result.error));
        }
      } else {
        const result = await replaceLedgerTransaction(
          transaction.transaction_id,
          recordUpdateBody(transaction, [record.record_id], update),
        );
        if (!result.data) {
          throw new Error(apiErrorMessage(result.error));
        }
        await refreshTransactionPageAfterSave(
          params,
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
        params,
        transaction.transaction_id,
        transaction,
      );
      await detail.refreshSelectedTransactionDetail(transaction.transaction_id);
    },
    [detail, params],
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

      if (update.kind === "category") {
        const result = await updateJournalRecordsCategory(
          recordIds,
          update.categoryId,
        );
        if (result.error) {
          throw new Error(apiErrorMessage(result.error));
        }
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
      } else {
        const result = await replaceLedgerTransaction(
          transaction.transaction_id,
          recordUpdateBody(transaction, recordIds, update),
        );
        if (!result.data) {
          throw new Error(apiErrorMessage(result.error));
        }
        const rowRemainsVisible = await refreshTransactionPageAfterSave(
          params,
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
        params,
        transaction.transaction_id,
        transaction,
      );
      await detail.refreshSelectedTransactionDetail(transaction.transaction_id);
      return rowRemainsVisible;
    },
    [detail, params],
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
        params,
        transaction.transaction_id,
        result.data,
        transaction,
      );
      await detail.refreshSelectedTransactionDetail(
        transaction.transaction_id,
        result.data,
      );
    },
    [detail, params],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      cancelDateJump();
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("page", String(nextPage));
        next.set("pageSize", String(pageSize));
        return next;
      });
    },
    [cancelDateJump, pageSize, setSearchParams],
  );

  const setPageSize = useCallback(
    (nextPageSize: number) => {
      cancelDateJump();
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("page", String(defaultTransactionPage));
        next.set("pageSize", String(nextPageSize));
        return next;
      });
    },
    [cancelDateJump, setSearchParams],
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
    cancelDateJump,
    changeDateJumpValue,
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
    setPage,
    setPageSize,
    showNotice,
    totalCount,
    transactions,
    updateRecord,
    updateTransactionAmount,
    updateTransactionRecordReferences,
  };
};
