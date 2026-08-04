import {
  CardText,
  Check,
  Close,
  Copy,
  MagicEdit,
  Reload,
  Scissors,
  Trash,
} from "pixelarticons/react";
import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { DisplayAmount, JournalRecord, Transaction } from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { transactionTemplateRecordsFromTransaction } from "@/features/templates";
import { useOutsidePointerClose } from "@/hooks/use-outside-pointer-close";
import { cn } from "@/lib/utils";
import { type LedgerLookupsSnapshot, openNewTemplateEditor } from "@/store";
import { formatInstantTimestamp, localCivilDate } from "@/utils/date";

import { AccountDisplayLabel } from "./account-display-label";
import { AmountText } from "./amount-text";
import { ClassBadge } from "./class-badge";
import {
  buildLookupMaps,
  detailDisplayAmounts,
  displayAmountKey,
  displayStatusLabel,
  formatInitiatedDate,
  lineMemo,
  lineStatus,
  type LookupMaps,
  recordRoleLabel,
  settlementStatusLabel,
  transactionAccountFqnContext,
} from "./format";
import { FqnPath } from "./fqn-path";
import { RecordRoleIcon, StatusIcon } from "./line-icons";
import { MemberChip } from "./member-chip";
import { TagChip } from "./tag-chip";
import { TransactionDeleteDescription } from "./transaction-delete-description";

interface TransactionDetailPanelProps {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly onClose: () => void;
  readonly onChangeLifecycle: (
    transaction: Transaction,
    action: "cancel" | "restore",
  ) => Promise<void>;
  readonly onConfirmOccurrence?: (transaction: Transaction) => Promise<void>;
  readonly onDelete: (transaction: Transaction) => Promise<void>;
  readonly onDismissOccurrence?: (transaction: Transaction) => Promise<void>;
  readonly onDuplicate?: (
    transaction: Transaction,
    opener?: HTMLElement,
  ) => void;
  readonly onEdit?: (transaction: Transaction, opener?: HTMLElement) => void;
  readonly onSplit?: (transaction: Transaction, opener?: HTMLElement) => void;
  readonly onFilterCategory?: (categoryId: number) => void;
  readonly onRestoreFocus: () => void;
  readonly transaction: Transaction | undefined;
}

const floatingOverlaySelectors = [
  "[data-page-help-content]",
  "[data-slot='select-content']",
] as const;

const formatFullCivilDate = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
  }).format(localCivilDate(value));

const recordDisplayAmount = (record: JournalRecord): DisplayAmount => ({
  amount: record.amount,
  currency: record.currency,
});

const exchangeRateLabel = (transaction: Transaction): string | undefined => {
  const rate = transaction.shapes.find(
    (shape) => shape.shape === "exchange",
  )?.effective_rate;
  return rate
    ? `1 ${rate.bought_currency} = ${rate.rate} ${rate.sold_currency}`
    : undefined;
};

const uniqueRecordSources = (transaction: Transaction): string =>
  Array.from(new Set(transaction.records.map((record) => record.source))).join(
    ", ",
  );

export const TransactionLifecycleStrip = ({
  transaction,
}: {
  readonly transaction: Transaction;
}) => {
  const lineDisplayStatus = lineStatus(transaction);
  const status = lineDisplayStatus === "mixed" ? "pending" : lineDisplayStatus;

  return (
    <div
      aria-label={`Transaction lifecycle: initiated ${formatFullCivilDate(transaction.initiated_date)}${status ? `, ${displayStatusLabel(status)}` : ""}`}
      className="flex min-h-8 items-center gap-1 border-y border-[var(--hairline)] bg-[var(--band)] px-2 py-1 font-mono text-xs"
      data-testid="transaction-lifecycle"
    >
      <span className="text-muted-foreground font-semibold uppercase">
        Initiated
      </span>
      <span>{formatInitiatedDate(transaction.initiated_date)}</span>
      {status ? (
        <span
          className="text-muted-foreground ml-1 font-semibold lowercase"
          data-lifecycle-status={status}
        >
          {displayStatusLabel(status)}
        </span>
      ) : null}
    </div>
  );
};

