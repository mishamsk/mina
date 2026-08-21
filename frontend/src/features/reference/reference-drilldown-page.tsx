import { Reload } from "pixelarticons/react";
import { useCallback, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import type { JournalRecord, Transaction } from "@/api";
import { Toast, toastDurationMs } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  type TransactionFilters,
} from "@/models/transaction-filters";
import { openTransactionEntryLaunch } from "@/store";

export interface ReferenceDrilldownPageProps {
  readonly filterIds: readonly number[];
}

export const ReferenceDrilldownSkeleton = () => (
  <div className="flex h-full min-h-0 flex-col" aria-hidden="true">
    <div className="min-h-0 flex-1">
      <div className="bg-card border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[5fr_10fr_4fr_27fr_13fr_15fr_7fr_14fr_5fr] gap-3 border-b border-[var(--hairline)] p-3 last:border-b-0"
          >
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const ReferenceDrilldownError = ({
  message,
  onRetry,
  title,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
  readonly title: string;
}) => (
  <div
    className="border-destructive bg-card border-2 p-4 shadow-[var(--shadow-pixel)]"
    role="alert"
  >
    <p className="text-destructive font-semibold">{title}</p>
    <details className="text-muted-foreground mt-3 text-sm">
      <summary className="text-foreground cursor-pointer">API error</summary>
      <pre className="mt-2 overflow-auto font-mono text-xs whitespace-pre-wrap">
        {message}
      </pre>
    </details>
    {onRetry ? (
      <Button
        type="button"
        variant="outline"
        className="mt-4"
        onClick={onRetry}
      >
        <Reload aria-hidden="true" />
        Retry
      </Button>
    ) : null}
  </div>
);

export const ReferenceDrilldownNotFound = ({
  backHref,
  backLabel,
  entityKindLabel,
}: {
  readonly backHref: string;
  readonly backLabel: string;
  readonly entityKindLabel: string;
}) => (
  <div
    className="bg-card border-2 border-[var(--border-ink)] p-8 text-center shadow-[var(--shadow-pixel)]"
    role="status"
  >
    <h2 className="font-heading text-lg font-bold uppercase">
      {entityKindLabel} not found
    </h2>
    <p className="font-body text-muted-foreground mx-auto mt-2 max-w-md text-sm">
      It may have been deleted, or the URL may point to an unknown id.
    </p>
    <Button asChild variant="outline" className="mt-5">
      <Link to={backHref}>{backLabel}</Link>
    </Button>
  </div>
);

const withMemberScope = (
  ids: readonly number[],
  filters: TransactionFilters,
): TransactionFilters => ({ ...filters, memberIds: ids });

const stripMemberScope = (filters: TransactionFilters): TransactionFilters => ({
  ...filters,
  memberIds: [],
});

export const ReferenceDrilldownPage = ({
  filterIds,
}: ReferenceDrilldownPageProps) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFilters = useMemo(
    () => readTransactionFiltersFromSearchParams(searchParams),
    [searchParams],
  );
  const readScopedFiltersFromSearchParams = useCallback(
    (current: URLSearchParams) =>
      withMemberScope(
        filterIds,
        stripMemberScope(readTransactionFiltersFromSearchParams(current)),
      ),
    [filterIds],
  );
  const pageFilters = useMemo(() => stripMemberScope(urlFilters), [urlFilters]);
  const filters = useMemo(
    () => withMemberScope(filterIds, pageFilters),
    [filterIds, pageFilters],
  );
  const browser = useTransactionBrowserPage({
    filters,
    readFiltersFromSearchParams: readScopedFiltersFromSearchParams,
    searchParams,
    setSearchParams,
  });

  const addEntityFilter = useCallback(
    (kind: "category" | "member" | "tag", id: number) => {
      browser.cancelDateJump();
      const current = readLiveSearchParams();
      if (kind === "member") {
        browser.detail.closeTransactionDetail();
        const nextFilters = stripMemberScope(
          readTransactionFiltersFromSearchParams(current),
        );
        const next = writeTransactionFiltersToSearchParams(
          current,
          nextFilters,
        );
        next.delete("transaction");
        next.set("pageSize", String(browser.pageSize));
        void navigate({
          pathname: `/members/${id}`,
          search: next.toString() ? `?${next.toString()}` : "",
        });
        return;
      }

      const currentFilters = stripMemberScope(
        readTransactionFiltersFromSearchParams(current),
      );
      const nextFilters =
        kind === "category"
          ? {
              ...currentFilters,
              categoryIds: [...currentFilters.categoryIds, id],
            }
          : {
              ...currentFilters,
              tagIds: [...currentFilters.tagIds, id],
            };
      const next = writeTransactionFiltersToSearchParams(current, nextFilters);
      next.set("pageSize", String(browser.pageSize));
      setSearchParams(next);
    },
    [browser, navigate, setSearchParams],
  );

  const setSearchFilter = useCallback(
    (normalizedSearch: string) => {
      browser.cancelDateJump();
      const current = readLiveSearchParams();
      const nextFilters = stripMemberScope(
        readTransactionFiltersFromSearchParams(current),
      );
      const next = writeTransactionFiltersToSearchParams(current, {
        ...nextFilters,
        search: normalizedSearch,
      });
      next.set("pageSize", String(browser.pageSize));
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
      const current = readLiveSearchParams();
      const next = writeTransactionFiltersToSearchParams(
        current,
        stripMemberScope(nextFilters),
      );
      next.set("pageSize", String(browser.pageSize));
      setSearchParams(next);
    },
    [browser, setSearchParams],
  );

  const setTransactionClassFilters = useCallback(
    (classes: TransactionFilters["classes"]) => {
      const currentFilters = stripMemberScope(
        readTransactionFiltersFromSearchParams(readLiveSearchParams()),
      );
      setTransactionFilters({
        ...currentFilters,
        classes,
      });
    },
    [setTransactionFilters],
  );
  const clearFilterChips = useCallback(() => {
    const currentFilters = stripMemberScope(
      readTransactionFiltersFromSearchParams(readLiveSearchParams()),
    );
    setTransactionFilters({
      ...emptyTransactionFilters,
      classes: currentFilters.classes,
      search: currentFilters.search,
    });
  }, [setTransactionFilters]);

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

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
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
            filters={pageFilters}
            hiddenDimensions={["member"]}
            lookups={browser.lookups.snapshot}
            onChange={setTransactionFilters}
          />
        }
        hasActiveFilterChips={hasActiveTransactionFilterChips(pageFilters)}
        filters={pageFilters}
        idPrefix="reference-transactions"
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
      <div
        className="min-h-0 flex-1"
        data-transaction-detail-restore-target
        tabIndex={-1}
      >
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
          onDeleteTransaction={browser.deleteTransactionFromRow}
          onDiscardTransactionAmountConflict={
            browser.discardTransactionAmountConflict
          }
          onDismissRecurringOccurrence={
            browser.dismissRecurringOccurrenceFromRow
          }
          onDuplicateTransaction={(transaction) => {
            openTransactionEntryLaunch(
              { transaction, type: "duplicate" },
              captureTransactionEntryLaunchContext(),
            );
          }}
          onEditTransaction={(transaction) => {
            openTransactionEntryLaunch(
              { transaction, type: "edit" },
              captureTransactionEntryLaunchContext(),
            );
          }}
          onNextPage={() => {
            browser.setPage(browser.page + 1);
          }}
          onOpenTransaction={browser.detail.openTransactionDetail}
          onPageSizeChange={browser.setPageSize}
          onPreviousPage={() => {
            browser.setPage(Math.max(defaultTransactionPage, browser.page - 1));
          }}
          onPostTransaction={browser.postTransaction}
          onRecoverTransactionAmountConflict={recoverTransactionAmountConflict}
          onSetEditMode={browser.setEditMode}
          onSplitTransaction={(transaction) => {
            openTransactionEntryLaunch(
              { transaction, type: "split" },
              captureTransactionEntryLaunchContext(),
            );
          }}
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
          errorMessage={browser.detail.errorMessage}
          loading={browser.detail.loading}
          lookups={browser.lookups.snapshot}
          onChangeLifecycle={browser.changeTransactionLifecycle}
          onClose={browser.detail.closeTransactionDetail}
          onConfirmOccurrence={browser.confirmRecurringOccurrenceFromRow}
          onDelete={browser.deleteSelectedTransaction}
          onDismissOccurrence={browser.dismissRecurringOccurrenceFromRow}
          onDuplicate={(transaction) => {
            openTransactionEntryLaunch(
              { transaction, type: "duplicate" },
              captureTransactionEntryLaunchContext(),
            );
          }}
          onEdit={(transaction) => {
            openTransactionEntryLaunch(
              { transaction, type: "edit" },
              captureTransactionEntryLaunchContext(),
            );
          }}
          onPost={browser.postTransaction}
          onFilterCategory={(categoryId) => {
            addEntityFilter("category", categoryId);
          }}
          onRestoreFocus={browser.detail.restoreDetailFocus}
          onSplit={(transaction) => {
            openTransactionEntryLaunch(
              { transaction, type: "split" },
              captureTransactionEntryLaunchContext(),
            );
          }}
          transaction={browser.detail.transaction}
          transactionId={browser.detail.selectedTransactionId}
        />
      ) : null}
    </div>
  );
};
