import {
  Calendar,
  CardText,
  Check,
  Close,
  Copy,
  MagicEdit,
  Reload,
  Repeat,
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

import type {
  JournalRecord,
  RecurringDefinition,
  RecurringDefinitionDeferRequest,
  Transaction,
} from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RecurringDefinitionDeferDialog,
  recurringDefinitionRecordsFromTransaction,
} from "@/features/recurring";
import { transactionTemplateRecordsFromTransaction } from "@/features/templates";
import { useOutsidePointerClose } from "@/hooks/use-outside-pointer-close";
import { cn } from "@/lib/utils";
import {
  type LedgerLookupsSnapshot,
  openNewRecurringDefinitionEditor,
  openNewTemplateEditor,
} from "@/store";
import { formatInstantTimestamp, localCivilDate } from "@/utils/date";

import { AccountDisplayLabel } from "./account-display-label";
import { AmountText, UnavailableUsdAmountChip } from "./amount-text";
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
import { RecurringOccurrenceConfirmDialog } from "./recurring-occurrence-confirm-dialog";
import {
  defaultPostSettlementDateTimeValue,
  settlementDateTimeToISO,
} from "./settlement-date";
import { TagChip } from "./tag-chip";
import { transactionActionApplicability } from "./transaction-action-applicability";
import { TransactionDeleteDescription } from "./transaction-delete-description";
import { TransactionPostDialog } from "./transaction-post-dialog";

interface TransactionDetailPanelProps {
  readonly autoFocusOnTransactionChange?: boolean;
  readonly readOnly?: boolean;
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly onClose: () => void;
  readonly onChangeLifecycle: (
    transaction: Transaction,
    action: "cancel" | "restore",
  ) => Promise<void>;
  readonly onConfirmOccurrence?: (
    transaction: Transaction,
    actualDate: string,
  ) => Promise<void>;
  readonly onDeferProjection?: (
    transaction: Transaction,
    request: RecurringDefinitionDeferRequest,
  ) => Promise<void>;
  readonly onDelete: (transaction: Transaction) => Promise<void>;
  readonly onDismissOccurrence?: (transaction: Transaction) => Promise<void>;
  readonly onLoadRecurringDefinitionForProjection?: (
    transaction: Transaction,
  ) => Promise<RecurringDefinition>;
  readonly onDuplicate?: (
    transaction: Transaction,
    opener?: HTMLElement,
  ) => void;
  readonly onEdit?: (transaction: Transaction, opener?: HTMLElement) => void;
  readonly onPost: (
    transaction: Transaction,
    postedDate?: string,
  ) => Promise<void>;
  readonly onSplit?: (transaction: Transaction, opener?: HTMLElement) => void;
  readonly onFilterCategory?: (categoryId: number) => void;
  readonly onFilterMember?: (memberId: number) => void;
  readonly onFilterTag?: (tagId: number) => void;
  readonly onRestoreFocus: () => void;
  readonly transaction: Transaction | undefined;
  readonly transactionId: number;
}

const floatingOverlaySelectors = [
  "[data-slot='confirmation-dialog-content']",
  "[data-page-help-content]",
  "[data-recurring-definition-editor]",
  "[data-slot='select-content']",
  "[data-transaction-row='true']",
] as const;

const formatFullCivilDate = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
  }).format(localCivilDate(value));

