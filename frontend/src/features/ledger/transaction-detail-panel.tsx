import { Close, Copy, MagicEdit, Scissors, Trash } from "pixelarticons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DisplayAmount, JournalRecord, Transaction } from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOutsidePointerClose } from "@/hooks/use-outside-pointer-close";
import { cn } from "@/lib/utils";
import type { LedgerLookupsSnapshot } from "@/store";

import { AmountText } from "./amount-text";
import { ClassBadge } from "./class-badge";
import {
  buildLookupMaps,
  displayAmountKey,
  formatInitiatedDate,
  lineMemo,
  type LookupMaps,
  postingStatusLabel,
  transactionClassLabel,
} from "./format";
import { FqnPath } from "./fqn-path";
import { StatusIcon } from "./line-icons";
import { MemberChip } from "./member-chip";
import { TagChip } from "./tag-chip";
import { TransactionDeleteDescription } from "./transaction-delete-description";

interface TransactionDetailPanelProps {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly onClose: () => void;
  readonly onDelete: (transaction: Transaction) => Promise<void>;
  readonly onDuplicate?: (transaction: Transaction) => void;
  readonly onEdit?: (transaction: Transaction) => void;
  readonly onSplit?: (transaction: Transaction) => void;
  readonly onFilterCategory?: (categoryId: number) => void;
  readonly onFilterMember?: (memberId: number) => void;
  readonly onFilterTag?: (tagId: number) => void;
  readonly onRestoreFocus: () => void;
  readonly transaction: Transaction | undefined;
}

const floatingOverlaySelectors = ["[data-page-help-content]"] as const;

const formatTimestamp = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const recordDisplayAmount = (record: JournalRecord): DisplayAmount => ({
  amount: record.amount,
  currency: record.currency,
});

const detailDisplayAmounts = (
  transaction: Transaction,
): readonly DisplayAmount[] => {
  if (
    transaction.transaction_class === "transfer" ||
    transaction.transaction_class === "currency_exchange" ||
    transaction.transaction_class === "mixed"
  ) {
    return transaction.components.flatMap((component) => component.amounts);
  }
  return transaction.primary_amounts.length > 0
    ? transaction.primary_amounts
    : transaction.components.flatMap((component) => component.amounts);
};

const uniqueRecordSources = (transaction: Transaction): string =>
  Array.from(new Set(transaction.records.map((record) => record.source))).join(
    ", ",
  );

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
    <div className="flex max-w-full flex-wrap gap-1 pb-0.5">
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
    </div>
  ) : null;
};

