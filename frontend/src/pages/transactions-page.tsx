import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router";

import type { Transaction } from "@/api";
import { PageHelp } from "@/components/page-help";
import { Toast, toastDurationMs } from "@/components/toast";
import { PageHeader } from "@/features/app-shell";
import {
  captureTransactionEntryLaunchContext,
  defaultTransactionPage,
  hasActiveTransactionFilterChips,
  readLiveSearchParams,
  readTransactionFiltersFromSearchParams,
  TransactionBrowser,
  TransactionBrowserToolbar,
  TransactionDetailPanel,
  TransactionFilterControls,
  useTransactionBrowserPage,
  writeTransactionFiltersToSearchParams,
} from "@/features/ledger";
import {
  emptyTransactionFilters,
  transactionClasses,
  type TransactionFilters,
} from "@/models/transaction-filters";
import {
  openTransactionEntryLaunch,
  openTransactionEntryPanel,
  setLastTransactionsPageSearch,
} from "@/store";

export const TransactionsPage = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(
    () => readTransactionFiltersFromSearchParams(searchParams),
    [searchParams],
  );
  const browser = useTransactionBrowserPage({
    filters,
    searchParams,
    setSearchParams,
  });

  useEffect(() => {
    setLastTransactionsPageSearch(location.search);
  }, [location.search]);

  const openEntryPanel = useCallback(() => {
    browser.setBulkEditMode(false);
    openTransactionEntryPanel(
      undefined,
      captureTransactionEntryLaunchContext(),
    );
    browser.dismissNotice();
  }, [browser]);

  const editTransaction = useCallback(
    (transaction: Transaction) => {
      openTransactionEntryLaunch(
        { transaction, type: "edit" },
        captureTransactionEntryLaunchContext(),
      );
      browser.dismissNotice();
    },
    [browser],
  );

  const duplicateTransaction = useCallback(
    (transaction: Transaction) => {
      openTransactionEntryLaunch(
        { transaction, type: "duplicate" },
        captureTransactionEntryLaunchContext(),
      );
      browser.dismissNotice();
    },
    [browser],
  );

  const splitTransaction = useCallback(
    (transaction: Transaction) => {
      openTransactionEntryLaunch(
        { transaction, type: "split" },
        captureTransactionEntryLaunchContext(),
      );
      browser.dismissNotice();
    },
    [browser],
  );

  const setSearchFilter = useCallback(
    (normalizedSearch: string) => {
      browser.cancelDateJump();
      const current = readLiveSearchParams();
      const next = writeTransactionFiltersToSearchParams(current, {
        ...readTransactionFiltersFromSearchParams(current),
        search: normalizedSearch,
      });
      const activeSurfaceParam = current.has("entry")
        ? "entry"
        : current.has("transaction")
          ? "transaction"
          : undefined;
      if (activeSurfaceParam) {
        const background = new URLSearchParams(next);
        background.delete(activeSurfaceParam);
        // Keep these writes synchronous in the same tick so React never renders
        // the overlay-less background state; never await between them.
        setSearchParams(background, { replace: true });
      }
      setSearchParams(next);
    },
    [browser, setSearchParams],
  );

  const setTransactionFilters = useCallback(
    (nextFilters: TransactionFilters) => {
      browser.cancelDateJump();
      setSearchParams(
        writeTransactionFiltersToSearchParams(
          readLiveSearchParams(),
          nextFilters,
        ),
      );
    },
    [browser, setSearchParams],
  );
  const setTransactionClassFilter = useCallback(
    (value: string) => {
      const transactionClass = transactionClasses.find(
        (candidate) => candidate === value,
      );
      const currentFilters = readTransactionFiltersFromSearchParams(
        readLiveSearchParams(),
      );
      setTransactionFilters({
        ...currentFilters,
        classes: transactionClass ? [transactionClass] : [],
      });
    },
    [setTransactionFilters],
  );
  const setHideExpected = useCallback(
    (hideExpected: boolean) => {
      const currentFilters = readTransactionFiltersFromSearchParams(
        readLiveSearchParams(),
      );
      setTransactionFilters({
        ...currentFilters,
        hideExpected,
      });
    },
    [setTransactionFilters],
  );
  const clearFilterChips = useCallback(() => {
    const currentFilters = readTransactionFiltersFromSearchParams(
      readLiveSearchParams(),
    );
    setTransactionFilters({
      ...emptyTransactionFilters,
      classes: currentFilters.classes,
      hideExpected: currentFilters.hideExpected,
      search: currentFilters.search,
    });
  }, [setTransactionFilters]);
  const addEntityFilter = useCallback(
    (kind: "category" | "member" | "tag", id: number) => {
      browser.cancelDateJump();
      const current = readLiveSearchParams();
      const currentFilters = readTransactionFiltersFromSearchParams(current);
      const nextFilters =
        kind === "category"
          ? {
              ...currentFilters,
              categoryIds: [...currentFilters.categoryIds, id],
            }
          : kind === "tag"
            ? {
                ...currentFilters,
                tagIds: [...currentFilters.tagIds, id],
              }
            : {
                ...currentFilters,
                memberIds: [...currentFilters.memberIds, id],
              };
      setSearchParams(
        writeTransactionFiltersToSearchParams(current, nextFilters),
      );
    },
    [browser, setSearchParams],
  );

  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6"
      aria-labelledby="transactions-title"
      data-transaction-detail-restore-target
      tabIndex={-1}
    >
      <PageHeader
        title="Transactions"
        titleId="transactions-title"
        eyebrow="Ledger"
        help={
          <PageHelp label="Transactions help">
            Classified transaction lines with inline journal records. Click a
            row (or press Space) to expand its journal records.
          </PageHelp>
        }
        toolbar={
          <TransactionBrowserToolbar
            bulkEditMode={browser.bulkEditMode}
            dateJumpLoading={browser.dateJumpLoading}
            dateJumpValue={browser.dateJumpValue}
            detailPanelOpen={Boolean(browser.detail.selectedTransactionId)}
            onDateJumpToday={browser.jumpToCurrentDate}
            filterControls={
              <TransactionFilterControls
                filters={filters}
                lookups={browser.lookups.snapshot}
                onChange={setTransactionFilters}
              />
            }
            hasActiveFilterChips={hasActiveTransactionFilterChips(filters)}
            filters={filters}
            idPrefix="transactions"
            onClearFilterChips={clearFilterChips}
            onClearSelection={browser.clearTransactionSelection}
            onDateJumpNext={browser.jumpToNextDate}
            onDateJumpPrevious={browser.jumpToPreviousDate}
            onDateJumpValueChange={browser.changeDateJumpValue}
            onHideExpectedChange={setHideExpected}
            onSelectPage={browser.selectPageTransactions}
            onSearchChange={setSearchFilter}
            onSetBulkEditMode={browser.setBulkEditMode}
            onTransactionClassChange={setTransactionClassFilter}
            selectableCount={browser.selectableTransactionCount}
            selectedCount={browser.selectedTransactionIds.size}
          />
        }
      />
      <div className="grid min-h-0 min-w-0 flex-1 gap-6">
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <TransactionBrowser
            bulkEditMode={browser.bulkEditMode}
            dateJumpAnchor={browser.dateJumpAnchor}
            errorMessage={browser.errorMessage}
            hasNextPage={
              browser.transactions
                ? browser.totalCount === undefined
                  ? browser.transactions.length === browser.pageSize
                  : browser.page * browser.pageSize < browser.totalCount
                : false
            }
            inlineEdit={browser.inlineEdit}
            loading={browser.loading}
            lookups={browser.lookups.snapshot}
            onConfirmRecurringOccurrence={
              browser.confirmRecurringOccurrenceFromRow
            }
            onClearSelection={browser.clearTransactionSelection}
            onFilterCategory={(categoryId) => {
              addEntityFilter("category", categoryId);
            }}
            onFilterMember={(memberId) => {
              addEntityFilter("member", memberId);
            }}
            onFilterTag={(tagId) => {
              addEntityFilter("tag", tagId);
            }}
            onNewTransaction={openEntryPanel}
            onDeleteTransaction={browser.deleteTransactionFromRow}
            onDismissRecurringOccurrence={
              browser.dismissRecurringOccurrenceFromRow
            }
            onDuplicateTransaction={duplicateTransaction}
            onEditTransaction={editTransaction}
            onNextPage={() => {
              browser.setPage(browser.page + 1);
            }}
            onOpenTransaction={browser.detail.openTransactionDetail}
            onEditTransactionAsJournal={splitTransaction}
            onPageSizeChange={browser.setPageSize}
            onPreviousPage={() => {
              browser.setPage(
                Math.max(defaultTransactionPage, browser.page - 1),
              );
            }}
            onSetBulkEditMode={browser.setBulkEditMode}
            onSplitTransaction={splitTransaction}
            onSelectRange={browser.selectTransactionRange}
            onTogglePageSelection={browser.togglePageTransactionSelection}
            onToggleSelection={browser.toggleTransactionSelection}
            onUpdateRecord={browser.updateRecord}
            onUpdateTransactionRecordReferences={
              browser.updateTransactionRecordReferences
            }
            onUpdateTransactionAmount={browser.updateTransactionAmount}
            onUpdateTransactionsBulkReferences={
              browser.updateTransactionsBulkReferences
            }
            page={browser.page}
            pageSize={browser.pageSize}
            selectedTransactionIds={browser.selectedTransactionIds}
            selectedTransactions={browser.selectedTransactions}
            totalCount={browser.totalCount}
            transactions={browser.transactions}
          />
        </div>
        <Toast
          key={browser.notice?.id ?? "empty"}
          className={
            browser.notice?.kind === "warning"
              ? "text-[var(--color-class-adjustment-ink)]"
              : "text-[var(--color-money-in)]"
          }
          containerClassName={
            browser.bulkEditMode ? "bottom-40 sm:bottom-28" : undefined
          }
          durationMs={toastDurationMs}
          message={browser.notice?.message}
          onDismiss={browser.dismissNotice}
        />
        {!browser.bulkEditMode && browser.detail.selectedTransactionId ? (
          <TransactionDetailPanel
            errorMessage={browser.detail.errorMessage}
            loading={browser.detail.loading}
            lookups={browser.lookups.snapshot}
            onClose={browser.detail.closeTransactionDetail}
            onConfirmOccurrence={browser.confirmRecurringOccurrenceFromRow}
            onDelete={browser.detail.deleteSelectedTransaction}
            onDismissOccurrence={browser.dismissRecurringOccurrenceFromRow}
            onDuplicate={duplicateTransaction}
            onEdit={editTransaction}
            onSplit={splitTransaction}
            onFilterCategory={(categoryId) => {
              addEntityFilter("category", categoryId);
            }}
            onFilterMember={(memberId) => {
              addEntityFilter("member", memberId);
            }}
            onFilterTag={(tagId) => {
              addEntityFilter("tag", tagId);
            }}
            onRestoreFocus={browser.detail.restoreDetailFocus}
            transaction={browser.detail.transaction}
          />
        ) : null}
      </div>
    </section>
  );
};
