import {
  ChevronDown,
  ChevronRight,
  Open,
  Plus,
  Trash,
} from "pixelarticons/react";
import {
  type FocusEvent,
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { DisplayAmount, JournalRecord, Tag, Transaction } from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RowActions } from "@/components/row-actions";
import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useElementOverflow } from "@/hooks/use-element-overflow";
import { cn } from "@/lib/utils";
import type { LedgerLookupsSnapshot } from "@/store";

import { AmountText, MixedAmounts } from "./amount-text";
import {
  buildLookupMaps,
  displayAmountKey,
  formatInitiatedDate,
  formatInitiatedDateParts,
  lineCategory,
  lineDisplayAmounts,
  lineMember,
  lineMemo,
  linePostingStatus,
  lineTags,
  type LookupMaps,
} from "./format";
import { FqnPath } from "./fqn-path";
import { ClassIcon, StatusIcon } from "./line-icons";
import { MemberChip } from "./member-chip";
import { TagChip, tagChipMicroHeightClass } from "./tag-chip";
import { TransactionDeleteAmountSummary } from "./transaction-detail-panel";

interface TransactionBrowserProps {
  readonly errorMessage: string | undefined;
  readonly hasNextPage: boolean;
  readonly loading: boolean;
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly onFilterCategory?: (categoryId: number) => void;
  readonly onFilterMember?: (memberId: number) => void;
  readonly onFilterTag?: (tagId: number) => void;
  readonly onNewTransaction: () => void;
  readonly onDeleteTransaction: (transaction: Transaction) => Promise<void>;
  readonly onNextPage: () => void;
  readonly onOpenTransaction: (
    transaction: Transaction,
    opener?: HTMLElement,
  ) => void;
  readonly onPageSizeChange: (pageSize: number) => void;
  readonly onPreviousPage: () => void;
  readonly onDeleteConfirmationOpenChange?: (open: boolean) => void;
  readonly onRowActionsOverflowOpenChange?: (open: boolean) => void;
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number | undefined;
  readonly transactions: readonly Transaction[] | undefined;
}

const pageSizeOptions = [10, 25, 50] as const;

const recordDisplayAmount = (record: JournalRecord): DisplayAmount => ({
  amount: record.amount,
  currency: record.currency,
});

const EmptyStateSprite = () => (
  <svg
    aria-hidden="true"
    className="text-primary mx-auto size-16"
    viewBox="0 0 64 64"
    fill="none"
  >
    <path fill="currentColor" d="M12 12h40v8H12zM8 20h48v32H8z" />
    <path fill="var(--background)" d="M16 28h32v4H16zM16 38h20v4H16z" />
    <path fill="var(--color-class-income-bright)" d="M44 36h8v8h-8z" />
    <path fill="var(--border-ink)" d="M8 52h48v4H8zM52 20h4v32h-4z" />
  </svg>
);

const LoadingRows = () => (
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
);

const clippedTagChipSlopPx = 0.5;
const emptyClippedTagIds: ReadonlySet<number> = new Set();
const transactionRowSelector = "[data-transaction-row='true']";

const sameTagIdSet = (
  left: ReadonlySet<number>,
  right: ReadonlySet<number>,
): boolean =>
  left.size === right.size && Array.from(left).every((id) => right.has(id));

