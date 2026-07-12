import { EyeOff, Open, Reload } from "pixelarticons/react";
import { type ReactNode, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { Toast, toastDurationMs } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  defaultTransactionPage,
  defaultTransactionPageSize,
  FqnPath,
  hasActiveTransactionFilterChips,
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

export interface ReferenceDrilldownPageProps {
  readonly actionLabel: string;
  readonly badges?: ReactNode;
  readonly entityKindLabel: string;
  readonly exactOnly?: boolean;
  readonly filterIds: readonly number[];
  readonly filterKind: "category" | "member" | "tag";
  readonly fqn?: string;
  readonly hidden?: boolean;
  readonly onExactOnlyChange?: (exactOnly: boolean) => void;
  readonly showExactOnlyToggle?: boolean;
  readonly title: string;
  readonly viewAllHref: string;
}

export const ReferenceDrilldownSkeleton = () => (
  <div className="flex h-full min-h-0 flex-col gap-6" aria-hidden="true">
    <div className="bg-card border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-6 w-44 max-w-full" />
        </div>
        <Skeleton className="h-9 w-48 max-w-full" />
      </div>
    </div>
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

const filtersFor = (
  kind: ReferenceDrilldownPageProps["filterKind"],
  ids: readonly number[],
  filters: TransactionFilters,
): TransactionFilters => {
  if (kind === "category") {
    return {
      ...filters,
      categoryIds: ids,
    };
  }

  if (kind === "tag") {
    return {
      ...filters,
      tagIds: ids,
    };
  }

  return {
    ...filters,
    memberIds: ids,
  };
};

const stripScopedFilterKind = (
  kind: ReferenceDrilldownPageProps["filterKind"],
  filters: TransactionFilters,
): TransactionFilters => {
  if (kind === "category") {
    return {
      ...filters,
      categoryIds: [],
    };
  }

  if (kind === "tag") {
    return {
      ...filters,
      tagIds: [],
    };
  }

  return {
    ...filters,
    memberIds: [],
  };
};

const referenceEntityPath = (
  kind: ReferenceDrilldownPageProps["filterKind"],
  id: number,
): string => {
  if (kind === "category") {
    return `/categories/${id}`;
  }

  if (kind === "tag") {
    return `/tags/${id}`;
  }

  return `/members/${id}`;
};

export const referenceTransactionHref = (
  kind: ReferenceDrilldownPageProps["filterKind"],
  ids: readonly number[],
): string => {
  const searchParams = new URLSearchParams();
  for (const id of ids) {
    searchParams.append(kind, String(id));
  }
  searchParams.set("page", String(defaultTransactionPage));
  searchParams.set("pageSize", String(defaultTransactionPageSize));
  return `/transactions?${searchParams.toString()}`;
};

export const ReferenceDrilldownPage = ({
  actionLabel,
  badges,
  entityKindLabel,
  exactOnly,
  filterIds,
  filterKind,
  fqn,
  hidden,
  onExactOnlyChange,
  showExactOnlyToggle = false,
  title,
  viewAllHref,
}: ReferenceDrilldownPageProps) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const restoreScopeToggleFocusRef = useRef(false);
  const scopeToggleRef = useRef<HTMLButtonElement | null>(null);
  const urlFilters = useMemo(
    () => readTransactionFiltersFromSearchParams(searchParams),
    [searchParams],
  );
  const readScopedFiltersFromSearchParams = useCallback(
    (current: URLSearchParams) =>
      filtersFor(
        filterKind,
        filterIds,
        stripScopedFilterKind(
          filterKind,
          readTransactionFiltersFromSearchParams(current),
        ),
      ),
    [filterIds, filterKind],
  );
  const pageFilters = useMemo(
    () => stripScopedFilterKind(filterKind, urlFilters),
    [filterKind, urlFilters],
  );
  const filters = useMemo(
    () => filtersFor(filterKind, filterIds, pageFilters),
    [filterIds, filterKind, pageFilters],
  );
  const browser = useTransactionBrowserPage({
    filters,
    readFiltersFromSearchParams: readScopedFiltersFromSearchParams,
    searchParams,
    setSearchParams,
  });

  const restoreTransactionDetailFocus = useCallback(() => {
    if (restoreScopeToggleFocusRef.current) {
      restoreScopeToggleFocusRef.current = false;
      if (scopeToggleRef.current?.isConnected) {
        scopeToggleRef.current.focus({ preventScroll: true });
        return;
      }
    }

    browser.detail.restoreDetailFocus();
  }, [browser.detail]);

  const addEntityFilter = useCallback(
    (kind: "category" | "member" | "tag", id: number) => {
      browser.cancelDateJump();
      if (kind === filterKind) {
        browser.detail.closeTransactionDetail();
        const nextFilters = stripScopedFilterKind(
          filterKind,
          readTransactionFiltersFromSearchParams(searchParams),
        );
        const next = writeTransactionFiltersToSearchParams(
          searchParams,
          nextFilters,
        );
        next.delete("transaction");
        next.set("pageSize", String(browser.pageSize));
        void navigate({
          pathname: referenceEntityPath(kind, id),
          search: next.toString() ? `?${next.toString()}` : "",
        });
        return;
      }

      setSearchParams((current) => {
        const currentFilters = stripScopedFilterKind(
          filterKind,
          readTransactionFiltersFromSearchParams(current),
        );
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
        const next = writeTransactionFiltersToSearchParams(
          current,
          nextFilters,
        );
        next.set("pageSize", String(browser.pageSize));
        return next;
      });
    },
    [browser, filterKind, navigate, searchParams, setSearchParams],
  );

  const setSearchFilter = useCallback(
    (normalizedSearch: string) => {
      browser.cancelDateJump();
      setSearchParams((current) => {
        const nextFilters = stripScopedFilterKind(
          filterKind,
          readTransactionFiltersFromSearchParams(current),
        );
        const next = writeTransactionFiltersToSearchParams(current, {
          ...nextFilters,
          search: normalizedSearch,
        });
        next.set("pageSize", String(browser.pageSize));
        return next;
      });
    },
    [browser, filterKind, setSearchParams],
  );

  const setTransactionFilters = useCallback(
    (nextFilters: TransactionFilters) => {
      browser.cancelDateJump();
      setSearchParams((current) => {
        const next = writeTransactionFiltersToSearchParams(
          current,
          stripScopedFilterKind(filterKind, nextFilters),
        );
        next.set("pageSize", String(browser.pageSize));
        return next;
      });
    },
    [browser, filterKind, setSearchParams],
  );

  const setTransactionClassFilter = useCallback(
    (value: string) => {
      const transactionClass = transactionClasses.find(
        (candidate) => candidate === value,
      );
      setTransactionFilters({
        ...pageFilters,
        classes: transactionClass ? [transactionClass] : [],
      });
    },
    [pageFilters, setTransactionFilters],
  );
  const clearFilterChips = useCallback(() => {
    setTransactionFilters({
      ...emptyTransactionFilters,
      classes: pageFilters.classes,
      search: pageFilters.search,
    });
  }, [pageFilters.classes, pageFilters.search, setTransactionFilters]);

  const hiddenFilterDimensions = useMemo(
    () => [filterKind] as const,
    [filterKind],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="bg-card border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div>
              <p className="font-heading text-muted-foreground text-xs font-semibold uppercase">
                {entityKindLabel}
              </p>
              <h2 className="font-heading text-foreground mt-1 truncate text-xl font-bold">
                {fqn ? (
                  <FqnPath
                    value={fqn}
                    focusable={false}
                    className="text-xl"
                    leafClassName="font-bold"
                  />
                ) : (
                  title
                )}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {badges}
              {hidden ? (
                <span
                  aria-label={`Hidden ${entityKindLabel.toLowerCase()}`}
                  className="font-heading bg-muted text-foreground inline-flex min-h-6 items-center gap-1 border border-[var(--border-ink)] px-1.5 text-xs font-semibold uppercase shadow-[var(--shadow-chip)]"
                >
                  <EyeOff aria-hidden="true" className="size-4" />
                  Hidden
                </span>
              ) : null}
            </div>
          </div>
          <Button asChild variant="outline">
            <Link to={viewAllHref}>
              <Open aria-hidden="true" />
              {actionLabel}
            </Link>
          </Button>
        </div>
      </div>
      <TransactionBrowserToolbar
        dateJumpLoading={browser.dateJumpLoading}
        dateJumpValue={browser.dateJumpValue}
        onDateJumpToday={browser.jumpToCurrentDate}
        extraControls={
          showExactOnlyToggle ? (
            <label className="font-heading mt-5 inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-[var(--frame-foreground)] uppercase">
              <Checkbox
                ref={scopeToggleRef}
                checked={exactOnly === true}
                onCheckedChange={(checked) => {
                  restoreScopeToggleFocusRef.current = Boolean(
                    browser.detail.selectedTransactionId,
                  );
                  onExactOnlyChange?.(checked === true);
                }}
              />
              This level only
            </label>
          ) : null
        }
        filterControls={
          <TransactionFilterControls
            filters={pageFilters}
            hiddenDimensions={hiddenFilterDimensions}
            lookups={browser.lookups.snapshot}
            onChange={setTransactionFilters}
          />
        }
        hasActiveFilterChips={hasActiveTransactionFilterChips(pageFilters)}
        filters={pageFilters}
        idPrefix="reference-transactions"
        onClearFilterChips={clearFilterChips}
        onDateJumpNext={browser.jumpToNextDate}
        onDateJumpPrevious={browser.jumpToPreviousDate}
        onDateJumpValueChange={browser.changeDateJumpValue}
        onSearchChange={setSearchFilter}
        onTransactionClassChange={setTransactionClassFilter}
      />
      <div
        className="min-h-0 flex-1"
        data-transaction-detail-restore-target
        tabIndex={-1}
      >
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
          onNewTransaction={() => {
            void navigate("/transactions");
          }}
          onDeleteTransaction={browser.deleteTransactionFromRow}
          onNextPage={() => {
            browser.setPage(browser.page + 1);
          }}
          onOpenTransaction={browser.detail.openTransactionDetail}
          onPageSizeChange={browser.setPageSize}
          onPreviousPage={() => {
            browser.setPage(Math.max(defaultTransactionPage, browser.page - 1));
          }}
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
      {browser.detail.selectedTransactionId ? (
        <TransactionDetailPanel
          errorMessage={browser.detail.errorMessage}
          loading={browser.detail.loading}
          lookups={browser.lookups.snapshot}
          onClose={browser.detail.closeTransactionDetail}
          onDelete={browser.detail.deleteSelectedTransaction}
          onFilterCategory={(categoryId) => {
            addEntityFilter("category", categoryId);
          }}
          onFilterMember={(memberId) => {
            addEntityFilter("member", memberId);
          }}
          onFilterTag={(tagId) => {
            addEntityFilter("tag", tagId);
          }}
          onRestoreFocus={restoreTransactionDetailFocus}
          transaction={browser.detail.transaction}
        />
      ) : null}
    </div>
  );
};
