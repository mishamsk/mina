import { Plus } from "pixelarticons/react";
import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router";

import {
  apiErrorMessage,
  getCategory,
  getMember,
  getTag,
  type JournalRecord,
  type Transaction,
} from "@/api";
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
  useEntityFilterRequestGuard,
  useTransactionBrowserPage,
  writeTransactionFiltersToSearchParams,
} from "@/features/ledger";
import {
  addTransactionFilterMembership,
  emptyTransactionFilters,
  transactionFilterRows,
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
  const filterRowsEditable = transactionFilterRows(filters) !== undefined;
  const browser = useTransactionBrowserPage({
    filters,
    searchParams,
    setSearchParams,
  });
  const {
    beginEntityFilterRequest,
    cancelEntityFilterRequests,
    completeEntityFilterRequest,
  } = useEntityFilterRequestGuard();

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

  const recoverTransactionAmountConflict = (
    transaction: Transaction,
    records: readonly [JournalRecord, JournalRecord],
    amount: string,
  ) => {
    openTransactionEntryLaunch(
      {
        amountConflict: {
          amount,
          recordIds: [records[0].record_id, records[1].record_id],
        },
        transaction,
        type: "edit",
      },
      captureTransactionEntryLaunchContext(),
    );
    browser.dismissNotice();
  };

  const splitTransaction = useCallback(
    (transaction: Transaction, opener?: HTMLElement) => {
      openTransactionEntryLaunch(
        { opener, transaction, type: "split" },
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
  const setTransactionClassFilters = useCallback(
    (classes: TransactionFilters["classes"]) => {
      const currentFilters = readTransactionFiltersFromSearchParams(
        readLiveSearchParams(),
      );
      setTransactionFilters({
        ...currentFilters,
        classes,
      });
    },
    [setTransactionFilters],
  );
  const clearFilterChips = useCallback(() => {
    cancelEntityFilterRequests();
    const currentFilters = readTransactionFiltersFromSearchParams(
      readLiveSearchParams(),
    );
    setTransactionFilters({
      ...emptyTransactionFilters,
      classes: currentFilters.classes,
      search: currentFilters.search,
    });
  }, [cancelEntityFilterRequests, setTransactionFilters]);
  const addEntityFilter = useCallback(
    async (kind: "category" | "member" | "tag", id: number) => {
      const controller = beginEntityFilterRequest();
      let error: unknown;
      let value: string | undefined;
      if (kind === "category") {
        const category = await getCategory({
          path: { category_id: id },
          signal: controller.signal,
        });
        error = category.error;
        value = category.data?.fqn;
      } else if (kind === "tag") {
        const tag = await getTag({
          path: { tag_id: id },
          signal: controller.signal,
        });
        error = tag.error;
        value = tag.data?.fqn;
      } else {
        const member = await getMember({
          path: { member_id: id },
          signal: controller.signal,
        });
        error = member.error;
        value = member.data?.name;
      }
      if (!completeEntityFilterRequest(controller)) {
        return;
      }
      if (!value) {
        browser.showNotice(
          apiErrorMessage(
            error,
            `The ${kind} could not be loaded for filtering.`,
          ),
          "warning",
        );
        return;
      }
      browser.cancelDateJump();
      const current = readLiveSearchParams();
      const currentFilters = readTransactionFiltersFromSearchParams(current);
      const nextFilters = addTransactionFilterMembership(
        currentFilters,
        kind,
        value,
      );
      setSearchParams(
        writeTransactionFiltersToSearchParams(current, nextFilters),
      );
    },
    [
      beginEntityFilterRequest,
      browser,
      completeEntityFilterRequest,
      setSearchParams,
    ],
  );

  return (
    <section
      className="roomy-shell:h-[calc(100svh-2.5rem)] flex min-h-0 flex-col gap-6"
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
            dateJumpEnabled={browser.dateJumpEnabled}
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
            onSortChange={browser.setSort}
            onSortDirectionChange={browser.setSortDirection}
            onToggleAmountDisplayMode={browser.toggleAmountDisplayMode}
            onTransactionClassesChange={setTransactionClassFilters}
            selectableCount={browser.selectableTransactionCount}
            selectedCount={browser.selectedTransactionIds.size}
            sort={browser.sort}
            sortDirection={browser.sortDirection}
          />
        }
      />
      <div className="grid min-h-0 min-w-0 flex-1 gap-6">
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <TransactionBrowser
            amountDisplayMode={browser.amountDisplayMode}
            confirmingProjectionDefinitionId={
              browser.confirmingProjectionDefinitionId
            }
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
            onConfirmNextRecurringProjection={
              browser.confirmNextRecurringProjection
            }
            onConfirmExpectedTransaction={
              browser.confirmExpectedTransactionFromRow
            }
            onDeferRecurringProjection={browser.deferRecurringProjection}
            onChangeTransactionLifecycle={browser.changeTransactionLifecycle}
            onClearSelection={browser.clearTransactionSelection}
            onFilterCategory={
              filterRowsEditable
                ? (categoryId) => {
                    void addEntityFilter("category", categoryId);
                  }
                : undefined
            }
            onFilterMember={
              filterRowsEditable
                ? (memberId) => {
                    void addEntityFilter("member", memberId);
                  }
                : undefined
            }
            onFilterTag={
              filterRowsEditable
                ? (tagId) => {
                    void addEntityFilter("tag", tagId);
                  }
                : undefined
            }
            onNewTransaction={openEntryPanel}
            onDeleteTransaction={browser.deleteTransactionFromRow}
            onDiscardTransactionAmountConflict={
              browser.discardTransactionAmountConflict
            }
            onDismissExpectedTransaction={
              browser.dismissExpectedTransactionFromRow
            }
            onLoadRecurringDefinitionForProjection={
              browser.loadRecurringDefinitionForProjection
            }
            onDuplicateTransaction={duplicateTransaction}
            onEditTransaction={editTransaction}
            onNextPage={() => {
              browser.setPage(browser.page + 1);
            }}
            onOpenTransaction={(transaction, opener) => {
              browser.detail.openTransactionDetail(transaction, opener, {
                autoFocusOnTransactionChange: true,
              });
            }}
            onPageSizeChange={browser.setPageSize}
            onPreviousPage={() => {
              browser.setPage(
                Math.max(defaultTransactionPage, browser.page - 1),
              );
            }}
            onRetryRefresh={browser.retryPageLoad}
            onPostTransaction={browser.postTransaction}
            onRecoverTransactionAmountConflict={
              recoverTransactionAmountConflict
            }
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
            pageStale={browser.pageStale}
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
            autoFocusOnTransactionChange={
              browser.detail.autoFocusOnTransactionChange
            }
            confirmingProjectionDefinitionId={
              browser.confirmingProjectionDefinitionId
            }
            errorMessage={browser.detail.errorMessage}
            loading={browser.detail.loading}
            lookups={browser.lookups.snapshot}
            onChangeLifecycle={browser.changeTransactionLifecycle}
            onClose={browser.detail.closeTransactionDetail}
            onConfirmNextProjection={browser.confirmNextRecurringProjection}
            onConfirmExpected={browser.confirmExpectedTransactionFromRow}
            onDeferProjection={browser.deferRecurringProjection}
            onDelete={browser.deleteSelectedTransaction}
            onDismissExpected={browser.dismissExpectedTransactionFromRow}
            onDuplicate={duplicateTransaction}
            onEdit={editTransaction}
            onPost={browser.postTransaction}
            onSplit={splitTransaction}
            onFilterCategory={
              filterRowsEditable
                ? (categoryId) => {
                    void addEntityFilter("category", categoryId);
                  }
                : undefined
            }
            onRestoreFocus={browser.detail.restoreDetailFocus}
            transaction={browser.detail.transaction}
            transactionId={browser.detail.selectedTransactionId}
          />
        ) : null}
      </div>
    </section>
  );
};
