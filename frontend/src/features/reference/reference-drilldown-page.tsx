import {
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Open,
  Reload,
} from "pixelarticons/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import {
  deleteTransactionById,
  isNetworkFailure,
  type Transaction,
  type TransactionPageParams,
} from "@/api";
import { Toast, toastDurationMs } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  defaultTransactionPage,
  defaultTransactionPageSize,
  FqnPath,
  readTransactionFiltersFromSearchParams,
  readTransactionPageFromSearchParams,
  refreshTransactionPageAfterSave,
  TransactionBrowser,
  transactionClassLabel,
  TransactionDetailPanel,
  TransactionFilterControls,
  transactionOffsetFromPage,
  useTransactionDateJump,
  useTransactionDetail,
  useTransactionsResource,
  writeTransactionFiltersToSearchParams,
} from "@/features/ledger";
import {
  transactionClasses,
  type TransactionFilters,
} from "@/models/transaction-filters";

interface Notice {
  readonly id: number;
  readonly message: string;
}

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

const apiErrorMessage = (error: unknown): string => {
  if (isNetworkFailure(error)) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "object" &&
    error.error !== null &&
    "message" in error.error &&
    typeof error.error.message === "string"
  ) {
    return error.error.message;
  }
  return "The API request failed.";
};

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

interface TransactionSearchInputProps {
  readonly onSearchChange: (value: string) => void;
  readonly value: string;
}