const DetailAmountList = ({
  transaction,
}: {
  readonly transaction: Transaction;
}) => {
  const amounts = detailDisplayAmounts(transaction);

  return amounts.length > 0 ? (
    <div className="flex flex-wrap justify-end gap-2">
      {amounts.map((amount, index) => (
        <AmountText
          key={`${displayAmountKey(amount)}:${index}`}
          amount={amount}
          chip
          positiveSign={
            transaction.transaction_class !== "transfer" &&
            transaction.transaction_class !== "currency_exchange"
          }
          transactionClass={transaction.transaction_class}
        />
      ))}
    </div>
  ) : (
    <span className="text-muted-foreground">No display amount</span>
  );
};

const RecordTagSet = ({
  maps,
  onFilterTag,
  record,
}: {
  readonly maps: LookupMaps;
  readonly onFilterTag?: (tagId: number) => void;
  readonly record: JournalRecord;
}) => {
  const tags = record.tag_ids
    .map((tagId) => maps.tagsById.get(tagId))
    .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));

  return tags.length > 0 ? (
    <span className="inline-flex max-w-full flex-wrap gap-1 overflow-visible pb-0.5">
      {tags.map((tag) => (
        <TagChip
          key={tag.tag_id}
          label={tag.name}
          tooltip={tag.fqn}
          onActivate={
            onFilterTag
              ? () => {
                  onFilterTag(tag.tag_id);
                }
              : undefined
          }
        />
      ))}
    </span>
  ) : null;
};

const sourceLabel = (source: JournalRecord["source"]): string =>
  source
    .split("_")
    .map((part, index) =>
      index === 0 ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part,
    )
    .join(" ");

const isInteractiveRowTarget = (
  event: MouseEvent<HTMLTableRowElement>,
): boolean =>
  event.target instanceof Element &&
  event.target.closest(
    "a, button, input, select, textarea, [role='button'], [role='link']",
  ) !== null;

