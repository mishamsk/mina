import { Reload } from "pixelarticons/react";
import { useCallback, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import {
  apiErrorMessage,
  getCategory,
  getTag,
  type JournalRecord,
  type Transaction,
} from "@/api";
import { MobileTableControls } from "@/components/mobile-table-controls";
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
  useEntityFilterRequestGuard,
  useTransactionBrowserPage,
  writeTransactionFiltersToSearchParams,
} from "@/features/ledger";
import {
  addRequiredTransactionFilterMembership,
  addTransactionFilterMembership,
  emptyTransactionFilters,
  transactionFilterRows,
  type TransactionFilters,
  withoutTransactionFilterMembership,
} from "@/models/transaction-filters";
import { openTransactionEntryLaunch } from "@/store";

export interface ReferenceDrilldownPageProps {
  readonly memberName: string;
}

export const ReferenceDrilldownSkeleton = () => (
  <div
    className="roomy-shell:h-full flex h-auto min-h-0 flex-col"
    aria-hidden="true"
  >
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
  memberName: string,
  filters: TransactionFilters,
): TransactionFilters =>
  addRequiredTransactionFilterMembership(
    withoutTransactionFilterMembership(filters, "member"),
    "member",
    memberName,
  );

const withoutMemberScope = (filters: TransactionFilters): TransactionFilters =>
  withoutTransactionFilterMembership(filters, "member");

export const ReferenceDrilldownPage = ({
  memberName,
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
        memberName,
        readTransactionFiltersFromSearchParams(current),
      ),
    [memberName],
  );
  const pageFilters = useMemo(
    () => withoutMemberScope(urlFilters),
    [urlFilters],
  );
  const filterRowsEditable = transactionFilterRows(pageFilters) !== undefined;
  const filters = useMemo(
    () => withMemberScope(memberName, pageFilters),
    [memberName, pageFilters],
  );
  const browser = useTransactionBrowserPage({
    filters,
    readFiltersFromSearchParams: readScopedFiltersFromSearchParams,
    searchParams,
    setSearchParams,
  });
  const {
    beginEntityFilterRequest,
    cancelEntityFilterRequests,
    completeEntityFilterRequest,
  } = useEntityFilterRequestGuard();

  const addEntityFilter = useCallback(
    async (kind: "category" | "member" | "tag", id: number) => {
      browser.cancelDateJump();
      if (kind === "member") {
        const current = readLiveSearchParams();
        browser.detail.closeTransactionDetail();
        const nextFilters = withoutMemberScope(
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

      const controller = beginEntityFilterRequest();
      const response =
        kind === "category"
          ? await getCategory({
              path: { category_id: id },
              signal: controller.signal,
            })
          : await getTag({
              path: { tag_id: id },
              signal: controller.signal,
            });
      if (!completeEntityFilterRequest(controller)) {
        return;
      }
      const fqn = response.data?.fqn;
      if (!fqn) {
        browser.showNotice(
          apiErrorMessage(
            response.error,
            `The ${kind} could not be loaded for filtering.`,
          ),
          "warning",
        );
        return;
      }

      const current = readLiveSearchParams();
      const currentFilters = withoutMemberScope(
        readTransactionFiltersFromSearchParams(current),
      );
      const nextFilters = addTransactionFilterMembership(
        currentFilters,
        kind,
        fqn,
      );
      const next = writeTransactionFiltersToSearchParams(current, nextFilters);
      setSearchParams(next);
    },
    [
      beginEntityFilterRequest,
      browser,
      completeEntityFilterRequest,
      navigate,
      setSearchParams,
    ],
  );

  const setSearchFilter = useCallback(
    (normalizedSearch: string) => {
      browser.cancelDateJump();
      const current = readLiveSearchParams();
      const nextFilters = withoutMemberScope(
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
      const next = writeTransactionFiltersToSearchParams(current, nextFilters);
      next.set("pageSize", String(browser.pageSize));
      setSearchParams(next);
    },
    [browser, setSearchParams],
  );

  const setTransactionClassFilters = useCallback(
    (classes: TransactionFilters["classes"]) => {
      const currentFilters = withoutMemberScope(
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
    <div className="roomy-shell:h-full flex h-auto min-h-0 flex-col gap-6">
      <MobileTableControls>
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
      </MobileTableControls>
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
          onConfirmExpected={browser.confirmExpectedTransactionFromRow}
          onDeferProjection={browser.deferRecurringProjection}
          onDelete={browser.deleteSelectedTransaction}
          onDismissExpected={browser.dismissExpectedTransactionFromRow}
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
          onFilterCategory={
            filterRowsEditable
              ? (categoryId) => {
                  void addEntityFilter("category", categoryId);
                }
              : undefined
          }
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
