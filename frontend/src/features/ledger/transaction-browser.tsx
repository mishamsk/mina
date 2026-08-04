import {
  CardText,
  Check,
  Close,
  Copy,
  Pencil,
  Plus,
  Reload,
  Scissors,
  Trash,
  WarningDiamond,
} from "pixelarticons/react";
import {
  type FocusEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { Tag, Transaction } from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RowActions } from "@/components/row-actions";
import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { transactionTemplateRecordsFromTransaction } from "@/features/templates";
import { useElementOverflow } from "@/hooks/use-element-overflow";
import { cn } from "@/lib/utils";
import type { LedgerLookupsSnapshot } from "@/store";
import {
  openNewTemplateEditor,
  setTransactionAmountDraftInvalid,
  setTransactionAmountSavePending,
  useTransactionEditModeStore,
} from "@/store";
import { localTodayISODate } from "@/utils/date";

import { AmountText } from "./amount-text";
import {
  type EditModeSkipSummary,
  summarizeEditModeSkips,
} from "./edit-mode-prediction";
import {
  buildLookupMaps,
  canSplitTransaction,
  displayAmountKey,
  formatInitiatedDate,
  formatInitiatedDateParts,
  isActiveWhollyPendingTransaction,
  isExpectedRecurringOccurrence,
  lineCategory,
  lineDisplayAmounts,
  lineMember,
  lineMemo,
  lineStatus,
  lineTags,
  simpleTransactionAmountRecords,
  transactionAccountFqnContext,
  transactionHasMoreParts,
} from "./format";
import { FqnPath } from "./fqn-path";
import { ClassIcon, StatusIcon } from "./line-icons";
import { MemberChip } from "./member-chip";
import { MixedSentinel, MorePartsIndicator } from "./mixed-sentinel";
import {
  defaultPostSettlementDateTimeValue,
  settlementDateTimeToISO,
} from "./settlement-date";
import { TagChip, tagChipMicroHeightClass } from "./tag-chip";
import { TransactionAmountInput } from "./transaction-amount-input";
import type { AmountSavePageRefresh } from "./transaction-amount-update";
import { TransactionDeleteDescription } from "./transaction-delete-description";
import {
  type EditDockAction,
  type EditDockUpdate,
  TransactionEditDock,
} from "./transaction-edit-dock";
import { transactionPageSizeOptions } from "./transaction-page-position";
import { TransactionPostDialog } from "./transaction-post-dialog";
import {
  focusTransactionRowFallback,
  transactionRowSelector,
} from "./transaction-row-focus";

interface TransactionBrowserProps {
  readonly editMode: boolean;
  readonly dateJumpAnchor?: {
    readonly date: string;
    readonly page: number;
  };
  readonly errorMessage: string | undefined;
  readonly hasNextPage: boolean;
  readonly loading: boolean;
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly onConfirmRecurringOccurrence: (
    transaction: Transaction,
  ) => Promise<void>;
  readonly onChangeTransactionLifecycle: (
    transaction: Transaction,
    action: "cancel" | "restore",
  ) => Promise<void>;
  readonly onFilterCategory?: (categoryId: number) => void;
  readonly onFilterMember?: (memberId: number) => void;
  readonly onFilterTag?: (tagId: number) => void;
  readonly onClearSelection: () => void;
  readonly onNewTransaction: () => void;
  readonly onDeleteTransaction: (transaction: Transaction) => Promise<void>;
  readonly onDismissRecurringOccurrence: (
    transaction: Transaction,
  ) => Promise<void>;
  readonly onDuplicateTransaction?: (
    transaction: Transaction,
    opener?: HTMLElement,
  ) => void;
  readonly onEditTransaction?: (
    transaction: Transaction,
    opener?: HTMLElement,
  ) => void;
  readonly onNextPage: () => void;
  readonly onOpenTransaction: (
    transaction: Transaction,
    opener?: HTMLElement,
  ) => void;
  readonly onPageSizeChange: (pageSize: number) => void;
  readonly onPreviousPage: () => void;
  readonly onPostTransaction: (
    transaction: Transaction,
    postedDate?: string,
  ) => Promise<void>;
  readonly onSetEditMode: (enabled: boolean) => void;
  readonly onSplitTransaction?: (
    transaction: Transaction,
    opener?: HTMLElement,
  ) => void;
  readonly onSelectRange: (transactionIds: readonly number[]) => void;
  readonly onTogglePageSelection: () => void;
  readonly onToggleSelection: (transactionId: number) => void;
  readonly onUpdateTransactionAmount: (
    transaction: Transaction,
    amount: string,
    onPageRefresh?: AmountSavePageRefresh,
  ) => Promise<boolean | void>;
  readonly onUpdateTransactionsEditReferences?: (
    transactions: readonly Transaction[],
    update: EditDockUpdate,
  ) => Promise<void>;
  readonly onUpdateTransactionsEditRecordState: (
    transactions: readonly Transaction[],
    update:
      | {
          readonly kind: "reconciliation";
          readonly value: "reconciled" | "unreconciled";
        }
      | { readonly kind: "settlement"; readonly value: "pending" | "posted" },
  ) => Promise<void>;
  readonly page: number;
  readonly pageSize: number;
  readonly refreshErrorMessage: string | undefined;
  readonly selectedTransactionIds: ReadonlySet<number>;
  readonly selectedTransactions: readonly Transaction[];
  readonly totalCount: number | undefined;
  readonly transactions: readonly Transaction[] | undefined;
}

const dateJumpTargetTransaction = (
  transactions: readonly Transaction[],
  anchorDate: string,
): Transaction | undefined =>
  transactions.find(
    (transaction) => transaction.initiated_date <= anchorDate,
  ) ?? transactions.at(-1);

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
        className="grid grid-cols-[5fr_10fr_31fr_13fr_15fr_7fr_14fr_5fr] gap-3 border-b border-[var(--hairline)] p-3 last:border-b-0"
      >
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

