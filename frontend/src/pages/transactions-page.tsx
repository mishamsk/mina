import { Plus } from "pixelarticons/react";
import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router";

import type { Transaction } from "@/api";
import { PageHelp } from "@/components/page-help";
import { Toast, toastDurationMs } from "@/components/toast";
import { Button } from "@/components/ui/button";
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
    browser.setEditMode(false);
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
  const clearFilterChips = useCallback(() => {
    const currentFilters = readTransactionFiltersFromSearchParams(
      readLiveSearchParams(),
    );
    setTransactionFilters({
      ...emptyTransactionFilters,
      classes: currentFilters.classes,
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
            Read-only transaction lines open full detail on click, Enter, or
            Space. Edit mode adds quick changes and eligible amount inputs.
          </PageHelp>
        }
        actions={
          <Button
            type="button"
            data-entry-modal-restore-target
            onClick={openEntryPanel}
          >
            <Plus aria-hidden="true" />
            New transaction
          </Button>
        }
        toolbar={
          <TransactionBrowserToolbar
            amountDisplayMode={browser.amountDisplayMode}
            amountSavePending={browser.pendingAmountSave}
            editMode={browser.editMode}
            dateJumpLoading={browser.dateJumpLoading}
            dateJumpValue={browser.dateJumpValue}
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
            onSelectPage={browser.selectPageTransactions}
            onSearchChange={setSearchFilter}
            onSetEditMode={browser.setEditMode}
            onToggleAmountDisplayMode={browser.toggleAmountDisplayMode}
            onTransactionClassChange={setTransactionClassFilter}
            selectableCount={browser.selectableTransactionCount}
            selectedCount={browser.selectedTransactionIds.size}
          />
        }
      />
      <div className="grid min-h-0 min-w-0 flex-1 gap-6">
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <TransactionBrowser
            amountDisplayMode={browser.amountDisplayMode}
            editMode={browser.editMode}
            dateJumpAnchor={browser.dateJumpAnchor}
            errorMessage={browser.errorMessage}
            hasNextPage={
              browser.transactions
                ? browser.totalCount === undefined
                  ? browser.transactions.length === browser.pageSize
                  : browser.page * browser.pageSize < browser.totalCount
                : false
            }
            loading={browser.loading}
            lookups={browser.lookups.snapshot}
            onConfirmRecurringOccurrence={
              browser.confirmRecurringOccurrenceFromRow
            }
            onChangeTransactionLifecycle={browser.changeTransactionLifecycle}
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
            onPageSizeChange={browser.setPageSize}
            onPreviousPage={() => {
              browser.setPage(
                Math.max(defaultTransactionPage, browser.page - 1),
              );
            }}
            onPostTransaction={browser.postTransaction}
            onSetEditMode={browser.setEditMode}
            onSplitTransaction={splitTransaction}
            onSelectRange={browser.selectTransactionRange}
            onTogglePageSelection={browser.togglePageTransactionSelection}
            onToggleSelection={browser.toggleTransactionSelection}
            onUpdateTransactionAmount={browser.updateTransactionAmount}
            onUpdateTransactionsEditReferences={
              browser.updateTransactionsEditReferences
            }
            onUpdateTransactionsEditRecordState={
              browser.updateTransactionsEditRecordState
            }
            page={browser.page}
            pageSize={browser.pageSize}
            refreshErrorMessage={browser.refreshErrorMessage}
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
          durationMs={toastDurationMs}
          message={browser.notice?.message}
          onDismiss={browser.dismissNotice}
        />
        {!browser.editMode && browser.detail.selectedTransactionId ? (
          <TransactionDetailPanel
            errorMessage={browser.detail.errorMessage}
            loading={browser.detail.loading}
            lookups={browser.lookups.snapshot}
            onChangeLifecycle={browser.changeTransactionLifecycle}
            onClose={browser.detail.closeTransactionDetail}
            onConfirmOccurrence={browser.confirmRecurringOccurrenceFromRow}
            onDelete={browser.deleteSelectedTransaction}
            onDismissOccurrence={browser.dismissRecurringOccurrenceFromRow}
            onDuplicate={duplicateTransaction}
            onEdit={editTransaction}
            onPost={browser.postTransaction}
            onSplit={splitTransaction}
            onFilterCategory={(categoryId) => {
              addEntityFilter("category", categoryId);
            }}
            onRestoreFocus={browser.detail.restoreDetailFocus}
            transaction={browser.detail.transaction}
            transactionId={browser.detail.selectedTransactionId}
          />
        ) : null}
      </div>
    </section>
  );
};