const DetailRecordsTable = ({
  maps,
  onFilterCategory,
  onFilterMember,
  onFilterTag,
  records,
}: {
  readonly maps: LookupMaps;
  readonly onFilterCategory?: (categoryId: number) => void;
  readonly onFilterMember?: (memberId: number) => void;
  readonly onFilterTag?: (tagId: number) => void;
  readonly records: readonly JournalRecord[];
}) => (
  <div
    className="transaction-detail-records-table max-w-full overflow-visible border-2 border-[var(--border-ink)]"
    data-testid="transaction-detail-records-table"
  >
    <table className="w-full table-fixed border-collapse text-sm">
      <colgroup>
        <col className="detail-records-account-column" />
        <col className="detail-records-amount-column" />
        <col className="detail-records-category-column" />
        <col className="detail-records-tags-column" />
        <col className="detail-records-member-column" />
        <col className="detail-records-status-column" />
        <col className="detail-records-memo-column" />
      </colgroup>
      <thead>
        <tr className="font-heading bg-[var(--table-header)] text-left text-xs font-semibold uppercase">
          <th className="detail-records-account-column px-2 py-2">Account</th>
          <th className="detail-records-amount-column px-2 py-2 text-right">
            Amount
          </th>
          <th className="detail-records-category-column px-2 py-2">Category</th>
          <th className="detail-records-tags-column px-2 py-2">Tags</th>
          <th className="detail-records-member-column px-2 py-2">Member</th>
          <th className="detail-records-status-column px-2 py-2">Statuses</th>
          <th className="detail-records-memo-column px-2 py-2">Memo</th>
        </tr>
      </thead>
      <tbody>
        {records.map((record, index) => {
          const account = maps.accountsById.get(record.account_id);
          const category = maps.categoriesById.get(record.category_id);
          const member =
            record.member_id === null || record.member_id === undefined
              ? undefined
              : maps.membersById.get(record.member_id);

          return (
            <tr
              key={record.record_id}
              className={cn(
                "border-t border-[var(--hairline)] align-top",
                index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
                record.posting_status === "cancelled" &&
                  "text-muted-foreground line-through",
              )}
            >
              <td
                className="detail-records-account-column min-w-0 px-2 py-2"
                data-label="Account"
              >
                {account ? <FqnPath value={account.fqn} /> : "Unknown account"}
              </td>
              <td
                className="detail-records-amount-column min-w-0 px-2 py-2 text-right"
                data-label="Amount"
              >
                <AmountText
                  amount={recordDisplayAmount(record)}
                  tone="neutral"
                />
              </td>
              <td
                className="detail-records-category-column min-w-0 px-2 py-2 pb-2.5"
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
                ) : (
                  "Uncategorized"
                )}
              </td>
              <td
                className="detail-records-tags-column min-w-0 px-2 py-2 pb-2.5"
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
                className="detail-records-member-column min-w-0 px-2 py-2"
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
                className="detail-records-status-column min-w-0 px-2 py-2"
                data-label="Statuses"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="inline-flex items-center gap-1">
                    <StatusIcon status={record.posting_status} />
                    <span className="truncate">
                      {postingStatusLabel(record.posting_status)}
                    </span>
                  </span>
                </div>
              </td>
              <td
                className="detail-records-memo-column text-muted-foreground min-w-0 px-2 py-2"
                data-label="Memo"
              >
                {record.memo ? (
                  <Tooltip label={record.memo} className="block">
                    <span className="block truncate">{record.memo}</span>
                  </Tooltip>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

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
  transaction,
}: {
  readonly maps: LookupMaps;
  readonly onFilterCategory?: (categoryId: number) => void;
  readonly onFilterMember?: (memberId: number) => void;
  readonly onFilterTag?: (tagId: number) => void;
  readonly transaction: Transaction;
}) => {
  const summaryMemo = lineMemo(transaction);

  return (
    <div className="space-y-5 p-4">
      <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-3">
          <ClassBadge transactionClass={transaction.transaction_class} />
          <p className="text-muted-foreground text-sm">
            Initiated {formatInitiatedDate(transaction.initiated_date)}
          </p>
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

      <section aria-labelledby="transaction-detail-records">
        <h3
          id="transaction-detail-records"
          className="font-heading mb-2 text-sm font-semibold uppercase"
        >
          Journal records
        </h3>
        <DetailRecordsTable
          maps={maps}
          onFilterCategory={onFilterCategory}
          onFilterMember={onFilterMember}
          onFilterTag={onFilterTag}
          records={transaction.records}
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
            Class
          </dt>
          <dd>{transactionClassLabel(transaction.transaction_class)}</dd>
          <dt className="font-heading text-muted-foreground uppercase">
            Source
          </dt>
          <dd>{uniqueRecordSources(transaction)}</dd>
          <dt className="font-heading text-muted-foreground uppercase">
            Created
          </dt>
          <dd>{formatTimestamp(transaction.created_at)}</dd>
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
  onDelete,
  onDuplicate,
  onEdit,
  onSplit,
  onFilterCategory,
  onFilterMember,
  onFilterTag,
  onRestoreFocus,
  transaction,
}: TransactionDetailPanelProps) => {
  const panelRef = useRef<HTMLElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusOnCloseRef = useRef(true);
  const maps = useMemo(() => buildLookupMaps(lookups), [lookups]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<
    string | undefined
  >();
  const [deleting, setDeleting] = useState(false);

  useOutsidePointerClose({
    enabled: !confirmDeleteOpen,
    floatingOverlaySelectors,
    onOutsideClose: () => {
      restoreFocusOnCloseRef.current = false;
      onClose();
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

  useEffect(() => {
    window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
  }, [transaction?.transaction_id]);

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

        const target = event.target;
        if (
          (target instanceof Element &&
            target.closest("[data-slot='popover-content']")) ||
          document.querySelector("[data-slot='popover-content']")
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

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
          <h2
            id="transaction-detail-title"
            className="font-heading text-xl font-bold"
          >
            {transaction?.display_title ?? "Loading transaction"}
          </h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Close transaction detail"
          onClick={onClose}
        >
          <Close aria-hidden="true" />
        </Button>
      </div>

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
            transaction={transaction}
          />
        ) : null}
      </div>
      {transaction && !loading && !errorMessage ? (
        <div className="bg-card flex flex-wrap justify-end gap-2 border-t-2 border-[var(--border-ink)] p-4">
          {onEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onEdit(transaction);
              }}
            >
              <MagicEdit aria-hidden="true" />
              Edit
            </Button>
          ) : null}
          {onDuplicate ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onDuplicate(transaction);
              }}
            >
              <Copy aria-hidden="true" />
              Duplicate
            </Button>
          ) : null}
          {onSplit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onSplit(transaction);
              }}
            >
              <Scissors aria-hidden="true" />
              Split
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
        </div>
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
    </aside>
  );
};