const recordDisplayAmount = (record: JournalRecord) => ({
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

const lastUpdatedLabel = (
  createdAt: string | null | undefined,
  updatedAt: string | null | undefined,
): string => {
  if (!updatedAt || updatedAt === createdAt) {
    return "Never";
  }

  const updatedTime = Date.parse(updatedAt);
  if (Number.isNaN(updatedTime)) {
    return "Never";
  }

  return formatInstantTimestamp(updatedAt);
};

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
  showUSDDisplayAmounts,
  transaction,
}: {
  readonly showUSDDisplayAmounts: boolean;
  readonly transaction: Transaction;
}) => {
  const amounts = detailDisplayAmounts(transaction);

  return amounts.length > 0 ? (
    <div className="flex flex-wrap items-start justify-end gap-2">
      {amounts.map((amount, index) => {
        const positiveSign =
          transaction.transaction_class !== "transfer" &&
          transaction.transaction_class !== "currency_exchange";
        return (
          <div
            key={`${displayAmountKey(amount)}:${index}`}
            className="flex flex-col items-end gap-1"
            data-testid="transaction-detail-amount-pair"
          >
            <AmountText
              amount={amount}
              chip
              positiveSign={positiveSign}
              transactionClass={transaction.transaction_class}
            />
            {showUSDDisplayAmounts && amount.currency !== "USD" ? (
              amount.amount_usd === null ? (
                <UnavailableUsdAmountChip />
              ) : (
                <AmountText
                  amount={{
                    amount: amount.amount_usd,
                    currency: "USD",
                  }}
                  chip
                  positiveSign={positiveSign}
                  transactionClass={transaction.transaction_class}
                />
              )
            ) : null}
          </div>
        );
      })}
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
                        <dt className="text-muted-foreground">Updated</dt>
                        <dd
                          className="font-mono"
                          data-testid="record-updated-at"
                        >
                          {lastUpdatedLabel(
                            record.created_at,
                            record.updated_at,
                          )}
                        </dd>
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
  showUSDDisplayAmounts = false,
  transaction,
}: {
  readonly maps: LookupMaps;
  readonly onFilterCategory?: (categoryId: number) => void;
  readonly onFilterMember?: (memberId: number) => void;
  readonly onFilterTag?: (tagId: number) => void;
  readonly recordTableVariant?: "decluttered" | "full";
  readonly showUSDDisplayAmounts?: boolean;
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
        <DetailAmountList
          showUSDDisplayAmounts={showUSDDisplayAmounts}
          transaction={transaction}
        />
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
          <dd className="font-mono">
            {formatInstantTimestamp(transaction.created_at)}
          </dd>
          <dt className="font-heading text-muted-foreground uppercase">
            Updated
          </dt>
          <dd className="font-mono" data-testid="transaction-updated-at">
            {lastUpdatedLabel(transaction.created_at, transaction.updated_at)}
          </dd>
        </dl>
      </section>
    </div>
  );
};

