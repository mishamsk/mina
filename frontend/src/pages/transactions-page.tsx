import { Plus } from "pixelarticons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router";

import type { Transaction } from "@/api";
import { PageHelp } from "@/components/page-help";
import { Toast, toastDurationMs } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell";
import {
  defaultTransactionPage,
  EntryPanel,
  type EntryPanelLaunch,
  type EntryPanelSaveContext,
  hasActiveTransactionFilterChips,
  readTransactionFiltersFromSearchParams,
  refreshTransactionPageAfterSave,
  TransactionBrowser,
  TransactionBrowserToolbar,
  TransactionDetailPanel,
  TransactionFilterControls,
  useTransactionBrowserPage,
  writeTransactionFiltersToSearchParams,
} from "@/features/ledger";
import { cn } from "@/lib/utils";
import {
  emptyTransactionFilters,
  transactionClasses,
  type TransactionFilters,
} from "@/models/transaction-filters";
import {
  closeTransactionEntryPanel,
  getCommandPaletteSnapshot,
  openTransactionEntryPanel,
  setLastTransactionsPageSearch,
  useTransactionEntryPanelView,
} from "@/store";

export const TransactionsPage = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const entryPanel = useTransactionEntryPanelView();
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [quickDeleteDialogOpen, setQuickDeleteDialogOpen] = useState(false);
  const [rowActionsOverflowOpen, setRowActionsOverflowOpen] = useState(false);
  const [entryLaunch, setEntryLaunch] = useState<
    EntryPanelLaunch | undefined
  >();
  const filters = useMemo(
    () => readTransactionFiltersFromSearchParams(searchParams),
    [searchParams],
  );
  const browser = useTransactionBrowserPage({
    filters,
    searchParams,
    setSearchParams,
  });
  const effectiveEntryLaunch = entryPanel.initialTab ? undefined : entryLaunch;

  useEffect(() => {
    setLastTransactionsPageSearch(location.search);
  }, [location.search]);

  const openEntryPanel = useCallback(() => {
    setEntryLaunch(undefined);
    openTransactionEntryPanel();
    browser.dismissNotice();
  }, [browser]);

  const editTransaction = useCallback(
    (transaction: Transaction) => {
      setEntryLaunch({ transaction, type: "edit" });
      browser.detail.closeTransactionDetail();
      openTransactionEntryPanel();
      browser.dismissNotice();
    },
    [browser],
  );

  const duplicateTransaction = useCallback(
    (transaction: Transaction) => {
      setEntryLaunch({ transaction, type: "duplicate" });
      browser.detail.closeTransactionDetail();
      openTransactionEntryPanel();
      browser.dismissNotice();
    },
    [browser],
  );

  const splitTransaction = useCallback(
    (transaction: Transaction) => {
      setEntryLaunch({ transaction, type: "split" });
      browser.detail.closeTransactionDetail();
      openTransactionEntryPanel();
      browser.dismissNotice();
    },
    [browser],
  );

  const setSearchFilter = useCallback(
    (normalizedSearch: string) => {
      browser.cancelDateJump();
      setSearchParams((current) =>
        writeTransactionFiltersToSearchParams(current, {
          ...readTransactionFiltersFromSearchParams(current),
          search: normalizedSearch,
        }),
      );
    },
    [browser, setSearchParams],
  );

  const setTransactionFilters = useCallback(
    (nextFilters: TransactionFilters) => {
      browser.cancelDateJump();
      setSearchParams((current) =>
        writeTransactionFiltersToSearchParams(current, nextFilters),
      );
    },
    [browser, setSearchParams],
  );
  const setTransactionClassFilter = useCallback(
    (value: string) => {
      const transactionClass = transactionClasses.find(
        (candidate) => candidate === value,
      );
      setTransactionFilters({
        ...filters,
        classes: transactionClass ? [transactionClass] : [],
      });
    },
    [filters, setTransactionFilters],
  );
  const clearFilterChips = useCallback(() => {
    setTransactionFilters({
      ...emptyTransactionFilters,
      classes: filters.classes,
      search: filters.search,
    });
  }, [filters.classes, filters.search, setTransactionFilters]);
  const addEntityFilter = useCallback(
    (kind: "category" | "member" | "tag", id: number) => {
      browser.cancelDateJump();
      setSearchParams((current) => {
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
        return writeTransactionFiltersToSearchParams(current, nextFilters);
      });
    },
    [browser, setSearchParams],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const targetElement = target instanceof HTMLElement ? target : undefined;
      if (
        browser.detail.selectedTransactionId ||
        entryPanel.open ||
        filterPopoverOpen ||
        getCommandPaletteSnapshot().open ||
        quickDeleteDialogOpen ||
        rowActionsOverflowOpen ||
        event.key.toLowerCase() !== "n" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        targetElement?.matches(
          "input, textarea, select, [contenteditable='true']",
        )
      ) {
        return;
      }

      event.preventDefault();
      openEntryPanel();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    entryPanel.open,
    browser.detail.selectedTransactionId,
    filterPopoverOpen,
    openEntryPanel,
    quickDeleteDialogOpen,
    rowActionsOverflowOpen,
  ]);

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
            Classified transaction lines with inline journal records.
          </PageHelp>
        }
        actions={
          <Button type="button" onClick={openEntryPanel}>
            <Plus aria-hidden="true" />
            New transaction
          </Button>
        }
        toolbar={
          <TransactionBrowserToolbar
            dateJumpLoading={browser.dateJumpLoading}
            dateJumpValue={browser.dateJumpValue}
            onDateJumpToday={browser.jumpToCurrentDate}
            filterControls={
              <TransactionFilterControls
                filters={filters}
                lookups={browser.lookups.snapshot}
                onChange={setTransactionFilters}
                onOpenChange={setFilterPopoverOpen}
              />
            }
            hasActiveFilterChips={hasActiveTransactionFilterChips(filters)}
            filters={filters}
            idPrefix="transactions"
            onClearFilterChips={clearFilterChips}
            onFilterBarClose={() => {
              setFilterPopoverOpen(false);
            }}
            onDateJumpNext={browser.jumpToNextDate}
            onDateJumpPrevious={browser.jumpToPreviousDate}
            onDateJumpValueChange={browser.changeDateJumpValue}
            onSearchChange={setSearchFilter}
            onTransactionClassChange={setTransactionClassFilter}
          />
        }
      />
      <div
        className={cn(
          "grid min-h-0 min-w-0 flex-1 gap-6",
          entryPanel.open && "lg:grid-cols-[minmax(0,1fr)_360px]",
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <TransactionBrowser
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
            onDeleteConfirmationOpenChange={setQuickDeleteDialogOpen}
            onRowActionsOverflowOpenChange={setRowActionsOverflowOpen}
            page={browser.page}
            pageSize={browser.pageSize}
            totalCount={browser.totalCount}
            transactions={browser.transactions}
          />
        </div>
        <Toast
          key={browser.notice?.id ?? "empty"}
          className="text-[var(--color-money-in)]"
          durationMs={toastDurationMs}
          message={browser.notice?.message}
          onDismiss={browser.dismissNotice}
        />
        <EntryPanel
          key={entryPanel.revision}
          initialTab={entryPanel.initialTab}
          launch={effectiveEntryLaunch}
          lookups={browser.lookups.snapshot}
          open={entryPanel.open}
          onClose={() => {
            setEntryLaunch(undefined);
            closeTransactionEntryPanel();
          }}
          onSaved={async (
            transaction: Transaction,
            context: EntryPanelSaveContext,
          ) => {
            const savedOnCurrentPage = await refreshTransactionPageAfterSave(
              browser.params,
              transaction.transaction_id,
              transaction,
              context.previousTransaction,
            );
            setEntryLaunch(undefined);
            if (context.operation === "updated") {
              browser.showNotice("Transaction updated.");
            } else {
              browser.showNotice(
                savedOnCurrentPage
                  ? "Transaction saved."
                  : "Transaction saved. It may appear on another page.",
              );
            }
          }}
        />
        {browser.detail.selectedTransactionId ? (
          <TransactionDetailPanel
            errorMessage={browser.detail.errorMessage}
            loading={browser.detail.loading}
            lookups={browser.lookups.snapshot}
            onClose={browser.detail.closeTransactionDetail}
            onDelete={browser.detail.deleteSelectedTransaction}
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