const DetailRecordsTable = ({
  maps,
  onFilterCategory,
  onFilterMember,
  onFilterTag,
  records,
  variant,
  transaction,
}: {
  readonly maps: LookupMaps;
  readonly onFilterCategory?: (categoryId: number) => void;
  readonly onFilterMember?: (memberId: number) => void;
  readonly onFilterTag?: (tagId: number) => void;
  readonly records: readonly JournalRecord[];
  readonly variant: "decluttered" | "full";
  readonly transaction: Transaction;
}) => {
  const [expandedRecordIds, setExpandedRecordIds] = useState<
    ReadonlySet<number>
  >(() => new Set());

  const toggleRecord = (recordId: number) => {
    setExpandedRecordIds((current) => {
      const next = new Set(current);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  };

  const handleRecordKeyDown = (
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    recordId: number,
  ) => {
    if (
      event.target !== event.currentTarget ||
      (event.key !== "Enter" && event.key !== " ")
    ) {
      return;
    }
    event.preventDefault();
    toggleRecord(recordId);
  };

  return (
    <div
      className={cn(
        "transaction-detail-records-table max-w-full overflow-visible border-2 border-[var(--border-ink)]",
        variant === "decluttered" &&
          "transaction-detail-records-table--decluttered",
      )}
      data-testid="transaction-detail-records-table"
    >
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="detail-records-role-column" />
          <col className="detail-records-account-column" />
          <col className="detail-records-amount-column" />
          <col className="detail-records-category-column" />
          {variant === "full" ? (
            <>
              <col className="detail-records-tags-column" />
              <col className="detail-records-member-column" />
              <col className="detail-records-status-column" />
              <col className="detail-records-memo-column" />
            </>
          ) : null}
        </colgroup>
        <thead>
          <tr className="font-heading bg-[var(--table-header)] text-left text-xs font-semibold uppercase">
            <th className="detail-records-role-column px-1 py-2">
              <span className="sr-only">Role</span>
            </th>
            <th className="detail-records-account-column px-2 py-2">Account</th>
            <th className="detail-records-amount-column px-2 py-2 text-right">
              Amount
            </th>
            <th className="detail-records-category-column px-2 py-2">
              Category
            </th>
            {variant === "full" ? (
              <>
                <th className="detail-records-tags-column px-2 py-2">Tags</th>
                <th className="detail-records-member-column px-2 py-2">
                  Member
                </th>
                <th className="detail-records-status-column px-2 py-2">
                  Settlement
                </th>
                <th className="detail-records-memo-column px-2 py-2">Memo</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => {
            const account = maps.accountsById.get(record.account_id);
            const category =
              record.category_id === null
                ? undefined
                : maps.categoriesById.get(record.category_id);
            const member =
              record.member_id === null || record.member_id === undefined
                ? undefined
                : maps.membersById.get(record.member_id);
            const disclosureTags =
              variant === "decluttered"
                ? record.tag_ids
                    .map((tagId) => maps.tagsById.get(tagId))
                    .filter((tag): tag is NonNullable<typeof tag> =>
                      Boolean(tag),
                    )
                : [];
            const expanded = expandedRecordIds.has(record.record_id);
            const disclosureId = `record-${record.record_id}-detail`;
            const cancelled = transaction.lifecycle_status === "cancelled";
            const rowTone = index % 2 === 0 ? "bg-card" : "bg-[var(--band)]";
            const rowHoverTone =
              index % 2 === 0
                ? "hover:bg-[color-mix(in_srgb,var(--card),var(--table-header)_28%)]"
                : "hover:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)]";

            return (
              <Fragment key={record.record_id}>
                <tr
                  aria-controls={disclosureId}
                  aria-expanded={expanded}
                  className={cn(
                    "cursor-pointer border-t border-[var(--hairline)] align-top",
                    rowTone,
                    rowHoverTone,
                    cancelled &&
                      "text-muted-foreground line-through decoration-1",
                  )}
                  data-detail-record-row="true"
                  onClick={(event) => {
                    if (!isInteractiveRowTarget(event)) {
                      toggleRecord(record.record_id);
                    }
                  }}
                  onKeyDown={(event) => {
                    handleRecordKeyDown(event, record.record_id);
                  }}
                  tabIndex={0}
                >
                  <td
                    className="detail-records-role-column min-w-0 px-1 py-1.5"
                    data-label="Role"
                  >
                    <RecordRoleIcon
                      className="size-4 min-w-4"
                      focusable={false}
                      role={record.record_role}
                    />
                  </td>
                  <td
                    className="detail-records-account-column min-w-0 px-2 py-1.5"
                    data-label="Account"
                  >
                    {account ? (
                      <AccountDisplayLabel
                        account={account}
                        to={`/accounts/${account.account_id}`}
                      />
                    ) : (
                      "Unknown account"
                    )}
                  </td>
                  <td
                    className="detail-records-amount-column min-w-0 px-2 py-1.5 text-right"
                    data-label="Amount"
                  >
                    <AmountText
                      amount={recordDisplayAmount(record)}
                      tone="neutral"
                    />
                  </td>
                  <td
                    className="detail-records-category-column min-w-0 px-2 py-1.5"
                    data-label="Category"
                  >
                    {category ? (
                      <FqnPath
                        value={category.fqn}
                        variant="full-chip"
                        onActivate={
                          onFilterCategory
                            ? () => {
                                onFilterCategory(category.category_id);
                              }
                            : undefined
                        }
                      />
                    ) : account && account.account_type !== "flow" ? null : (
                      "Uncategorized"
                    )}
                  </td>
                  {variant === "full" ? (
                    <>
                      <td
                        className="detail-records-tags-column min-w-0 px-2 py-1.5"
                        data-label="Tags"
                      >
                        <div className="max-w-full overflow-visible">
                          <RecordTagSet
                            maps={maps}
                            onFilterTag={onFilterTag}
                            record={record}
                          />
                        </div>
                      </td>
                      <td
                        className="detail-records-member-column min-w-0 px-2 py-1.5"
                        data-label="Member"
                      >
                        {member ? (
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
                      </td>
                      <td
                        className="detail-records-status-column min-w-0 px-2 py-1.5"
                        data-label="Settlement"
                      >
                        <span className="flex w-full max-w-full min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap">
                          {record.settlement === "pending" ? (
                            <StatusIcon
                              className="size-4"
                              focusable={false}
                              status="pending"
                            />
                          ) : null}
                          <span>
                            {record.settlement
                              ? settlementStatusLabel(record.settlement)
                              : null}
                          </span>
                        </span>
                      </td>
                      <td
                        className="detail-records-memo-column text-muted-foreground min-w-0 px-2 py-1.5"
                        data-label="Memo"
                      >
                        {record.memo ? (
                          <span className="block break-words whitespace-pre-wrap">
                            {record.memo}
                          </span>
                        ) : null}
                      </td>
                    </>
                  ) : null}
                </tr>
                {expanded ? (
                  <tr
                    className={cn(
                      "detail-records-disclosure-row border-t border-[var(--hairline)]",
                      rowTone,
                      cancelled &&
                        "text-muted-foreground line-through decoration-1",
                    )}
                  >
                    <td
                      id={disclosureId}
                      className="detail-records-disclosure-cell px-3 py-2"
                      colSpan={variant === "decluttered" ? 4 : 8}
                    >
                      <dl className="grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[max-content_minmax(0,1fr)_max-content_minmax(0,1fr)]">
                        <dt className="text-muted-foreground">
                          {transaction.lifecycle_status === "expected"
                            ? "Expected"
                            : "Initiated"}
                        </dt>
                        <dd>
                          {formatFullCivilDate(transaction.initiated_date)}
                        </dd>
                        {record.settlement ? (
                          <>
                            <dt className="text-muted-foreground">
                              Settlement
                            </dt>
                            <dd>{settlementStatusLabel(record.settlement)}</dd>
                          </>
                        ) : null}
                        {record.pending_date ? (
                          <>
                            <dt className="text-muted-foreground">Pending</dt>
                            <dd className="font-mono">
                              {formatInstantTimestamp(record.pending_date)}
                            </dd>
                          </>
                        ) : null}
                        {record.posted_date ? (
                          <>
                            <dt className="text-muted-foreground">Posted</dt>
                            <dd className="font-mono">
                              {formatInstantTimestamp(record.posted_date)}
                            </dd>
                          </>
                        ) : null}
                        <dt className="text-muted-foreground">Role</dt>
                        <dd>{recordRoleLabel(record.record_role)}</dd>
                        <dt className="text-muted-foreground">Source</dt>
                        <dd>{sourceLabel(record.source)}</dd>
                        {variant === "decluttered" ? (
                          <>
                            <dt className="text-muted-foreground">Tags</dt>
                            <dd
                              className="min-w-0 [overflow-wrap:anywhere]"
                              data-testid="record-disclosure-tags"
                            >
                              {disclosureTags.length > 0
                                ? disclosureTags
                                    .map((tag) => tag.fqn)
                                    .join(", ")
                                : "—"}
                            </dd>
                            <dt className="text-muted-foreground">Member</dt>
                            <dd
                              className="min-w-0 [overflow-wrap:anywhere]"
                              data-testid="record-disclosure-member"
                            >
                              {member?.name ?? "—"}
                            </dd>
                          </>
                        ) : null}
                        <dt className="text-muted-foreground sm:col-start-1">
                          Memo
                        </dt>
                        <dd className="break-words whitespace-pre-wrap sm:col-span-3">
                          {record.memo || "—"}
                        </dd>
                      </dl>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export const TransactionDetailLoadingContent = () => (
  <div className="space-y-4 p-4">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-14 w-full" />
    <Skeleton className="h-44 w-full" />
  </div>
);

export const TransactionDetailErrorContent = ({
  errorMessage,
}: {
  readonly errorMessage: string;
}) => (
  <div className="p-4" role="alert">
    <p className="text-destructive font-semibold">
      Transaction could not be loaded.
    </p>
    <p className="text-muted-foreground mt-2 text-sm">{errorMessage}</p>
  </div>
);

export const TransactionDetailContent = ({
  maps,
  onFilterCategory,
  onFilterMember,
  onFilterTag,
  recordTableVariant = "full",
  transaction,
}: {
  readonly maps: LookupMaps;
  readonly onFilterCategory?: (categoryId: number) => void;
  readonly onFilterMember?: (memberId: number) => void;
  readonly onFilterTag?: (tagId: number) => void;
  readonly recordTableVariant?: "decluttered" | "full";
  readonly transaction: Transaction;
}) => {
  const summaryMemo = lineMemo(transaction);
  const effectiveRate = exchangeRateLabel(transaction);

  return (
    <div className="space-y-5 p-4">
      <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-3">
          <ClassBadge transactionClass={transaction.transaction_class} />
          {summaryMemo ? (
            <p
              className="text-muted-foreground font-body text-sm break-words whitespace-pre-wrap"
              data-testid="transaction-detail-summary-memo"
            >
              {summaryMemo}
            </p>
          ) : null}
        </div>
        <DetailAmountList transaction={transaction} />
      </header>
      {effectiveRate ? (
        <p
          className="min-w-0 font-mono text-sm break-all"
          data-testid="exchange-effective-rate"
        >
          Effective rate: {effectiveRate}
        </p>
      ) : null}

      <section aria-labelledby="transaction-detail-records">
        <h3
          id="transaction-detail-records"
          className="font-heading mb-2 text-sm font-semibold uppercase"
        >
          Journal records
        </h3>
        <DetailRecordsTable
          key={transaction.transaction_id}
          maps={maps}
          onFilterCategory={onFilterCategory}
          onFilterMember={onFilterMember}
          onFilterTag={onFilterTag}
          records={transaction.records}
          variant={recordTableVariant}
          transaction={transaction}
        />
      </section>

      <section
        aria-labelledby="transaction-detail-metadata"
        className="border-2 border-[var(--border-ink)] bg-[var(--band)] p-3"
      >
        <h3
          id="transaction-detail-metadata"
          className="font-heading mb-2 text-sm font-semibold uppercase"
        >
          Metadata
        </h3>
        <dl className="grid gap-2 text-sm sm:grid-cols-[9rem_1fr]">
          <dt className="font-heading text-muted-foreground uppercase">
            Source
          </dt>
          <dd>{uniqueRecordSources(transaction)}</dd>
          <dt className="font-heading text-muted-foreground uppercase">
            Created
          </dt>
          <dd>{formatInstantTimestamp(transaction.created_at)}</dd>
        </dl>
      </section>
    </div>
  );
};

export const TransactionDetailPanel = ({
  errorMessage,
  loading,
  lookups,
  onClose,
  onChangeLifecycle,
  onConfirmOccurrence,
  onDelete,
  onDismissOccurrence,
  onDuplicate,
  onEdit,
  onSplit,
  onFilterCategory,
  onRestoreFocus,
  transaction,
}: TransactionDetailPanelProps) => {
  const panelRef = useRef<HTMLElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const dismissButtonRef = useRef<HTMLButtonElement | null>(null);
  const lifecycleButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreLifecycleFocusRef = useRef(false);
  const restoreFocusOnCloseRef = useRef(true);
  const maps = useMemo(() => buildLookupMaps(lookups), [lookups]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmDismissOpen, setConfirmDismissOpen] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<
    string | undefined
  >();
  const [dismissErrorMessage, setDismissErrorMessage] = useState<
    string | undefined
  >();
  const [deleting, setDeleting] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [changingLifecycle, setChangingLifecycle] = useState(false);
  const [lifecycleErrorMessage, setLifecycleErrorMessage] = useState<string>();
  const [occurrenceActionError, setOccurrenceActionError] = useState<
    | {
        readonly message: string;
        readonly transactionId: Transaction["transaction_id"];
      }
    | undefined
  >();

  const closePanel = useCallback(() => {
    setOccurrenceActionError(undefined);
    onClose();
  }, [onClose]);

  useOutsidePointerClose({
    enabled: !confirmDeleteOpen && !confirmDismissOpen,
    floatingOverlaySelectors,
    onOutsideClose: () => {
      restoreFocusOnCloseRef.current = false;
      closePanel();
    },
    ref: panelRef,
  });

  const closeDeleteConfirmation = useCallback(() => {
    if (deleting) {
      return;
    }
    setDeleteErrorMessage(undefined);
    setConfirmDeleteOpen(false);
    window.requestAnimationFrame(() => {
      deleteButtonRef.current?.focus({ preventScroll: true });
    });
  }, [deleting]);

  const closeDismissConfirmation = useCallback(() => {
    if (dismissing) {
      return;
    }
    setDismissErrorMessage(undefined);
    setConfirmDismissOpen(false);
    window.requestAnimationFrame(() => {
      dismissButtonRef.current?.focus({ preventScroll: true });
    });
  }, [dismissing]);

  useEffect(() => {
    restoreFocusOnCloseRef.current = true;
    window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
  }, [transaction?.transaction_id]);

  useEffect(() => {
    if (changingLifecycle || !restoreLifecycleFocusRef.current) {
      return;
    }
    restoreLifecycleFocusRef.current = false;
    window.requestAnimationFrame(() => {
      lifecycleButtonRef.current?.focus({ preventScroll: true });
    });
  }, [changingLifecycle, transaction?.lifecycle_status]);

  useEffect(() => {
    return () => {
      if (restoreFocusOnCloseRef.current) {
        onRestoreFocus();
      }
    };
  }, [onRestoreFocus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (event.defaultPrevented) {
          return;
        }
        if (document.querySelector("[role='alertdialog']")) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        closePanel();
        return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closePanel]);

  const openDeleteConfirmation = () => {
    setDeleteErrorMessage(undefined);
    setConfirmDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!transaction) {
      return;
    }

    setDeleting(true);
    setDeleteErrorMessage(undefined);
    try {
      await onDelete(transaction);
    } catch (error) {
      setDeleteErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
      setDeleting(false);
    }
  };

  const confirmOccurrence = async () => {
    if (!transaction || !onConfirmOccurrence) {
      return;
    }

    setConfirming(true);
    setOccurrenceActionError(undefined);
    try {
      await onConfirmOccurrence(transaction);
    } catch (error) {
      setOccurrenceActionError({
        message:
          error instanceof Error ? error.message : "The API request failed.",
        transactionId: transaction.transaction_id,
      });
    } finally {
      setConfirming(false);
    }
  };

  const confirmDismiss = async () => {
    if (!transaction || !onDismissOccurrence) {
      return;
    }

    setDismissing(true);
    setDismissErrorMessage(undefined);
    try {
      await onDismissOccurrence(transaction);
    } catch (error) {
      setDismissErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
    } finally {
      setDismissing(false);
    }
  };

  const changeLifecycle = async (action: "cancel" | "restore") => {
    if (!transaction) {
      return;
    }
    restoreLifecycleFocusRef.current = true;
    setChangingLifecycle(true);
    setLifecycleErrorMessage(undefined);
    try {
      await onChangeLifecycle(transaction, action);
    } catch (error) {
      setLifecycleErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
    } finally {
      setChangingLifecycle(false);
    }
  };

  const expectedOccurrence =
    transaction !== undefined &&
    transaction.lifecycle_status === "expected" &&
    transaction.recurring_occurrence_id !== null;
  const expectedOccurrenceActionsAvailable =
    expectedOccurrence &&
    onConfirmOccurrence !== undefined &&
    onDismissOccurrence !== undefined;
  const occurrenceActionsDisabled = confirming || dismissing;
  const occurrenceActionsDisabledReason = occurrenceActionsDisabled
    ? "Occurrence action in progress."
    : undefined;
  const occurrenceActionErrorMessage =
    occurrenceActionError !== undefined &&
    occurrenceActionError.transactionId === transaction?.transaction_id
      ? occurrenceActionError.message
      : undefined;

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-labelledby="transaction-detail-title"
      className="bg-card fixed top-4 right-4 bottom-4 z-50 flex w-[min(760px,calc(100vw-2rem))] max-w-full flex-col border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
      data-testid="transaction-detail-panel"
      tabIndex={-1}
    >
      <div className="bg-card sticky top-0 z-10 flex items-start justify-between gap-3 border-b-2 border-[var(--border-ink)] p-4">
        <div className="min-w-0">
          <p className="font-heading text-muted-foreground text-xs font-semibold uppercase">
            Transaction detail
          </p>
          {transaction ? (
            <Tooltip
              asChild
              label={transactionAccountFqnContext(transaction, maps)}
              className="max-w-full"
            >
              <h2
                id="transaction-detail-title"
                className="font-heading text-xl font-bold [overflow-wrap:anywhere]"
                tabIndex={0}
              >
                {transaction.display_title}
              </h2>
            </Tooltip>
          ) : (
            <h2
              id="transaction-detail-title"
              className="font-heading text-xl font-bold [overflow-wrap:anywhere]"
            >
              Loading transaction
            </h2>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {transaction?.lifecycle_status === "active" && onEdit ? (
            <Button
              type="button"
              aria-label="Edit transaction"
              onClick={(event) => {
                onEdit(transaction, event.currentTarget);
              }}
            >
              <MagicEdit aria-hidden="true" />
              Edit
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Close transaction detail"
            onClick={closePanel}
          >
            <Close aria-hidden="true" />
          </Button>
        </div>
      </div>

      {transaction && !loading && !errorMessage ? (
        <TransactionLifecycleStrip transaction={transaction} />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <TransactionDetailLoadingContent />
        ) : errorMessage ? (
          <TransactionDetailErrorContent errorMessage={errorMessage} />
        ) : transaction ? (
          <TransactionDetailContent
            maps={maps}
            onFilterCategory={onFilterCategory}
            recordTableVariant="decluttered"
            transaction={transaction}
          />
        ) : null}
      </div>
      {transaction && !loading && !errorMessage ? (
        <div className="bg-card flex flex-wrap justify-end gap-2 border-t-2 border-[var(--border-ink)] p-4">
          {expectedOccurrence ? (
            expectedOccurrenceActionsAvailable ? (
              <>
                {occurrenceActionsDisabledReason ? (
                  <Tooltip label={occurrenceActionsDisabledReason}>
                    <Button type="button" disabled>
                      <Check aria-hidden="true" />
                      {confirming ? "Confirming" : "Confirm occurrence"}
                    </Button>
                  </Tooltip>
                ) : (
                  <Button
                    type="button"
                    onClick={() => {
                      void confirmOccurrence();
                    }}
                  >
                    <Check aria-hidden="true" />
                    Confirm occurrence
                  </Button>
                )}
                {occurrenceActionsDisabledReason ? (
                  <Tooltip label={occurrenceActionsDisabledReason}>
                    <Button
                      ref={dismissButtonRef}
                      type="button"
                      variant="outline"
                      disabled
                    >
                      <Close aria-hidden="true" />
                      Dismiss occurrence
                    </Button>
                  </Tooltip>
                ) : (
                  <Button
                    ref={dismissButtonRef}
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDismissErrorMessage(undefined);
                      setConfirmDismissOpen(true);
                    }}
                  >
                    <Close aria-hidden="true" />
                    Dismiss occurrence
                  </Button>
                )}
              </>
            ) : null
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={(event) => {
                  openNewTemplateEditor(
                    event.currentTarget,
                    transactionTemplateRecordsFromTransaction(transaction),
                  );
                }}
              >
                <CardText aria-hidden="true" />
                Create template
              </Button>
              {onDuplicate ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={(event) => {
                    onDuplicate(transaction, event.currentTarget);
                  }}
                >
                  <Copy aria-hidden="true" />
                  Duplicate
                </Button>
              ) : null}
              {transaction.lifecycle_status === "active" && onSplit ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={(event) => {
                    onSplit(transaction, event.currentTarget);
                  }}
                >
                  <Scissors aria-hidden="true" />
                  Split
                </Button>
              ) : null}
              {transaction.lifecycle_status === "active" &&
              transaction.settlement === "pending" ? (
                <Button
                  ref={lifecycleButtonRef}
                  type="button"
                  variant="outline"
                  disabled={changingLifecycle}
                  onClick={() => void changeLifecycle("cancel")}
                >
                  <Close aria-hidden="true" />
                  Cancel
                </Button>
              ) : null}
              {transaction.lifecycle_status === "cancelled" ? (
                <Button
                  ref={lifecycleButtonRef}
                  type="button"
                  variant="outline"
                  disabled={changingLifecycle}
                  onClick={() => void changeLifecycle("restore")}
                >
                  <Reload aria-hidden="true" />
                  Restore
                </Button>
              ) : null}
              <Button
                ref={deleteButtonRef}
                type="button"
                variant="destructive"
                onClick={openDeleteConfirmation}
              >
                <Trash aria-hidden="true" />
                Delete
              </Button>
            </>
          )}
          {lifecycleErrorMessage ? (
            <p className="text-destructive text-sm" role="alert">
              {lifecycleErrorMessage}
            </p>
          ) : null}
        </div>
      ) : null}
      {occurrenceActionErrorMessage ? (
        <p className="text-destructive px-4 pb-4 text-sm" role="alert">
          {occurrenceActionErrorMessage}
        </p>
      ) : null}
      <ConfirmationDialog
        confirmIcon={<Trash aria-hidden="true" />}
        confirmLabel="Delete transaction"
        errorMessage={deleteErrorMessage}
        open={confirmDeleteOpen && transaction !== undefined}
        pending={deleting}
        pendingLabel="Deleting"
        title="Delete transaction"
        onConfirm={() => {
          void confirmDelete();
        }}
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteConfirmation();
          }
        }}
      >
        {transaction ? (
          <TransactionDeleteDescription transaction={transaction} />
        ) : null}
      </ConfirmationDialog>
      <ConfirmationDialog
        confirmIcon={<Close aria-hidden="true" />}
        confirmLabel="Dismiss occurrence"
        errorMessage={dismissErrorMessage}
        open={confirmDismissOpen && transaction !== undefined}
        pending={dismissing}
        pendingLabel="Dismissing"
        title="Dismiss occurrence"
        onConfirm={() => {
          void confirmDismiss();
        }}
        onOpenChange={(open) => {
          if (!open) {
            closeDismissConfirmation();
          }
        }}
      >
        <p>
          This occurrence will be skipped. The recurring schedule will continue.
        </p>
      </ConfirmationDialog>
    </aside>
  );
};