export const TransactionDetailPanel = ({
  autoFocusOnTransactionChange = true,
  readOnly = false,
  errorMessage,
  loading,
  lookups,
  onClose,
  onChangeLifecycle,
  onConfirmOccurrence,
  onDeferProjection,
  onDelete,
  onDismissOccurrence,
  onDuplicate,
  onEdit,
  onPost,
  onLoadRecurringDefinitionForProjection,
  onSplit,
  onFilterCategory,
  onFilterMember,
  onFilterTag,
  onRestoreFocus,
  transaction,
  transactionId,
}: TransactionDetailPanelProps) => {
  const panelRef = useRef<HTMLElement | null>(null);
  const confirmOccurrenceButtonRef = useRef<HTMLButtonElement | null>(null);
  const deferButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const dismissButtonRef = useRef<HTMLButtonElement | null>(null);
  const lifecycleButtonRef = useRef<HTMLButtonElement | null>(null);
  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const postButtonRef = useRef<HTMLButtonElement | null>(null);
  const completedPostFocusTransactionIdsRef = useRef(new Set<number>());
  const postFocusSourceByTransactionIdRef = useRef(
    new Map<number, HTMLElement | null>(),
  );
  const transactionIdRef = useRef(transaction?.transaction_id);
  const restoreLifecycleFocusRef = useRef(false);
  const restoreFocusOnCloseRef = useRef(true);
  const maps = useMemo(() => buildLookupMaps(lookups), [lookups]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmOccurrenceOpen, setConfirmOccurrenceOpen] = useState(false);
  const [confirmDismissOpen, setConfirmDismissOpen] = useState(false);
  const [confirmPostOpen, setConfirmPostOpen] = useState(false);
  const [postDialogTransaction, setPostDialogTransaction] = useState<
    Transaction | undefined
  >();
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<
    string | undefined
  >();
  const [dismissErrorMessage, setDismissErrorMessage] = useState<
    string | undefined
  >();
  const [deferDefinition, setDeferDefinition] = useState<RecurringDefinition>();
  const [deferErrorMessage, setDeferErrorMessage] = useState<string>();
  const [deferLoading, setDeferLoading] = useState(false);
  const [deferOpen, setDeferOpen] = useState(false);
  const [deferring, setDeferring] = useState(false);
  const [postErrorMessage, setPostErrorMessage] = useState<
    string | undefined
  >();
  const [postedDateTime, setPostedDateTime] = useState("");
  const [sourcePostedDate, setSourcePostedDate] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [changingLifecycle, setChangingLifecycle] = useState(false);
  const [postingTransactionIds, setPostingTransactionIds] = useState<
    ReadonlySet<number>
  >(() => new Set());
  const [lifecycleActionError, setLifecycleActionError] = useState<
    | {
        readonly message: string;
        readonly transactionId: Transaction["transaction_id"];
      }
    | undefined
  >();
  const [occurrenceActionError, setOccurrenceActionError] = useState<
    | {
        readonly message: string;
        readonly transactionId: Transaction["transaction_id"];
      }
    | undefined
  >();
  const [renderedPostTransactionId, setRenderedPostTransactionId] =
    useState(transactionId);
  const deferLoadGenerationRef = useRef(0);
  if (renderedPostTransactionId !== transactionId) {
    setRenderedPostTransactionId(transactionId);
    setConfirmOccurrenceOpen(false);
    setDeferDefinition(undefined);
    setDeferErrorMessage(undefined);
    setDeferLoading(false);
    setDeferOpen(false);
    setConfirmPostOpen(false);
    setPostDialogTransaction(undefined);
    setPostErrorMessage(undefined);
    setPostedDateTime("");
  }

  const closePanel = useCallback(() => {
    setOccurrenceActionError(undefined);
    onClose();
  }, [onClose]);

  useOutsidePointerClose({
    enabled:
      !confirmDeleteOpen &&
      !confirmDismissOpen &&
      !confirmOccurrenceOpen &&
      !confirmPostOpen &&
      !deferOpen,
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

  const closeOccurrenceConfirmation = useCallback(() => {
    if (confirming) {
      return;
    }
    setOccurrenceActionError(undefined);
    setConfirmOccurrenceOpen(false);
    window.requestAnimationFrame(() => {
      confirmOccurrenceButtonRef.current?.focus({ preventScroll: true });
    });
  }, [confirming]);

  useEffect(() => {
    transactionIdRef.current = transaction?.transaction_id;
  }, [transaction?.transaction_id]);

  useEffect(() => {
    restoreFocusOnCloseRef.current = true;
    if (!autoFocusOnTransactionChange) {
      return;
    }
    const focusSource = document.activeElement;
    const frame = window.requestAnimationFrame(() => {
      if (
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body &&
        document.activeElement !== focusSource
      ) {
        return;
      }
      panelRef.current?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [autoFocusOnTransactionChange, transaction?.transaction_id]);

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
    const transactionId = transaction?.transaction_id;
    for (const completedTransactionId of completedPostFocusTransactionIdsRef.current) {
      if (completedTransactionId !== transactionId) {
        completedPostFocusTransactionIdsRef.current.delete(
          completedTransactionId,
        );
        postFocusSourceByTransactionIdRef.current.delete(
          completedTransactionId,
        );
      }
    }
    if (
      transactionId === undefined ||
      postingTransactionIds.has(transactionId) ||
      !completedPostFocusTransactionIdsRef.current.delete(transactionId)
    ) {
      return;
    }
    const focusSource =
      postFocusSourceByTransactionIdRef.current.get(transactionId);
    postFocusSourceByTransactionIdRef.current.delete(transactionId);
    window.requestAnimationFrame(() => {
      if (transactionIdRef.current !== transactionId) {
        return;
      }
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement !== focusSource &&
        activeElement !== document.body &&
        activeElement.matches(
          "a, button, input, select, textarea, [contenteditable='true'], " +
            "[tabindex]:not([tabindex='-1'])",
        )
      ) {
        return;
      }
      (postButtonRef.current?.isConnected
        ? postButtonRef.current
        : editButtonRef.current
      )?.focus({ preventScroll: true });
    });
  }, [
    postingTransactionIds,
    transaction?.settlement,
    transaction?.transaction_id,
  ]);

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

  const confirmOccurrence = async (actualDate: string) => {
    if (!transaction || !onConfirmOccurrence) {
      return;
    }

    setConfirming(true);
    setOccurrenceActionError(undefined);
    try {
      await onConfirmOccurrence(transaction, actualDate);
      setConfirmOccurrenceOpen(false);
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

  const closeDeferProjection = () => {
    if (deferring) {
      return;
    }
    deferLoadGenerationRef.current += 1;
    setDeferDefinition(undefined);
    setDeferErrorMessage(undefined);
    setDeferLoading(false);
    setDeferOpen(false);
    window.requestAnimationFrame(() => {
      deferButtonRef.current?.focus({ preventScroll: true });
    });
  };

  const openDeferProjection = () => {
    if (!transaction || !onLoadRecurringDefinitionForProjection) {
      return;
    }
    const generation = deferLoadGenerationRef.current + 1;
    deferLoadGenerationRef.current = generation;
    setDeferDefinition(undefined);
    setDeferErrorMessage(undefined);
    setDeferLoading(true);
    setDeferOpen(true);
    void onLoadRecurringDefinitionForProjection(transaction)
      .then((definition) => {
        if (deferLoadGenerationRef.current === generation) {
          setDeferDefinition(definition);
        }
      })
      .catch((error: unknown) => {
        if (deferLoadGenerationRef.current === generation) {
          setDeferErrorMessage(
            error instanceof Error ? error.message : "The API request failed.",
          );
        }
      })
      .finally(() => {
        if (deferLoadGenerationRef.current === generation) {
          setDeferLoading(false);
        }
      });
  };

  const confirmDeferProjection = async (
    request: RecurringDefinitionDeferRequest,
  ) => {
    if (!transaction || !onDeferProjection) {
      return;
    }
    setDeferring(true);
    setDeferErrorMessage(undefined);
    try {
      await onDeferProjection(transaction, request);
      setDeferOpen(false);
      setDeferDefinition(undefined);
      window.requestAnimationFrame(() => {
        deferButtonRef.current?.focus({ preventScroll: true });
      });
    } catch (error) {
      setDeferErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
    } finally {
      setDeferring(false);
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
    setLifecycleActionError(undefined);
    try {
      await onChangeLifecycle(transaction, action);
    } catch (error) {
      setLifecycleActionError({
        message:
          error instanceof Error ? error.message : "The API request failed.",
        transactionId: transaction.transaction_id,
      });
    } finally {
      setChangingLifecycle(false);
    }
  };

  const openPostConfirmation = () => {
    if (!transaction) {
      return;
    }
    setPostErrorMessage(undefined);
    const postedDate = defaultPostSettlementDateTimeValue();
    setPostedDateTime(postedDate.dateTime);
    setSourcePostedDate(postedDate.sourceDate);
    setPostDialogTransaction(transaction);
    setConfirmPostOpen(true);
  };

  const closePostConfirmation = () => {
    if (
      postDialogTransaction &&
      postingTransactionIds.has(postDialogTransaction.transaction_id)
    ) {
      return;
    }
    setPostErrorMessage(undefined);
    setConfirmPostOpen(false);
    setPostDialogTransaction(undefined);
    window.requestAnimationFrame(() => {
      postButtonRef.current?.focus({ preventScroll: true });
    });
  };

  const confirmPost = async () => {
    if (!postDialogTransaction) {
      return;
    }
    const postedDate = settlementDateTimeToISO(
      postedDateTime,
      sourcePostedDate,
    );
    if (!postedDate) {
      setPostErrorMessage("Enter a valid posted date.");
      return;
    }
    const transactionId = postDialogTransaction.transaction_id;
    postFocusSourceByTransactionIdRef.current.set(
      transactionId,
      postButtonRef.current,
    );
    setConfirmPostOpen(false);
    setPostDialogTransaction(undefined);
    setPostingTransactionIds((current) => new Set(current).add(transactionId));
    setPostErrorMessage(undefined);
    setLifecycleActionError(undefined);
    try {
      await onPost(postDialogTransaction, postedDate);
    } catch (error) {
      setLifecycleActionError({
        message:
          error instanceof Error ? error.message : "The API request failed.",
        transactionId,
      });
    } finally {
      completedPostFocusTransactionIdsRef.current.add(transactionId);
      setPostingTransactionIds((current) => {
        const next = new Set(current);
        next.delete(transactionId);
        return next;
      });
    }
  };

  const actionApplicability = transaction
    ? transactionActionApplicability(transaction)
    : undefined;
  const expectedOccurrence = Boolean(actionApplicability?.confirmOccurrence);
  const expectedOccurrenceActionsAvailable =
    expectedOccurrence &&
    onConfirmOccurrence !== undefined &&
    onDismissOccurrence !== undefined;
  const projectionDeferAvailable =
    actionApplicability?.deferProjection === true &&
    onDeferProjection !== undefined &&
    onLoadRecurringDefinitionForProjection !== undefined;
  const detailActionsApplicable =
    actionApplicability !== undefined &&
    Object.values(actionApplicability).some(Boolean);
  const occurrenceActionsDisabled = confirming || dismissing;
  const occurrenceActionsDisabledReason = occurrenceActionsDisabled
    ? "Occurrence action in progress."
    : undefined;
  const occurrenceActionErrorMessage =
    occurrenceActionError !== undefined &&
    occurrenceActionError.transactionId === transaction?.transaction_id
      ? occurrenceActionError.message
      : undefined;
  const posting =
    transaction !== undefined &&
    postingTransactionIds.has(transaction.transaction_id);
  const lifecycleErrorMessage =
    lifecycleActionError !== undefined &&
    lifecycleActionError.transactionId === transaction?.transaction_id
      ? lifecycleActionError.message
      : undefined;
  const lifecycleActionsDisabledReason = posting
    ? "Posting transaction."
    : changingLifecycle
      ? "Transaction lifecycle update in progress."
      : undefined;
  const postButton = (
    <Button
      ref={postButtonRef}
      type="button"
      variant="outline"
      disabled={posting || changingLifecycle}
      onClick={openPostConfirmation}
    >
      <Check aria-hidden="true" />
      {posting ? "Posting" : "Post"}
    </Button>
  );
  const cancelButton = (
    <Button
      ref={lifecycleButtonRef}
      type="button"
      variant="outline"
      disabled={posting || changingLifecycle}
      onClick={() => void changeLifecycle("cancel")}
    >
      <Close aria-hidden="true" />
      Cancel
    </Button>
  );

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-labelledby="transaction-detail-title"
      className="bg-card fixed top-4 right-4 bottom-4 z-50 flex w-[min(760px,calc(100vw-2rem))] max-w-full flex-col border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
      data-source-transaction-id={transaction?.transaction_id}
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
              {errorMessage && !loading
                ? "Transaction unavailable"
                : "Loading transaction"}
            </h2>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip label="Close transaction detail" asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Close transaction detail"
              onClick={closePanel}
            >
              <Close aria-hidden="true" />
            </Button>
          </Tooltip>
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
            onFilterMember={onFilterMember}
            onFilterTag={onFilterTag}
            recordTableVariant="decluttered"
            showUSDDisplayAmounts
            transaction={transaction}
          />
        ) : null}
      </div>
      {!readOnly &&
      detailActionsApplicable &&
      transaction &&
      !loading &&
      !errorMessage ? (
        <div className="bg-card flex flex-wrap justify-end gap-2 border-t-2 border-[var(--border-ink)] p-4">
          {expectedOccurrence ? (
            expectedOccurrenceActionsAvailable ? (
              <>
                {occurrenceActionsDisabledReason ? (
                  <Tooltip label={occurrenceActionsDisabledReason}>
                    <Button
                      ref={confirmOccurrenceButtonRef}
                      type="button"
                      disabled
                    >
                      <Check aria-hidden="true" />
                      {confirming ? "Confirming" : "Confirm occurrence"}
                    </Button>
                  </Tooltip>
                ) : (
                  <Button
                    ref={confirmOccurrenceButtonRef}
                    type="button"
                    onClick={() => {
                      setOccurrenceActionError(undefined);
                      setConfirmOccurrenceOpen(true);
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
          ) : projectionDeferAvailable ? (
            <Button
              ref={deferButtonRef}
              type="button"
              onClick={openDeferProjection}
            >
              <Calendar aria-hidden="true" />
              Defer
            </Button>
          ) : (
            <>
              {actionApplicability?.edit && onEdit ? (
                <Tooltip
                  disabled={!posting}
                  focusable={posting}
                  label="Posting transaction."
                >
                  <Button
                    ref={editButtonRef}
                    type="button"
                    disabled={posting}
                    onClick={(event) => {
                      onEdit(transaction, event.currentTarget);
                    }}
                  >
                    <MagicEdit aria-hidden="true" />
                    Edit
                  </Button>
                </Tooltip>
              ) : null}
              {actionApplicability?.createTemplate ? (
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
              ) : null}
              {actionApplicability?.createRecurring ? (
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Create recurring"
                  onClick={(event) => {
                    openNewRecurringDefinitionEditor(
                      event.currentTarget,
                      recurringDefinitionRecordsFromTransaction(transaction),
                    );
                  }}
                >
                  <Repeat aria-hidden="true" />
                  Create recurring
                </Button>
              ) : null}
              {actionApplicability?.duplicate && onDuplicate ? (
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
              {actionApplicability?.split && onSplit ? (
                <Tooltip
                  disabled={!posting}
                  focusable={posting}
                  label="Posting transaction."
                >
                  <Button
                    type="button"
                    variant="outline"
                    disabled={posting}
                    onClick={(event) => {
                      onSplit(transaction, event.currentTarget);
                    }}
                  >
                    <Scissors aria-hidden="true" />
                    Split
                  </Button>
                </Tooltip>
              ) : null}
              {actionApplicability?.post ? (
                <div className="flex shrink-0 flex-nowrap gap-2">
                  <Tooltip
                    disabled={!lifecycleActionsDisabledReason}
                    focusable={Boolean(lifecycleActionsDisabledReason)}
                    label={lifecycleActionsDisabledReason ?? ""}
                  >
                    {postButton}
                  </Tooltip>
                  <Tooltip
                    disabled={!lifecycleActionsDisabledReason}
                    focusable={Boolean(lifecycleActionsDisabledReason)}
                    label={lifecycleActionsDisabledReason ?? ""}
                  >
                    {cancelButton}
                  </Tooltip>
                </div>
              ) : null}
              {actionApplicability?.restore ? (
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
              {actionApplicability?.delete ? (
                <Tooltip
                  disabled={!posting}
                  focusable={posting}
                  label="Posting transaction."
                >
                  <Button
                    ref={deleteButtonRef}
                    type="button"
                    variant="destructive"
                    disabled={posting}
                    onClick={openDeleteConfirmation}
                  >
                    <Trash aria-hidden="true" />
                    Delete
                  </Button>
                </Tooltip>
              ) : null}
            </>
          )}
          {lifecycleErrorMessage ? (
            <p className="text-destructive text-sm" role="alert">
              {lifecycleErrorMessage}
            </p>
          ) : null}
        </div>
      ) : null}
      {occurrenceActionErrorMessage && !confirmOccurrenceOpen ? (
        <p className="text-destructive px-4 pb-4 text-sm" role="alert">
          {occurrenceActionErrorMessage}
        </p>
      ) : null}
      {confirmPostOpen && postDialogTransaction ? (
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
          onPostedDateTimeChange={(value) => {
            setPostedDateTime(value);
            setPostErrorMessage(undefined);
          }}
          pending={false}
          postedDateTime={postedDateTime}
          transaction={postDialogTransaction}
        />
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
      <RecurringOccurrenceConfirmDialog
        errorMessage={occurrenceActionErrorMessage}
        onConfirm={(actualDate) => {
          void confirmOccurrence(actualDate);
        }}
        onOpenChange={(open) => {
          if (!open) {
            closeOccurrenceConfirmation();
          }
        }}
        open={confirmOccurrenceOpen}
        pending={confirming}
        transaction={transaction}
      />
      <RecurringDefinitionDeferDialog
        definition={deferDefinition}
        errorMessage={deferErrorMessage}
        loading={deferLoading}
        onConfirm={(request) => {
          void confirmDeferProjection(request);
        }}
        onOpenChange={(open) => {
          if (!open) closeDeferProjection();
        }}
        open={deferOpen}
        pending={deferring}
      />
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