const TransactionErrorCard = ({
  heading,
  message,
  summary,
}: {
  readonly heading: string;
  readonly message: string;
  readonly summary: string;
}) => (
  <div className="border-destructive bg-card border-2 p-4" role="alert">
    <p className="text-destructive font-semibold">{heading}</p>
    <details className="text-muted-foreground mt-3 text-sm">
      <summary className="text-foreground cursor-pointer">{summary}</summary>
      <pre className="mt-2 overflow-auto font-mono text-xs whitespace-pre-wrap">
        {message}
      </pre>
    </details>
  </div>
);

const clippedTagChipSlopPx = 0.5;
const emptyClippedTagIds: ReadonlySet<number> = new Set();

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
        "relative flex min-h-6 max-w-full min-w-0 items-center overflow-visible",
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

const interactiveTargetSelector =
  "a, button, input, select, textarea, summary, [role='button'], " +
  "[contenteditable='true'], [data-transaction-row-interactive], " +
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

export const TransactionBrowser = ({
  editMode,
  dateJumpAnchor,
  errorMessage,
  hasNextPage,
  loading,
  lookups,
  onConfirmRecurringOccurrence,
  onChangeTransactionLifecycle,
  onClearSelection,
  onFilterCategory,
  onFilterMember,
  onFilterTag,
  onNewTransaction,
  onDeleteTransaction,
  onDismissRecurringOccurrence,
  onDuplicateTransaction,
  onEditTransaction,
  onNextPage,
  onOpenTransaction,
  onPageSizeChange,
  onPreviousPage,
  onPostTransaction,
  onSetEditMode,
  onSplitTransaction,
  onSelectRange,
  onTogglePageSelection,
  onToggleSelection,
  onUpdateTransactionAmount,
  onUpdateTransactionsEditReferences,
  onUpdateTransactionsEditRecordState,
  page,
  pageSize,
  refreshErrorMessage,
  selectedTransactionIds,
  selectedTransactions,
  totalCount,
  transactions,
}: TransactionBrowserProps) => {
  const [deleteDialog, setDeleteDialog] = useState<{
    readonly opener: HTMLElement;
    readonly rowIndex: number;
    readonly transaction: Transaction;
  }>();
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<
    string | undefined
  >();
  const [postDialog, setPostDialog] = useState<{
    readonly opener: HTMLElement;
    readonly postedDateTime: string;
    readonly rowIndex: number;
    readonly sourcePostedDate: string;
    readonly transaction: Transaction;
  }>();
  const [postErrorMessage, setPostErrorMessage] = useState<
    string | undefined
  >();
  const [dismissDialog, setDismissDialog] = useState<{
    readonly opener: HTMLElement;
    readonly rowIndex: number;
    readonly transaction: Transaction;
  }>();
  const [dismissErrorMessage, setDismissErrorMessage] = useState<
    string | undefined
  >();
  const [deleting, setDeleting] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [confirmingOccurrenceId, setConfirmingOccurrenceId] = useState<
    number | undefined
  >();
  const [occurrenceActionErrorMessage, setOccurrenceActionErrorMessage] =
    useState<string | undefined>();
  const [lifecycleActionsBusy, setLifecycleActionsBusy] = useState<
    ReadonlyMap<number, "cancel" | "post" | "restore">
  >(() => new Map());
  const [lifecycleActionErrorMessage, setLifecycleActionErrorMessage] =
    useState<string>();
  const [dateJumpHighlight, setDateJumpHighlight] = useState<{
    readonly date: string;
    readonly transactionId: number;
  }>();
  const [activeEditDock, setActiveEditDock] = useState<EditDockAction>();
  const [editDockOpenedFromRow, setEditDockOpenedFromRow] = useState(false);
  const [pendingDockTransactionIds, setPendingDockTransactionIds] = useState<
    ReadonlyMap<number, number>
  >(() => new Map());
  const [renderedEditMode, setRenderedEditMode] = useState(editMode);
  if (renderedEditMode !== editMode) {
    setRenderedEditMode(editMode);
    setActiveEditDock(undefined);
    setEditDockOpenedFromRow(false);
  }
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectionAnchorIdRef = useRef<number | null>(null);
  const deletedRowFocusIndexRef = useRef<number | undefined>(undefined);
  const consumedDateJumpAnchorRef =
    useRef<TransactionBrowserProps["dateJumpAnchor"]>(undefined);
  const maps = useMemo(() => buildLookupMaps(lookups), [lookups]);
  const today = localTodayISODate();
  const selectableTransactions = useMemo(
    () =>
      (transactions ?? []).filter(
        (transaction) => transaction.lifecycle_status === "active",
      ),
    [transactions],
  );
  const selectedCount = selectedTransactionIds.size;
  const [selectedRowFocusIndex, setSelectedRowFocusIndex] = useState(-1);
  const currentSelectedRowIndex = (transactions ?? []).findIndex(
    (transaction) => selectedTransactionIds.has(transaction.transaction_id),
  );
  const changeActiveEditDock = (action: EditDockAction | undefined) => {
    if (action && currentSelectedRowIndex >= 0) {
      setSelectedRowFocusIndex(currentSelectedRowIndex);
    }
    setEditDockOpenedFromRow(false);
    setActiveEditDock(action);
  };
  const skipSummaryByAction = useMemo<
    Record<EditDockAction, EditModeSkipSummary>
  >(() => {
    return {
      category: summarizeEditModeSkips(
        selectedTransactions,
        "category",
        maps.accountsById,
      ),
      member: summarizeEditModeSkips(
        selectedTransactions,
        "member",
        maps.accountsById,
      ),
      tags: summarizeEditModeSkips(
        selectedTransactions,
        "tags",
        maps.accountsById,
      ),
    };
  }, [maps, selectedTransactions]);
  const setDockTransactionsPending = (
    transactionIds: readonly number[],
    pending: boolean,
  ) => {
    setPendingDockTransactionIds((current) => {
      const next = new Map(current);
      for (const transactionId of transactionIds) {
        if (pending) {
          next.set(transactionId, (next.get(transactionId) ?? 0) + 1);
        } else {
          const pendingCount = next.get(transactionId) ?? 0;
          if (pendingCount <= 1) {
            next.delete(transactionId);
          } else {
            next.set(transactionId, pendingCount - 1);
          }
        }
      }
      return next;
    });
  };
  const runDockMutation = async (
    targetTransactions: readonly Transaction[],
    mutation: () => Promise<void>,
  ) => {
    const transactionIds = targetTransactions.map(
      (transaction) => transaction.transaction_id,
    );
    setDockTransactionsPending(transactionIds, true);
    try {
      await mutation();
    } finally {
      setDockTransactionsPending(transactionIds, false);
    }
  };
  const applyEditDockUpdate = async (update: EditDockUpdate) => {
    if (!onUpdateTransactionsEditReferences) {
      throw new Error("Edit mode is unavailable in this view.");
    }
    await runDockMutation(selectedTransactions, () =>
      onUpdateTransactionsEditReferences(selectedTransactions, update),
    );
  };
  const amountSaveBlocksDock = useTransactionEditModeStore((state) =>
    selectedTransactions.some((transaction) =>
      state.pendingAmountTransactionIds.has(transaction.transaction_id),
    ),
  );
  const allSelectableTransactionsSelected =
    selectableTransactions.length > 0 &&
    selectableTransactions.every((transaction) =>
      selectedTransactionIds.has(transaction.transaction_id),
    );
  const headerSelectionState = allSelectableTransactionsSelected
    ? true
    : selectedCount > 0
      ? "indeterminate"
      : false;

  const rangeTransactionIds = useCallback(
    (targetTransactionId: number): readonly number[] => {
      const anchorTransactionId = selectionAnchorIdRef.current;
      const anchorIndex = (transactions ?? []).findIndex(
        (transaction) => transaction.transaction_id === anchorTransactionId,
      );
      const targetIndex = (transactions ?? []).findIndex(
        (transaction) => transaction.transaction_id === targetTransactionId,
      );
      if (targetIndex < 0) {
        return [];
      }
      if (anchorIndex < 0) {
        selectionAnchorIdRef.current = targetTransactionId;
        return [targetTransactionId];
      }

      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      return (transactions ?? [])
        .slice(start, end + 1)
        .filter((transaction) => transaction.lifecycle_status === "active")
        .map((transaction) => transaction.transaction_id);
    },
    [transactions],
  );

  const toggleRowSelection = useCallback(
    (transactionId: number) => {
      selectionAnchorIdRef.current = transactionId;
      onToggleSelection(transactionId);
    },
    [onToggleSelection],
  );

  const selectRowRange = useCallback(
    (transactionId: number) => {
      onSelectRange(rangeTransactionIds(transactionId));
    },
    [onSelectRange, rangeTransactionIds],
  );

  useEffect(() => {
    if (!editMode) {
      return;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const activeElement = document.activeElement;
      const editControlsFocused =
        activeElement instanceof HTMLElement &&
        Boolean(
          activeElement.closest("[data-transaction-browser-edit-controls]"),
        );
      const textEntryTarget =
        event.target instanceof HTMLElement &&
        event.target.matches(
          "input, textarea, select, [contenteditable='true']",
        );
      if (
        event.key.toLowerCase() === "a" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !textEntryTarget &&
        activeElement instanceof HTMLElement &&
        (rootRef.current?.contains(activeElement) || editControlsFocused)
      ) {
        event.preventDefault();
        onSelectRange(
          selectableTransactions.map(
            (transaction) => transaction.transaction_id,
          ),
        );
        return;
      }
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        if (activeEditDock) {
          setActiveEditDock(undefined);
        } else if (selectedCount > 0) {
          if (activeElement instanceof HTMLElement) {
            const activeRow = activeElement.closest<HTMLTableRowElement>(
              transactionRowSelector,
            );
            const selectionAnchorRow =
              selectionAnchorIdRef.current === null
                ? null
                : rootRef.current?.querySelector<HTMLTableRowElement>(
                    `[data-transaction-id="${selectionAnchorIdRef.current}"]`,
                  );
            const focusTarget =
              activeRow ??
              selectionAnchorRow ??
              document.querySelector<HTMLElement>("[data-edit-mode-done]");
            focusTarget?.focus({ preventScroll: true });
          }
          onClearSelection();
        } else {
          onSetEditMode(false);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    editMode,
    activeEditDock,
    onClearSelection,
    onSetEditMode,
    onSelectRange,
    selectableTransactions,
    selectedCount,
  ]);

  useEffect(() => {
    selectionAnchorIdRef.current = null;
  }, [page, pageSize]);

  useEffect(() => {
    if (selectedCount === 0) {
      selectionAnchorIdRef.current = null;
      const frame = window.requestAnimationFrame(() => {
        setActiveEditDock(undefined);
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }
  }, [selectedCount]);

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

  const closeDismissConfirmation = () => {
    if (dismissing) {
      return;
    }
    const opener = dismissDialog?.opener;
    setDismissErrorMessage(undefined);
    setDismissDialog(undefined);
    window.requestAnimationFrame(() => {
      focusWithoutTooltip(opener, { preventScroll: true });
    });
  };

  const confirmOccurrence = useCallback(
    async (transaction: Transaction, rowIndex: number) => {
      if (transaction.recurring_occurrence_id === null) {
        return;
      }

      setConfirmingOccurrenceId(transaction.recurring_occurrence_id);
      setOccurrenceActionErrorMessage(undefined);
      deletedRowFocusIndexRef.current = rowIndex;
      try {
        await onConfirmRecurringOccurrence(transaction);
      } catch (error) {
        deletedRowFocusIndexRef.current = undefined;
        setOccurrenceActionErrorMessage(
          error instanceof Error ? error.message : "The API request failed.",
        );
      } finally {
        setConfirmingOccurrenceId(undefined);
      }
    },
    [onConfirmRecurringOccurrence],
  );

  const changeLifecycle = useCallback(
    async (
      transaction: Transaction,
      action: "cancel" | "restore",
      opener: HTMLElement,
    ) => {
      focusWithoutTooltip(opener, { preventScroll: true });
      setLifecycleActionsBusy((current) =>
        new Map(current).set(transaction.transaction_id, action),
      );
      setLifecycleActionErrorMessage(undefined);
      try {
        await onChangeTransactionLifecycle(transaction, action);
      } catch (error) {
        setLifecycleActionErrorMessage(
          error instanceof Error ? error.message : "The API request failed.",
        );
      } finally {
        setLifecycleActionsBusy((current) => {
          const next = new Map(current);
          next.delete(transaction.transaction_id);
          return next;
        });
      }
    },
    [onChangeTransactionLifecycle],
  );

  const restorePostFocus = useCallback(
    (transaction: Transaction, rowIndex: number, opener: HTMLElement) => {
      window.requestAnimationFrame(() => {
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLElement &&
          activeElement !== opener &&
          activeElement !== document.body &&
          activeElement.matches(
            "a, button, input, select, textarea, [contenteditable='true'], " +
              "[tabindex]:not([tabindex='-1'])",
          )
        ) {
          return;
        }
        if (opener.isConnected && opener.getClientRects().length > 0) {
          focusWithoutTooltip(opener, { preventScroll: true });
          return;
        }
        const row = rootRef.current?.querySelector<HTMLElement>(
          `[data-transaction-id="${transaction.transaction_id}"]`,
        );
        if (row) {
          row.focus({ preventScroll: true });
        } else {
          focusTransactionRowFallback(rootRef.current, rowIndex);
        }
      });
    },
    [],
  );

  const closePostConfirmation = () => {
    if (
      postDialog &&
      lifecycleActionsBusy.get(postDialog.transaction.transaction_id) === "post"
    ) {
      return;
    }
    const dialog = postDialog;
    setPostErrorMessage(undefined);
    setPostDialog(undefined);
    if (dialog) {
      restorePostFocus(dialog.transaction, dialog.rowIndex, dialog.opener);
    }
  };

  const confirmPost = async () => {
    if (!postDialog) {
      return;
    }
    const postedDate = settlementDateTimeToISO(
      postDialog.postedDateTime,
      postDialog.sourcePostedDate,
    );
    if (!postedDate) {
      setPostErrorMessage("Enter a valid posted date.");
      return;
    }
    const { opener, rowIndex, transaction } = postDialog;
    setPostDialog(undefined);
    setLifecycleActionsBusy((current) =>
      new Map(current).set(transaction.transaction_id, "post"),
    );
    setPostErrorMessage(undefined);
    setLifecycleActionErrorMessage(undefined);
    try {
      await onPostTransaction(transaction, postedDate);
    } catch (error) {
      setLifecycleActionErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
    } finally {
      setLifecycleActionsBusy((current) => {
        const next = new Map(current);
        next.delete(transaction.transaction_id);
        return next;
      });
      restorePostFocus(transaction, rowIndex, opener);
    }
  };

  const confirmDismiss = useCallback(async () => {
    if (!dismissDialog) {
      return;
    }

    setDismissing(true);
    setDismissErrorMessage(undefined);
    deletedRowFocusIndexRef.current = dismissDialog.rowIndex;
    try {
      await onDismissRecurringOccurrence(dismissDialog.transaction);
      setDismissDialog(undefined);
    } catch (error) {
      deletedRowFocusIndexRef.current = undefined;
      setDismissErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
    } finally {
      setDismissing(false);
    }
  }, [dismissDialog, onDismissRecurringOccurrence]);

  useLayoutEffect(() => {
    if (
      deleteDialog ||
      dismissDialog ||
      deletedRowFocusIndexRef.current === undefined
    ) {
      return;
    }

    const rowIndex = deletedRowFocusIndexRef.current;
    deletedRowFocusIndexRef.current = undefined;
    focusTransactionRowFallback(rootRef.current, rowIndex);
  }, [deleteDialog, dismissDialog, transactions]);

  useEffect(() => {
    if (!dateJumpAnchor) {
      consumedDateJumpAnchorRef.current = undefined;
      const timeout = window.setTimeout(() => {
        setDateJumpHighlight(undefined);
      });
      return () => {
        window.clearTimeout(timeout);
      };
    }

    if (
      consumedDateJumpAnchorRef.current === dateJumpAnchor ||
      dateJumpAnchor.page !== page ||
      !transactions
    ) {
      return;
    }

    const transaction = dateJumpTargetTransaction(
      transactions,
      dateJumpAnchor.date,
    );
    if (!transaction) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const row = rootRef.current?.querySelector<HTMLElement>(
        `[data-transaction-id="${transaction.transaction_id}"]`,
      );
      if (!row) {
        return;
      }

      consumedDateJumpAnchorRef.current = dateJumpAnchor;
      row.scrollIntoView({ block: "center" });
      setDateJumpHighlight({
        date: dateJumpAnchor.date,
        transactionId: transaction.transaction_id,
      });
    });
    const timeout = window.setTimeout(() => {
      setDateJumpHighlight(undefined);
    }, 2_000);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [dateJumpAnchor, page, transactions]);

  const editDockSurface = editMode ? (
    <TransactionEditDock
      activeEditor={activeEditDock}
      blocked={amountSaveBlocksDock || pendingDockTransactionIds.size > 0}
      maps={maps}
      onApply={applyEditDockUpdate}
      onEditorChange={changeActiveEditDock}
      onSetReconciliation={(value) =>
        runDockMutation(selectedTransactions, () =>
          onUpdateTransactionsEditRecordState(selectedTransactions, {
            kind: "reconciliation",
            value,
          }),
        )
      }
      onSetSettlement={(value) =>
        runDockMutation(selectedTransactions, () =>
          onUpdateTransactionsEditRecordState(selectedTransactions, {
            kind: "settlement",
            value,
          }),
        )
      }
      selectedCount={selectedCount}
      selectedRowIndex={selectedRowFocusIndex}
      restoreFocusToRow={editDockOpenedFromRow}
      skipSummary={skipSummaryByAction}
    />
  ) : null;

  if (loading && !transactions) {
    return (
      <div
        className={cn(
          "grid h-full min-h-0 min-w-0 gap-3 overflow-x-auto",
          editMode && "grid-cols-[minmax(23rem,1fr)_minmax(16rem,20rem)]",
        )}
      >
        <div className="min-h-0 min-w-0">
          <LoadingRows />
        </div>
        {editDockSurface}
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        className={cn(
          "grid h-full min-h-0 min-w-0 gap-3 overflow-x-auto",
          editMode && "grid-cols-[minmax(23rem,1fr)_minmax(16rem,20rem)]",
        )}
      >
        <div className="min-h-0 min-w-0">
          <TransactionErrorCard
            heading="Transactions could not be loaded."
            message={errorMessage}
            summary="API error"
          />
        </div>
        {editDockSurface}
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div
        ref={rootRef}
        className={cn(
          "grid h-full min-h-0 min-w-0 gap-3 overflow-x-auto",
          editMode && "grid-cols-[minmax(23rem,1fr)_minmax(16rem,20rem)]",
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          {refreshErrorMessage ? (
            <TransactionErrorCard
              heading="Transactions may be stale."
              message={refreshErrorMessage}
              summary="Refresh error"
            />
          ) : null}
          <div className="border-border bg-card flex-1 border p-10 text-center">
            <EmptyStateSprite />
            <h2 className="text-pixel mt-4 text-base">No transactions</h2>
            <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">
              Transaction lines appear here after activity is created or demo
              data is seeded.
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
        </div>
        {editDockSurface}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="flex h-full min-h-0 flex-col gap-3"
      aria-busy={loading ? "true" : undefined}
      data-transaction-browser="true"
    >
      <div
        className={cn(
          "grid min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto",
          editMode && "grid-cols-[minmax(23rem,1fr)_minmax(16rem,20rem)]",
        )}
        data-testid="transaction-browser-layout"
      >
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          {refreshErrorMessage ? (
            <TransactionErrorCard
              heading="Transactions may be stale."
              message={refreshErrorMessage}
              summary="Refresh error"
            />
          ) : null}
          <div
            className="transactions-table-scroll bg-card min-h-0 flex-1 overflow-auto border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
            data-testid="transactions-table-scroll"
          >
            <table
              aria-multiselectable={editMode ? true : undefined}
              className={cn(
                "transactions-table w-full table-fixed border-collapse text-sm",
                editMode && "transactions-table--edit-mode min-w-[23rem]",
              )}
            >
              <colgroup>
                {editMode ? (
                  <col className="transactions-selection-column" />
                ) : null}
                <col className="transactions-class-column" />
                <col className="transactions-date-column" />
                <col className="transactions-description-column" />
                <col className="transactions-category-column" />
                <col className="transactions-tags-column" />
                <col className="transactions-member-column" />
                <col className="transactions-amount-column" />
                <col className="transactions-actions-column" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[var(--table-header)]">
                <tr className="font-heading text-foreground border-b-2 border-[var(--border-ink)] text-left text-xs font-semibold uppercase">
                  {editMode ? (
                    <th className="transactions-selection-column px-3 py-2">
                      {selectableTransactions.length > 0 ? (
                        <Checkbox
                          aria-label="Select page transactions"
                          checked={headerSelectionState}
                          onCheckedChange={onTogglePageSelection}
                        />
                      ) : null}
                    </th>
                  ) : null}
                  <th className="transactions-class-column px-3 py-2">
                    <span className="sr-only min-[1920px]:not-sr-only">
                      Class
                    </span>
                  </th>
                  <th className="transactions-date-column px-3 py-2">Date</th>
                  <th className="transactions-description-column px-3 py-2">
                    Description
                  </th>
                  <th className="transactions-category-column px-3 py-2">
                    Category
                  </th>
                  <th className="transactions-tags-column px-3 py-2">Tags</th>
                  <th className="transactions-member-column px-3 py-2">
                    Member
                  </th>
                  <th className="transactions-amount-column px-3 py-2 text-right">
                    Amount
                  </th>
                  <th className="transactions-actions-column px-3 py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction, transactionIndex) => {
                  const title = transaction.display_title;
                  const initiatedDate = formatInitiatedDateParts(
                    transaction.initiated_date,
                  );
                  const memo = lineMemo(transaction);
                  const category = lineCategory(transaction, maps);
                  const tags = lineTags(transaction, maps);
                  const member = lineMember(transaction, maps);
                  const simpleAmountRecords =
                    simpleTransactionAmountRecords(transaction);
                  const displayStatus = lineStatus(transaction);
                  const amounts = lineDisplayAmounts(transaction);
                  const hasMoreParts = transactionHasMoreParts(transaction);
                  const amountDeemphasized =
                    displayStatus === "expected" ||
                    displayStatus === "pending" ||
                    displayStatus === "mixed" ||
                    displayStatus === "cancelled";
                  const lineInactive = displayStatus === "cancelled";
                  const overdueExpected =
                    displayStatus === "expected" &&
                    transaction.initiated_date < today;
                  const expectedOccurrence =
                    isExpectedRecurringOccurrence(transaction);
                  const whollyPending =
                    isActiveWhollyPendingTransaction(transaction);
                  const lifecycleBusyAction = lifecycleActionsBusy.get(
                    transaction.transaction_id,
                  );
                  const selectable = transaction.lifecycle_status === "active";
                  const selected = selectedTransactionIds.has(
                    transaction.transaction_id,
                  );
                  const amountEditable =
                    transaction.lifecycle_status === "active" &&
                    simpleAmountRecords !== undefined &&
                    amounts.length === 1;
                  const occurrenceActionBusy =
                    confirmingOccurrenceId !== undefined || dismissing;
                  const walkRowFocus = (
                    event: KeyboardEvent<HTMLTableRowElement>,
                    direction: -1 | 1,
                  ) => {
                    const nextTransaction =
                      transactions[transactionIndex + direction];
                    if (!nextTransaction) {
                      return;
                    }
                    event.preventDefault();
                    const rows = Array.from(
                      event.currentTarget
                        .closest("tbody")
                        ?.querySelectorAll<HTMLTableRowElement>(
                          transactionRowSelector,
                        ) ?? [],
                    );
                    const nextRow = rows[transactionIndex + direction];
                    nextRow?.scrollIntoView({ block: "nearest" });
                    nextRow?.focus({ preventScroll: true });

                    if (!editMode || !event.shiftKey) {
                      return;
                    }
                    if (selectionAnchorIdRef.current === null && selectable) {
                      selectionAnchorIdRef.current = transaction.transaction_id;
                    }
                    if (nextTransaction.lifecycle_status === "active") {
                      selectRowRange(nextTransaction.transaction_id);
                    }
                  };
                  const categoryEditValue =
                    category === "mixed" ? (
                      <MixedSentinel />
                    ) : category ? (
                      <FqnPath value={category.fqn} variant="leaf-chip" />
                    ) : null;
                  const tagsEditValue =
                    tags === "mixed" ? (
                      <MixedSentinel />
                    ) : (
                      <TagChipsLine tags={tags} />
                    );
                  const memberEditValue =
                    member === "mixed" ? (
                      <MixedSentinel />
                    ) : member ? (
                      <MemberChip name={member.name} />
                    ) : null;
                  const rowHoverFill =
                    transactionIndex % 2 === 0
                      ? "hover:bg-[color-mix(in_srgb,var(--card),var(--table-header)_28%)]"
                      : "hover:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)]";
                  return (
                    <tr
                      key={transaction.transaction_id}
                      className={cn(
                        "border-b border-[var(--hairline)] align-middle focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]",
                        transactionIndex % 2 === 0
                          ? "bg-card"
                          : "bg-[var(--band)]",
                        editMode
                          ? selectable
                            ? "cursor-pointer hover:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)]"
                            : "cursor-default"
                          : `cursor-pointer ${rowHoverFill}`,
                        editMode &&
                          selected &&
                          "bg-[color-mix(in_srgb,var(--band),var(--color-interactive-bright)_12%)] hover:bg-[color-mix(in_srgb,var(--band),var(--color-interactive-bright)_15%)]",
                        dateJumpHighlight?.transactionId ===
                          transaction.transaction_id &&
                          "outline-2 outline-offset-[-2px] outline-[var(--ring)]",
                        lineInactive && "text-muted-foreground line-through",
                      )}
                      aria-disabled={editMode && !selectable ? true : undefined}
                      aria-selected={editMode ? selected : undefined}
                      data-date-jump-anchor={
                        dateJumpHighlight?.transactionId ===
                        transaction.transaction_id
                          ? dateJumpHighlight.date
                          : undefined
                      }
                      data-transaction-id={transaction.transaction_id}
                      data-transaction-row="true"
                      tabIndex={0}
                      onClick={(event) => {
                        if (
                          isInteractiveTarget(event.target, event.currentTarget)
                        ) {
                          return;
                        }
                        if (editMode) {
                          if (!selectable) {
                            return;
                          }
                          if (event.shiftKey) {
                            selectRowRange(transaction.transaction_id);
                          } else {
                            toggleRowSelection(transaction.transaction_id);
                          }
                          return;
                        }
                        onOpenTransaction(transaction, event.currentTarget);
                      }}
                      onKeyDown={(event) => {
                        if (
                          isInteractiveTarget(event.target, event.currentTarget)
                        ) {
                          return;
                        }

                        const editShortcut = {
                          c: "category",
                          m: "member",
                          t: "tags",
                        }[event.key.toLowerCase()] as
                          EditDockAction | undefined;
                        if (
                          editMode &&
                          selected &&
                          editShortcut &&
                          !event.metaKey &&
                          !event.ctrlKey &&
                          !event.altKey
                        ) {
                          event.preventDefault();
                          setSelectedRowFocusIndex(transactionIndex);
                          setEditDockOpenedFromRow(true);
                          setActiveEditDock(editShortcut);
                          return;
                        }

                        if (event.key === "ArrowDown") {
                          walkRowFocus(event, 1);
                          return;
                        }

                        if (event.key === "ArrowUp") {
                          walkRowFocus(event, -1);
                          return;
                        }

                        if (event.key === "Enter") {
                          event.preventDefault();
                          if (editMode) {
                            if (selectable) {
                              toggleRowSelection(transaction.transaction_id);
                            }
                          } else {
                            onOpenTransaction(transaction, event.currentTarget);
                          }
                          return;
                        }

                        if (event.key !== " ") {
                          return;
                        }

                        event.preventDefault();
                        if (!editMode) {
                          onOpenTransaction(transaction, event.currentTarget);
                        } else if (selectable) {
                          if (event.shiftKey) {
                            selectRowRange(transaction.transaction_id);
                          } else {
                            toggleRowSelection(transaction.transaction_id);
                          }
                        }
                      }}
                    >
                      {editMode ? (
                        <td className="transactions-selection-column px-3 py-2">
                          {selectable ? (
                            <Checkbox
                              aria-label={`Select ${title}`}
                              checked={selectedTransactionIds.has(
                                transaction.transaction_id,
                              )}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (event.shiftKey) {
                                  selectRowRange(transaction.transaction_id);
                                } else {
                                  toggleRowSelection(
                                    transaction.transaction_id,
                                  );
                                }
                              }}
                            />
                          ) : null}
                        </td>
                      ) : null}
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
                      <td className="transactions-description-column px-3 py-2">
                        <div className="flex min-w-0 items-center gap-1">
                          <div
                            className="min-w-0 flex-1"
                            data-testid="transaction-description-text"
                          >
                            <Tooltip
                              label={transactionAccountFqnContext(
                                transaction,
                                maps,
                              )}
                              className="block min-w-0"
                            >
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
                          {displayStatus ? (
                            <div
                              className="flex shrink-0 items-center gap-1 whitespace-nowrap"
                              data-display-status={displayStatus}
                              data-testid="transaction-status-indicators"
                            >
                              <StatusIcon status={displayStatus} />
                              {displayStatus === "expected" &&
                              overdueExpected ? (
                                <Tooltip
                                  label="Overdue occurrence"
                                  className="inline-flex size-6 shrink-0"
                                >
                                  <span
                                    aria-label="Overdue"
                                    className="inline-flex size-6 items-center justify-center border border-[var(--border-ink)] bg-[var(--color-class-adjustment-bright)] text-[var(--color-class-adjustment-ink)] shadow-[var(--shadow-chip)]"
                                    data-testid="recurring-overdue-marker"
                                    role="img"
                                  >
                                    <WarningDiamond
                                      aria-hidden="true"
                                      className="size-4"
                                    />
                                  </span>
                                </Tooltip>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="transactions-category-column px-3 py-2">
                        {editMode ? (
                          categoryEditValue
                        ) : category === "mixed" ? (
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
                          {editMode ? (
                            tagsEditValue
                          ) : tags === "mixed" ? (
                            <MixedSentinel />
                          ) : (
                            <TagChipsLine
                              tags={tags}
                              onFilterTag={onFilterTag}
                            />
                          )}
                        </div>
                      </td>
                      <td className="transactions-member-column px-3 py-2">
                        <div className="overflow-visible pb-0.5">
                          {editMode ? (
                            memberEditValue
                          ) : member === "mixed" ? (
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
                        <div
                          className={cn(
                            "flex min-w-0 items-end justify-end gap-1 overflow-visible",
                            amounts.length > 1
                              ? "flex-col"
                              : "flex-row flex-nowrap",
                          )}
                        >
                          {editMode && amountEditable ? (
                            <TransactionAmountInput
                              disabled={pendingDockTransactionIds.has(
                                transaction.transaction_id,
                              )}
                              records={simpleAmountRecords}
                              testIdPrefix={`transaction-${transaction.transaction_id}`}
                              transaction={transaction}
                              onInvalidChange={(invalid) => {
                                setTransactionAmountDraftInvalid(
                                  transaction.transaction_id,
                                  invalid,
                                );
                              }}
                              onPendingChange={(pending, successful) => {
                                setTransactionAmountSavePending(
                                  transaction.transaction_id,
                                  pending,
                                  successful,
                                );
                              }}
                              onSave={onUpdateTransactionAmount}
                            />
                          ) : (
                            <>
                              {hasMoreParts ? (
                                <MorePartsIndicator transaction={transaction} />
                              ) : null}
                              {amounts.map((amount, index) => (
                                <AmountText
                                  key={`${displayAmountKey(amount)}:${index}`}
                                  amount={amount}
                                  chip
                                  overflowTooltip={hasMoreParts || !editMode}
                                  className={cn(
                                    "max-w-full",
                                    hasMoreParts && "min-w-0",
                                    amountDeemphasized &&
                                      "text-muted-foreground bg-card",
                                  )}
                                  positiveSign={
                                    transaction.transaction_class !==
                                      "transfer" &&
                                    transaction.transaction_class !==
                                      "currency_exchange"
                                  }
                                  tone="neutral"
                                  truncate={hasMoreParts}
                                />
                              ))}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="transactions-actions-column px-3 py-2 text-right align-middle">
                        {editMode ? null : (
                          <RowActions
                            foldable
                            actions={
                              expectedOccurrence
                                ? [
                                    {
                                      disabled: occurrenceActionBusy,
                                      disabledReason: occurrenceActionBusy
                                        ? "Occurrence action in progress."
                                        : undefined,
                                      icon: <Check aria-hidden="true" />,
                                      label: occurrenceActionBusy
                                        ? "Confirming"
                                        : "Confirm occurrence",
                                      onSelect: () => {
                                        void confirmOccurrence(
                                          transaction,
                                          transactionIndex,
                                        );
                                      },
                                    },
                                    {
                                      disabled: occurrenceActionBusy,
                                      disabledReason: occurrenceActionBusy
                                        ? "Occurrence action in progress."
                                        : undefined,
                                      icon: <Close aria-hidden="true" />,
                                      label: "Dismiss occurrence",
                                      onSelect: (opener) => {
                                        setOccurrenceActionErrorMessage(
                                          undefined,
                                        );
                                        setDismissErrorMessage(undefined);
                                        setDismissDialog({
                                          opener,
                                          rowIndex: transactionIndex,
                                          transaction,
                                        });
                                      },
                                    },
                                  ]
                                : [
                                    ...(transaction.lifecycle_status ===
                                      "active" && onEditTransaction
                                      ? [
                                          {
                                            disabled:
                                              lifecycleBusyAction === "post",
                                            disabledReason:
                                              lifecycleBusyAction === "post"
                                                ? "Posting transaction."
                                                : undefined,
                                            icon: <Pencil aria-hidden="true" />,
                                            label: "Edit transaction",
                                            onSelect: (opener: HTMLElement) => {
                                              onEditTransaction(
                                                transaction,
                                                opener,
                                              );
                                            },
                                          },
                                        ]
                                      : []),
                                    ...(onDuplicateTransaction
                                      ? [
                                          {
                                            icon: <Copy aria-hidden="true" />,
                                            label: "Duplicate transaction",
                                            onSelect: (opener: HTMLElement) => {
                                              onDuplicateTransaction(
                                                transaction,
                                                opener,
                                              );
                                            },
                                          },
                                        ]
                                      : []),
                                    {
                                      icon: <CardText aria-hidden="true" />,
                                      label: "Create template",
                                      onSelect: (opener) => {
                                        openNewTemplateEditor(
                                          opener,
                                          transactionTemplateRecordsFromTransaction(
                                            transaction,
                                          ),
                                        );
                                      },
                                    },
                                    ...(canSplitTransaction(transaction) &&
                                    onSplitTransaction
                                      ? [
                                          {
                                            disabled:
                                              lifecycleBusyAction === "post",
                                            disabledReason:
                                              lifecycleBusyAction === "post"
                                                ? "Posting transaction."
                                                : undefined,
                                            icon: (
                                              <Scissors aria-hidden="true" />
                                            ),
                                            label: "Split transaction",
                                            onSelect: (opener: HTMLElement) => {
                                              onSplitTransaction(
                                                transaction,
                                                opener,
                                              );
                                            },
                                          },
                                        ]
                                      : []),
                                    ...(whollyPending
                                      ? [
                                          {
                                            disabled:
                                              Boolean(lifecycleBusyAction),
                                            disabledReason:
                                              lifecycleBusyAction === "cancel"
                                                ? "Cancelling transaction."
                                                : lifecycleBusyAction ===
                                                    "restore"
                                                  ? "Restoring transaction."
                                                  : undefined,
                                            id: "post-transaction",
                                            icon: <Check aria-hidden="true" />,
                                            label:
                                              lifecycleBusyAction === "post"
                                                ? "Posting transaction"
                                                : "Post transaction",
                                            onSelect: (opener: HTMLElement) => {
                                              setPostErrorMessage(undefined);
                                              const postedDate =
                                                defaultPostSettlementDateTimeValue();
                                              const openPostDialog = () => {
                                                setPostDialog({
                                                  opener,
                                                  postedDateTime:
                                                    postedDate.dateTime,
                                                  rowIndex: transactionIndex,
                                                  sourcePostedDate:
                                                    postedDate.sourceDate,
                                                  transaction,
                                                });
                                              };
                                              if (
                                                opener.classList.contains(
                                                  "row-actions-overflow",
                                                )
                                              ) {
                                                window.setTimeout(
                                                  openPostDialog,
                                                  0,
                                                );
                                              } else {
                                                openPostDialog();
                                              }
                                            },
                                          },
                                          {
                                            disabled:
                                              Boolean(lifecycleBusyAction),
                                            disabledReason:
                                              lifecycleBusyAction === "post"
                                                ? "Posting transaction."
                                                : undefined,
                                            id: "cancel-transaction",
                                            icon: <Close aria-hidden="true" />,
                                            label:
                                              lifecycleBusyAction === "cancel"
                                                ? "Cancelling transaction"
                                                : "Cancel transaction",
                                            onSelect: (opener: HTMLElement) => {
                                              void changeLifecycle(
                                                transaction,
                                                "cancel",
                                                opener,
                                              );
                                            },
                                          },
                                        ]
                                      : []),
                                    ...(transaction.lifecycle_status ===
                                    "cancelled"
                                      ? [
                                          {
                                            disabled:
                                              Boolean(lifecycleBusyAction),
                                            id: "restore-transaction",
                                            icon: <Reload aria-hidden="true" />,
                                            label:
                                              lifecycleBusyAction === "restore"
                                                ? "Restoring transaction"
                                                : "Restore transaction",
                                            onSelect: (opener: HTMLElement) => {
                                              void changeLifecycle(
                                                transaction,
                                                "restore",
                                                opener,
                                              );
                                            },
                                          },
                                        ]
                                      : []),
                                    {
                                      disabled: lifecycleBusyAction === "post",
                                      disabledReason:
                                        lifecycleBusyAction === "post"
                                          ? "Posting transaction."
                                          : undefined,
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
                                  ]
                            }
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {occurrenceActionErrorMessage ? (
            <div
              className="border-destructive bg-card border-2 p-3 text-sm shadow-[var(--shadow-pixel)]"
              role="alert"
            >
              <p className="text-destructive font-semibold">
                Occurrence could not be confirmed.
              </p>
              <p className="text-muted-foreground mt-1">
                {occurrenceActionErrorMessage}
              </p>
            </div>
          ) : null}
          {lifecycleActionErrorMessage ? (
            <div
              className="border-destructive bg-card text-destructive border-2 p-3 text-sm shadow-[var(--shadow-pixel)]"
              role="alert"
            >
              {lifecycleActionErrorMessage}
            </div>
          ) : null}

          <div
            className="bg-card flex shrink-0 flex-col gap-3 border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)] sm:flex-row sm:items-center sm:justify-between"
            data-testid="transactions-pagination-footer"
            tabIndex={-1}
          >
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="transactions-page-size" className="font-medium">
                Rows
              </label>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  onPageSizeChange(Number(value));
                }}
              >
                <SelectTrigger id="transactions-page-size" size="compact">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {transactionPageSizeOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        </div>
        {editDockSurface}
      </div>
      {postDialog ? (
        <TransactionPostDialog
          errorMessage={postErrorMessage}
          onConfirm={() => {
            void confirmPost();
          }}
          onOpenChange={(open) => {
            if (!open) {
              closePostConfirmation();
            }
          }}
          onPostedDateTimeChange={(postedDateTime) => {
            setPostDialog((current) =>
              current ? { ...current, postedDateTime } : current,
            );
            setPostErrorMessage(undefined);
          }}
          pending={
            lifecycleActionsBusy.get(postDialog.transaction.transaction_id) ===
            "post"
          }
          postedDateTime={postDialog.postedDateTime}
          transaction={postDialog.transaction}
        />
      ) : null}
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
          <TransactionDeleteDescription
            transaction={deleteDialog.transaction}
          />
        ) : null}
      </ConfirmationDialog>
      <ConfirmationDialog
        confirmIcon={<Close aria-hidden="true" />}
        confirmLabel="Dismiss occurrence"
        errorMessage={dismissErrorMessage}
        onConfirm={() => {
          void confirmDismiss();
        }}
        onOpenChange={(open) => {
          if (!open) {
            closeDismissConfirmation();
          }
        }}
        open={Boolean(dismissDialog)}
        pending={dismissing}
        pendingLabel="Dismissing"
        title="Dismiss occurrence"
      >
        <p>
          {dismissDialog
            ? `${dismissDialog.transaction.display_title} scheduled ${formatInitiatedDate(
                dismissDialog.transaction.initiated_date,
              )}`
            : ""}
        </p>
        <p>This skips only this scheduled occurrence.</p>
      </ConfirmationDialog>
    </div>
  );
};