const TransactionSearchInput = ({
  onSearchChange,
  value,
}: TransactionSearchInputProps) => {
  const [draftState, setDraftState] = useState({
    draft: value,
    value,
  });
  const draft = draftState.value === value ? draftState.draft : value;

  useEffect(() => {
    const normalizedSearch = draft.trim();
    if (normalizedSearch === value) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onSearchChange(normalizedSearch);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [draft, onSearchChange, value]);

  return (
    <input
      id="reference-transactions-search"
      type="search"
      className="bg-card text-foreground placeholder:text-muted-foreground h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
      placeholder="Memo or counterparty"
      value={draft}
      onChange={(event) => {
        setDraftState({
          draft: event.target.value,
          value,
        });
      }}
    />
  );
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
  const [notice, setNotice] = useState<Notice | undefined>();
  const dateJumpFocusRestoreRef = useRef<HTMLButtonElement | null>(null);
  const restoreScopeToggleFocusRef = useRef(false);
  const scopeToggleRef = useRef<HTMLButtonElement | null>(null);
  const { page, pageSize } = readTransactionPageFromSearchParams(searchParams);
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
    dateJumpLoading,
    dateJumpValue,
    jumpToAdjacentDate,
    jumpToDate,
    setDateJumpValue,
  } = useTransactionDateJump({
    page,
    pageSize,
    params,
    readFiltersFromSearchParams: readScopedFiltersFromSearchParams,
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
    Boolean(transactions && !lookups.snapshot);
  const errorMessage = pageResource.errorMessage ?? lookups.errorMessage;

  const showNotice = useCallback((message: string) => {
    setNotice((current) => ({
      id: (current?.id ?? 0) + 1,
      message,
    }));
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
  const {
    closeTransactionDetail,
    deleteSelectedTransaction,
    errorMessage: detailErrorMessage,
    loading: detailLoading,
    openTransactionDetail,
    restoreDetailFocus,
    selectedTransactionId,
    transaction: detailTransaction,
  } = detail;

  const restoreTransactionDetailFocus = useCallback(() => {
    if (restoreScopeToggleFocusRef.current) {
      restoreScopeToggleFocusRef.current = false;
      if (scopeToggleRef.current?.isConnected) {
        scopeToggleRef.current.focus({ preventScroll: true });
        return;
      }
    }

    restoreDetailFocus();
  }, [restoreDetailFocus]);

  const deleteTransactionFromRow = useCallback(
    async (transaction: Transaction) => {
      const result = await deleteTransactionById(transaction.transaction_id);
      if (result.error) {
        throw new Error(apiErrorMessage(result.error));
      }

      if (selectedTransactionId === transaction.transaction_id) {
        closeTransactionDetail();
      }
      await refreshTransactionPageAfterSave(
        params,
        transaction.transaction_id,
        transaction,
      );
      showNotice("Transaction deleted.");
    },
    [closeTransactionDetail, params, selectedTransactionId, showNotice],
  );

  const addEntityFilter = useCallback(
    (kind: "category" | "member" | "tag", id: number) => {
      cancelDateJump();
      if (kind === filterKind) {
        closeTransactionDetail();
        const nextFilters = stripScopedFilterKind(
          filterKind,
          readTransactionFiltersFromSearchParams(searchParams),
        );
        const next = writeTransactionFiltersToSearchParams(
          searchParams,
          nextFilters,
        );
        next.delete("transaction");
        next.set("pageSize", String(pageSize));
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
        next.set("pageSize", String(pageSize));
        return next;
      });
    },
    [
      cancelDateJump,
      closeTransactionDetail,
      filterKind,
      navigate,
      pageSize,
      searchParams,
      setSearchParams,
    ],
  );

  const setSearchFilter = useCallback(
    (normalizedSearch: string) => {
      cancelDateJump();
      setSearchParams((current) => {
        const nextFilters = stripScopedFilterKind(
          filterKind,
          readTransactionFiltersFromSearchParams(current),
        );
        const next = writeTransactionFiltersToSearchParams(current, {
          ...nextFilters,
          search: normalizedSearch,
        });
        next.set("pageSize", String(pageSize));
        return next;
      });
    },
    [cancelDateJump, filterKind, pageSize, setSearchParams],
  );

  const setTransactionFilters = useCallback(
    (nextFilters: TransactionFilters) => {
      cancelDateJump();
      setSearchParams((current) => {
        const next = writeTransactionFiltersToSearchParams(
          current,
          stripScopedFilterKind(filterKind, nextFilters),
        );
        next.set("pageSize", String(pageSize));
        return next;
      });
    },
    [cancelDateJump, filterKind, pageSize, setSearchParams],
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
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-[16rem] flex-col gap-1">
          <label
            htmlFor="reference-transactions-search"
            className="font-heading text-xs font-semibold text-[var(--frame-muted)] uppercase"
          >
            Search
          </label>
          <TransactionSearchInput
            onSearchChange={setSearchFilter}
            value={pageFilters.search ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="reference-transactions-date-jump"
            className="font-heading text-xs font-semibold text-[var(--frame-muted)] uppercase"
          >
            Go to day
          </label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={dateJumpLoading}
              onClick={(event) => {
                dateJumpFocusRestoreRef.current = event.currentTarget;
                jumpToAdjacentDate(-1);
              }}
            >
              <ChevronLeft aria-hidden="true" />
              Previous day
            </Button>
            <input
              id="reference-transactions-date-jump"
              type="date"
              className="bg-card text-foreground h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)] aria-disabled:opacity-70"
              value={dateJumpValue}
              readOnly={dateJumpLoading}
              aria-disabled={dateJumpLoading}
              onChange={(event) => {
                const nextValue = event.target.value;
                setDateJumpValue(nextValue);
                void jumpToDate(nextValue);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }
                event.preventDefault();
                void jumpToDate(event.currentTarget.value);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={dateJumpLoading}
              onClick={(event) => {
                dateJumpFocusRestoreRef.current = event.currentTarget;
                jumpToAdjacentDate(1);
              }}
            >
              <ChevronRight aria-hidden="true" />
              Next day
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="reference-transactions-class"
            className="font-heading text-xs font-semibold text-[var(--frame-muted)] uppercase"
          >
            Class
          </label>
          <select
            id="reference-transactions-class"
            className="bg-card text-foreground h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
            value={pageFilters.classes[0] ?? "all"}
            onChange={(event) => {
              setTransactionClassFilter(event.target.value);
            }}
          >
            <option value="all">All classes</option>
            {transactionClasses.map((transactionClass) => (
              <option key={transactionClass} value={transactionClass}>
                {transactionClassLabel(transactionClass)}
              </option>
            ))}
          </select>
        </div>
        {showExactOnlyToggle ? (
          <label className="font-heading mt-5 inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-[var(--frame-foreground)] uppercase">
            <Checkbox
              ref={scopeToggleRef}
              checked={exactOnly === true}
              onCheckedChange={(checked) => {
                restoreScopeToggleFocusRef.current = Boolean(
                  selectedTransactionId,
                );
                onExactOnlyChange?.(checked === true);
              }}
            />
            This level only
          </label>
        ) : null}
        <div className="mt-5 flex min-w-9 flex-1">
          <TransactionFilterControls
            filters={pageFilters}
            hiddenDimensions={hiddenFilterDimensions}
            lookups={lookups.snapshot}
            onChange={setTransactionFilters}
          />
        </div>
      </div>
      <div
        className="min-h-0 flex-1"
        data-transaction-detail-restore-target
        tabIndex={-1}
      >
        <TransactionBrowser
          errorMessage={errorMessage}
          hasNextPage={
            transactions
              ? totalCount === undefined
                ? transactions.length === pageSize
                : page * pageSize < totalCount
              : false
          }
          loading={loading}
          lookups={lookups.snapshot}
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
          onDeleteTransaction={deleteTransactionFromRow}
          onNextPage={() => {
            setPage(page + 1);
          }}
          onOpenTransaction={openTransactionDetail}
          onPageSizeChange={(nextPageSize) => {
            cancelDateJump();
            setSearchParams((current) => {
              const next = new URLSearchParams(current);
              next.set("page", String(defaultTransactionPage));
              next.set("pageSize", String(nextPageSize));
              return next;
            });
          }}
          onPreviousPage={() => {
            setPage(Math.max(defaultTransactionPage, page - 1));
          }}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          transactions={transactions}
        />
      </div>
      <Toast
        key={notice?.id ?? "empty"}
        className="text-[var(--color-money-in)]"
        durationMs={toastDurationMs}
        message={notice?.message}
        onDismiss={() => {
          setNotice(undefined);
        }}
      />
      {selectedTransactionId ? (
        <TransactionDetailPanel
          errorMessage={detailErrorMessage}
          loading={detailLoading}
          lookups={lookups.snapshot}
          onClose={closeTransactionDetail}
          onDelete={deleteSelectedTransaction}
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
          transaction={detailTransaction}
        />
      ) : null}
    </div>
  );
};