const useClippedTagIds = (
  element: HTMLDivElement | null,
  isOverflowing: boolean,
  tagIdsKey: string,
): ReadonlySet<number> => {
  const [clippedTagIds, setClippedTagIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );

  useLayoutEffect(() => {
    if (!element || !isOverflowing) {
      return;
    }

    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const clipRect = element.getBoundingClientRect();
        const overflowTrigger = element.parentElement
          ?.querySelector<HTMLElement>(
            "[data-testid='transaction-tags-overflow']",
          )
          ?.closest<HTMLElement>("[tabindex]");
        const overflowRect = overflowTrigger?.getBoundingClientRect();
        const nextClippedTagIds = new Set<number>();

        for (const child of element.children) {
          if (!(child instanceof HTMLElement)) {
            continue;
          }
          const tagId = Number(child.dataset.tagId);
          if (!Number.isFinite(tagId)) {
            continue;
          }

          const rect = child.getBoundingClientRect();
          const overlapsOverflowChip =
            overflowRect !== undefined &&
            rect.left < overflowRect.right + clippedTagChipSlopPx &&
            rect.right > overflowRect.left - clippedTagChipSlopPx &&
            rect.top < overflowRect.bottom + clippedTagChipSlopPx &&
            rect.bottom > overflowRect.top - clippedTagChipSlopPx;
          if (
            rect.left < clipRect.left - clippedTagChipSlopPx ||
            rect.right > clipRect.right + clippedTagChipSlopPx ||
            rect.top < clipRect.top - clippedTagChipSlopPx ||
            rect.bottom > clipRect.bottom + clippedTagChipSlopPx ||
            overlapsOverflowChip
          ) {
            nextClippedTagIds.add(tagId);
          }
        }

        setClippedTagIds((current) =>
          sameTagIdSet(current, nextClippedTagIds)
            ? current
            : nextClippedTagIds,
        );
      });
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(element);
    for (const child of element.children) {
      if (child instanceof HTMLElement) {
        resizeObserver.observe(child);
      }
    }
    window.addEventListener("resize", measure);
    measure();

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      resizeObserver.disconnect();
    };
  }, [element, isOverflowing, tagIdsKey]);

  return element && isOverflowing ? clippedTagIds : emptyClippedTagIds;
};

const TagChipsLine = ({
  onFilterTag,
  tags,
}: {
  readonly onFilterTag?: (tagId: number) => void;
  readonly tags: readonly Tag[];
}) => {
  const { isOverflowing, ref } = useElementOverflow<HTMLDivElement>();
  const rootRef = useRef<HTMLDivElement>(null);
  const focusedTagIdRef = useRef<number | null>(null);
  const [tagListElement, setTagListElement] = useState<HTMLDivElement | null>(
    null,
  );
  const fullLabel = tags.map((tag) => tag.fqn).join(", ");
  const tagIdsKey = tags.map((tag) => tag.tag_id).join(":");
  const clippedTagIds = useClippedTagIds(
    tagListElement,
    isOverflowing,
    tagIdsKey,
  );
  const setTagListRef = useCallback(
    (nextElement: HTMLDivElement | null) => {
      ref(nextElement);
      setTagListElement(nextElement);
    },
    [ref],
  );
  const handleTagListFocusCapture = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const focusedTagElement = Array.from(tagListElement?.children ?? []).find(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && child.contains(event.target),
      );
      const focusedTagId = Number(focusedTagElement?.dataset.tagId);
      focusedTagIdRef.current = Number.isFinite(focusedTagId)
        ? focusedTagId
        : null;
    },
    [tagListElement],
  );

  useLayoutEffect(() => {
    if (!tagListElement || clippedTagIds.size === 0) {
      return;
    }

    const focusedTagId = focusedTagIdRef.current;
    if (focusedTagId === null || !clippedTagIds.has(focusedTagId)) {
      return;
    }

    const overflowContent = rootRef.current?.querySelector<HTMLElement>(
      "[data-testid='transaction-tags-overflow']",
    );
    const overflowTrigger = overflowContent?.closest<HTMLElement>("[tabindex]");
    const firstVisibleTagTrigger = Array.from(tagListElement.children)
      .filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement &&
          !clippedTagIds.has(Number(child.dataset.tagId)),
      )
      .map((child) => child.querySelector<HTMLElement>("[tabindex]"))
      .find((trigger): trigger is HTMLElement => Boolean(trigger));

    focusWithoutTooltip(overflowTrigger ?? firstVisibleTagTrigger, {
      preventScroll: true,
    });
  }, [clippedTagIds, tagListElement]);

  return (
    <div
      ref={rootRef}
      className={cn(
        tagChipMicroHeightClass,
        "relative max-w-full min-w-0 overflow-visible",
      )}
    >
      <div
        ref={setTagListRef}
        data-testid="transaction-tag-chips-list"
        onFocusCapture={handleTagListFocusCapture}
        className={cn(
          // Two micro chip rows: chip height, one row gap, and room for chip shadow.
          tagChipMicroHeightClass,
          "flex max-h-[calc(var(--tag-chip-micro-height)+var(--tag-chip-micro-height)+var(--tag-chip-row-gap)+var(--tag-chip-shadow-room))] min-h-[var(--tag-chip-micro-height)] w-full max-w-full min-w-0 flex-wrap gap-x-1 gap-y-[var(--tag-chip-row-gap)] overflow-hidden pr-[var(--tag-chip-shadow-room)] pb-[var(--tag-chip-shadow-room)] [--tag-chip-row-gap:0.25rem] [--tag-chip-shadow-room:2px]",
        )}
      >
        {tags.map((tag) => {
          const isClipped = clippedTagIds.has(tag.tag_id);
          return (
            <span
              key={tag.tag_id}
              aria-hidden={isClipped ? true : undefined}
              className={cn("inline-flex shrink-0", isClipped && "invisible")}
              data-tag-id={tag.tag_id}
            >
              <TagChip
                label={tag.name}
                micro
                tooltip={tag.fqn}
                onActivate={
                  onFilterTag
                    ? () => {
                        onFilterTag(tag.tag_id);
                      }
                    : undefined
                }
              />
            </span>
          );
        })}
      </div>
      {isOverflowing ? (
        <Tooltip
          label={fullLabel}
          className="bg-card text-foreground absolute right-0 bottom-0 inline-flex h-[var(--tag-chip-micro-height)] w-4 items-center justify-center border border-[var(--border-ink)] font-mono text-[11px] leading-none shadow-[var(--shadow-chip)]"
        >
          <span data-testid="transaction-tags-overflow">…</span>
        </Tooltip>
      ) : null}
    </div>
  );
};

const MixedSentinel = ({ label = "Mixed" }: { readonly label?: string }) => (
  <span className="font-heading text-foreground bg-card inline-flex h-5 items-center border border-[var(--border-ink)] px-1.5 text-[11px] font-semibold uppercase shadow-[var(--shadow-chip)]">
    {label}
  </span>
);

const RecordStatus = ({ record }: { readonly record: JournalRecord }) => (
  <span>{record.posting_status === "posted" ? "" : record.posting_status}</span>
);

const interactiveTargetSelector =
  "a, button, input, select, textarea, summary, [role='button'], " +
  "[contenteditable='true'], " +
  "[tabindex]:not([tabindex='-1']):not([data-slot='tooltip-trigger'])";

const isInteractiveTarget = (
  target: EventTarget | null,
  currentTarget: HTMLElement,
): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const interactiveTarget = target.closest(interactiveTargetSelector);
  return interactiveTarget !== null && interactiveTarget !== currentTarget;
};

const RecordsTable = ({
  maps,
  records,
}: {
  readonly maps: LookupMaps;
  readonly records: readonly JournalRecord[];
}) => (
  <div
    className="bg-muted box-border w-full max-w-full overflow-x-auto p-3"
    data-testid="expanded-records"
  >
    <table className="w-full table-fixed border-collapse text-sm">
      <thead>
        <tr className="font-heading text-foreground border-b border-[var(--border-ink)] bg-[var(--table-header)] text-left text-xs font-semibold uppercase">
          <th className="w-[20%] px-2 py-2">Account</th>
          <th className="w-[14%] px-2 py-2 text-right">Amount</th>
          <th className="w-[16%] px-2 py-2">Category</th>
          <th className="w-[14%] px-2 py-2">Tags</th>
          <th className="w-[8%] px-2 py-2">Member</th>
          <th className="w-[10%] px-2 py-2">Status</th>
          <th className="w-[18%] px-2 py-2">Memo</th>
        </tr>
      </thead>
      <tbody>
        {records.map((record) => {
          const account = maps.accountsById.get(record.account_id);
          const category = maps.categoriesById.get(record.category_id);
          const member = record.member_id
            ? maps.membersById.get(record.member_id)
            : undefined;
          const tagLabels = record.tag_ids
            .map((tagId) => maps.tagsById.get(tagId)?.name)
            .filter((value): value is string => Boolean(value));

          return (
            <tr
              key={record.record_id}
              className={cn(
                "bg-card border-b border-[var(--hairline)] align-top last:border-b-0",
                record.posting_status === "cancelled" &&
                  "text-muted-foreground line-through",
              )}
            >
              <td className="px-2 py-2">
                {account ? <FqnPath value={account.fqn} /> : "Unknown account"}
              </td>
              <td className="px-2 py-2 text-right">
                <AmountText
                  amount={recordDisplayAmount(record)}
                  tone="neutral"
                />
              </td>
              <td className="px-2 py-2">
                {category ? <FqnPath value={category.fqn} /> : "Uncategorized"}
              </td>
              <td className="px-2 py-2">{tagLabels.join(", ")}</td>
              <td className="px-2 py-2">{member?.name ?? ""}</td>
              <td className="px-2 py-2">
                <RecordStatus record={record} />
              </td>
              <td className="text-muted-foreground px-2 py-2 break-words whitespace-normal">
                {record.memo}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export const TransactionBrowser = ({
  errorMessage,
  hasNextPage,
  loading,
  lookups,
  onFilterCategory,
  onFilterMember,
  onFilterTag,
  onNewTransaction,
  onDeleteTransaction,
  onNextPage,
  onOpenTransaction,
  onPageSizeChange,
  onPreviousPage,
  onDeleteConfirmationOpenChange,
  onRowActionsOverflowOpenChange,
  page,
  pageSize,
  totalCount,
  transactions,
}: TransactionBrowserProps) => {
  const [expandedTransactionIds, setExpandedTransactionIds] = useState<
    ReadonlySet<number>
  >(new Set());
  const [deleteDialog, setDeleteDialog] = useState<{
    readonly opener: HTMLElement;
    readonly rowIndex: number;
    readonly transaction: Transaction;
  }>();
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<
    string | undefined
  >();
  const [deleting, setDeleting] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const deletedRowFocusIndexRef = useRef<number | undefined>(undefined);
  const maps = useMemo(() => buildLookupMaps(lookups), [lookups]);

  useEffect(() => {
    const open = Boolean(deleteDialog);
    onDeleteConfirmationOpenChange?.(open);
    return () => {
      if (open) {
        onDeleteConfirmationOpenChange?.(false);
      }
    };
  }, [deleteDialog, onDeleteConfirmationOpenChange]);

  const closeDeleteConfirmation = () => {
    if (deleting) {
      return;
    }
    const opener = deleteDialog?.opener;
    setDeleteErrorMessage(undefined);
    setDeleteDialog(undefined);
    window.requestAnimationFrame(() => {
      focusWithoutTooltip(opener, { preventScroll: true });
    });
  };

  const confirmDelete = useCallback(async () => {
    if (!deleteDialog) {
      return;
    }

    setDeleting(true);
    setDeleteErrorMessage(undefined);
    try {
      await onDeleteTransaction(deleteDialog.transaction);
      deletedRowFocusIndexRef.current = deleteDialog.rowIndex;
      setDeleteDialog(undefined);
    } catch (error) {
      setDeleteErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
    } finally {
      setDeleting(false);
    }
  }, [deleteDialog, onDeleteTransaction]);

  useLayoutEffect(() => {
    if (deleteDialog || deletedRowFocusIndexRef.current === undefined) {
      return;
    }

    const rowIndex = deletedRowFocusIndexRef.current;
    deletedRowFocusIndexRef.current = undefined;
    window.requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root) {
        return;
      }

      const rows = Array.from(
        root.querySelectorAll<HTMLElement>(transactionRowSelector),
      );
      const nextRowIndex = Math.min(rowIndex, rows.length - 1);
      const target =
        rows[nextRowIndex] ??
        root.querySelector<HTMLElement>(
          "[data-testid='transactions-pagination-footer'] button:not(:disabled)",
        ) ??
        root.querySelector<HTMLElement>(
          "[data-testid='transactions-pagination-footer']",
        ) ??
        root.querySelector<HTMLElement>("[data-transaction-empty-action]");

      focusWithoutTooltip(target, { preventScroll: true });
    });
  }, [deleteDialog, transactions]);

  if (loading && !transactions) {
    return <LoadingRows />;
  }

  if (errorMessage) {
    return (
      <div className="border-destructive bg-card border-2 p-4" role="alert">
        <p className="text-destructive font-semibold">
          Transactions could not be loaded.
        </p>
        <details className="text-muted-foreground mt-3 text-sm">
          <summary className="text-foreground cursor-pointer">
            API error
          </summary>
          <pre className="mt-2 overflow-auto font-mono text-xs whitespace-pre-wrap">
            {errorMessage}
          </pre>
        </details>
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div
        ref={rootRef}
        className="border-border bg-card border p-10 text-center"
      >
        <EmptyStateSprite />
        <h2 className="text-pixel mt-4 text-base">No transactions</h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">
          Transaction lines appear here after activity is created or demo data
          is seeded.
        </p>
        <Button
          type="button"
          className="mt-5"
          data-transaction-empty-action
          onClick={onNewTransaction}
        >
          <Plus aria-hidden="true" />
          New transaction
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="flex h-full min-h-0 flex-col gap-3"
      aria-busy={loading ? "true" : undefined}
    >
      <div
        className="transactions-table-scroll bg-card min-h-0 flex-1 overflow-auto border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
        data-testid="transactions-table-scroll"
      >
        <table className="transactions-table w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="transactions-class-column" />
            <col className="transactions-date-column" />
            <col className="transactions-status-column" />
            <col className="transactions-description-column" />
            <col className="transactions-category-column" />
            <col className="transactions-tags-column" />
            <col className="transactions-member-column" />
            <col className="transactions-amount-column" />
            <col className="transactions-actions-column" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[var(--table-header)]">
            <tr className="font-heading text-foreground border-b-2 border-[var(--border-ink)] text-left text-xs font-semibold uppercase">
              <th className="transactions-class-column px-3 py-2">
                <span className="sr-only min-[1920px]:not-sr-only">Class</span>
              </th>
              <th className="transactions-date-column px-3 py-2">Date</th>
              <th className="transactions-status-column px-1 py-2">
                <span className="sr-only">Status</span>
              </th>
              <th className="transactions-description-column px-3 py-2">
                Description
              </th>
              <th className="transactions-category-column px-3 py-2">
                Category
              </th>
              <th className="transactions-tags-column px-3 py-2">Tags</th>
              <th className="transactions-member-column px-3 py-2">Member</th>
              <th className="transactions-amount-column px-3 py-2 text-right">
                Amount
              </th>
              <th className="transactions-actions-column px-2 py-2 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction, transactionIndex) => {
              const expanded = expandedTransactionIds.has(
                transaction.transaction_id,
              );
              const title = transaction.display_title;
              const initiatedDate = formatInitiatedDateParts(
                transaction.initiated_date,
              );
              const memo = lineMemo(transaction);
              const category = lineCategory(transaction, maps);
              const tags = lineTags(transaction, maps);
              const member = lineMember(transaction, maps);
              const postingStatus = linePostingStatus(transaction);
              const amounts = lineDisplayAmounts(transaction, maps);
              const amountDeemphasized =
                postingStatus === "expected" ||
                postingStatus === "pending" ||
                postingStatus === "cancelled";
              const lineInactive = postingStatus === "cancelled";
              const toggleExpanded = () => {
                setExpandedTransactionIds((current) => {
                  const next = new Set(current);
                  if (next.has(transaction.transaction_id)) {
                    next.delete(transaction.transaction_id);
                  } else {
                    next.add(transaction.transaction_id);
                  }
                  return next;
                });
              };

              return (
                <Fragment key={transaction.transaction_id}>
                  <tr
                    className={cn(
                      "cursor-pointer border-b border-[var(--hairline)] align-middle hover:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]",
                      transactionIndex % 2 === 0
                        ? "bg-card"
                        : "bg-[var(--band)]",
                      lineInactive && "text-muted-foreground line-through",
                    )}
                    aria-expanded={expanded}
                    data-transaction-row="true"
                    tabIndex={0}
                    onClick={(event) => {
                      if (
                        isInteractiveTarget(event.target, event.currentTarget)
                      ) {
                        return;
                      }
                      toggleExpanded();
                    }}
                    onKeyDown={(event) => {
                      if (
                        isInteractiveTarget(event.target, event.currentTarget)
                      ) {
                        return;
                      }

                      if (event.key === "Enter") {
                        event.preventDefault();
                        onOpenTransaction(transaction, event.currentTarget);
                        return;
                      }

                      if (event.key !== " ") {
                        return;
                      }

                      event.preventDefault();
                      toggleExpanded();
                    }}
                  >
                    <td className="transactions-class-column px-3 py-2">
                      <ClassIcon
                        transactionClass={transaction.transaction_class}
                      />
                    </td>
                    <td className="transactions-date-column px-3 py-2 font-mono">
                      <div>{initiatedDate.day}</div>
                      <div className="text-muted-foreground text-xs">
                        {initiatedDate.year}
                      </div>
                    </td>
                    <td className="transactions-status-column px-1 py-2">
                      {postingStatus === "mixed" ? (
                        <MixedSentinel />
                      ) : (
                        <StatusIcon status={postingStatus} />
                      )}
                    </td>
                    <td className="transactions-description-column px-3 py-2">
                      <div
                        className={cn(
                          "flex min-w-0 gap-2",
                          memo ? "items-start" : "items-center",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-6 shrink-0 place-items-center",
                            memo && "mt-0.5",
                          )}
                          aria-hidden="true"
                        >
                          {expanded ? (
                            <ChevronDown
                              className="size-4"
                              aria-hidden="true"
                            />
                          ) : (
                            <ChevronRight
                              className="size-4"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <div
                          className={cn(
                            "grid min-w-0 flex-1",
                            memo ? "items-start" : "items-center",
                          )}
                        >
                          <div className="min-w-0">
                            <Tooltip label={title} className="block min-w-0">
                              <div
                                className="truncate font-medium"
                                data-testid="transaction-line-title"
                              >
                                {title}
                              </div>
                            </Tooltip>
                            {memo ? (
                              <Tooltip label={memo} className="block min-w-0">
                                <div
                                  className="text-muted-foreground truncate text-xs"
                                  data-testid="transaction-line-memo"
                                >
                                  {memo}
                                </div>
                              </Tooltip>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="transactions-category-column px-3 py-2">
                      {category === "mixed" ? (
                        <MixedSentinel />
                      ) : category ? (
                        <FqnPath
                          value={category.fqn}
                          variant="leaf-chip"
                          onActivate={
                            onFilterCategory
                              ? () => {
                                  onFilterCategory(category.category_id);
                                }
                              : undefined
                          }
                        />
                      ) : null}
                    </td>
                    <td className="transactions-tags-column px-3 py-1">
                      <div className="min-w-0 overflow-visible pb-0.5">
                        {tags === "mixed" ? (
                          <MixedSentinel />
                        ) : (
                          <TagChipsLine tags={tags} onFilterTag={onFilterTag} />
                        )}
                      </div>
                    </td>
                    <td className="transactions-member-column px-3 py-2">
                      <div className="overflow-visible pb-0.5">
                        {member === "mixed" ? (
                          <MixedSentinel />
                        ) : member ? (
                          <MemberChip
                            name={member.name}
                            onActivate={
                              onFilterMember
                                ? () => {
                                    onFilterMember(member.member_id);
                                  }
                                : undefined
                            }
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="transactions-amount-column px-3 py-2 text-right align-middle">
                      <div className="flex min-w-0 flex-row flex-nowrap items-center justify-end gap-1 overflow-visible">
                        {transaction.transaction_class === "mixed" ? (
                          <MixedAmounts amounts={amounts} />
                        ) : (
                          amounts.map((amount) => (
                            <AmountText
                              key={displayAmountKey(amount)}
                              amount={amount}
                              chip
                              className={cn(
                                "max-w-full",
                                amountDeemphasized &&
                                  "text-muted-foreground bg-card",
                              )}
                              positiveSign={
                                transaction.transaction_class !== "transfer" &&
                                transaction.transaction_class !==
                                  "currency_exchange"
                              }
                              tone="neutral"
                            />
                          ))
                        )}
                      </div>
                    </td>
                    <td className="transactions-actions-column px-2 py-2 text-right align-middle">
                      <RowActions
                        foldable
                        onOverflowOpenChange={onRowActionsOverflowOpenChange}
                        actions={[
                          {
                            icon: <Open aria-hidden="true" />,
                            label: "Open transaction detail",
                            onSelect: (opener) => {
                              onOpenTransaction(transaction, opener);
                            },
                          },
                          {
                            icon: <Trash aria-hidden="true" />,
                            label: "Delete transaction",
                            onSelect: (opener) => {
                              setDeleteErrorMessage(undefined);
                              setDeleteDialog({
                                opener,
                                rowIndex: transactionIndex,
                                transaction,
                              });
                            },
                          },
                        ]}
                      />
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="border-b border-[var(--border-ink)]">
                      <td colSpan={9} className="max-w-0 overflow-hidden p-0">
                        <RecordsTable
                          records={transaction.records}
                          maps={maps}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="bg-card flex shrink-0 flex-col gap-3 border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)] sm:flex-row sm:items-center sm:justify-between"
        data-testid="transactions-pagination-footer"
        tabIndex={-1}
      >
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="transactions-page-size" className="font-medium">
            Rows
          </label>
          <select
            id="transactions-page-size"
            className="bg-card h-8 border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]"
            value={pageSize}
            onChange={(event) => {
              onPageSizeChange(Number(event.target.value));
            }}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          {loading ? (
            <span
              className="text-muted-foreground font-mono text-xs"
              data-testid="transactions-page-busy"
              role="status"
            >
              Loading
            </span>
          ) : null}
          <span className="text-muted-foreground font-mono text-sm">
            Page {page}
            {totalCount === undefined
              ? ""
              : ` of ${Math.max(1, Math.ceil(totalCount / pageSize))}`}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onPreviousPage}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onNextPage}
            disabled={!hasNextPage}
          >
            Next
          </Button>
        </div>
      </div>
      <ConfirmationDialog
        confirmIcon={<Trash aria-hidden="true" />}
        confirmLabel="Delete transaction"
        errorMessage={deleteErrorMessage}
        onConfirm={() => {
          void confirmDelete();
        }}
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteConfirmation();
          }
        }}
        open={Boolean(deleteDialog)}
        pending={deleting}
        pendingLabel="Deleting"
        title="Delete transaction"
      >
        {deleteDialog ? (
          <>
            <p>
              Delete {deleteDialog.transaction.display_title} from{" "}
              {formatInitiatedDate(deleteDialog.transaction.initiated_date)} for{" "}
              <TransactionDeleteAmountSummary
                transaction={deleteDialog.transaction}
              />
              ?
            </p>
            <p>
              This tombstones the transaction and removes it from default
              transaction lists.
            </p>
          </>
        ) : null}
      </ConfirmationDialog>
    </div>
  );
};
