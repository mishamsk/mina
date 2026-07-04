import { Close, Trash } from "pixelarticons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DisplayAmount, JournalRecord, Transaction } from "@/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LedgerLookupsSnapshot } from "@/store";

import { AmountText } from "./amount-text";
import { ClassBadge } from "./class-badge";
import {
  buildLookupMaps,
  displayAmountKey,
  formatInitiatedDate,
  type LookupMaps,
  transactionClassLabel,
} from "./format";
import { FqnPath } from "./fqn-path";
import { StatusIcon } from "./line-icons";
import { TagChip } from "./tag-chip";

interface TransactionDetailPanelProps {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly onClose: () => void;
  readonly onDelete: (transaction: Transaction) => Promise<void>;
  readonly onRestoreFocus: () => void;
  readonly transaction: Transaction | undefined;
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

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

const statusLabel = (value: string): string =>
  `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;

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

const DetailAmountSummary = ({
  transaction,
}: {
  readonly transaction: Transaction;
}) => {
  const amounts = detailDisplayAmounts(transaction);
  return amounts.length > 0 ? (
    <span className="inline-flex flex-wrap gap-1">
      {amounts.map((amount, index) => (
        <AmountText
          key={`${displayAmountKey(amount)}:${index}`}
          amount={amount}
          positiveSign={
            transaction.transaction_class !== "transfer" &&
            transaction.transaction_class !== "currency_exchange"
          }
          transactionClass={transaction.transaction_class}
        />
      ))}
    </span>
  ) : (
    <span>No display amount</span>
  );
};

const RecordTagSet = ({
  maps,
  record,
}: {
  readonly maps: LookupMaps;
  readonly record: JournalRecord;
}) => {
  const tags = record.tag_ids
    .map((tagId) => maps.tagsById.get(tagId))
    .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));

  return tags.length > 0 ? (
    <div className="flex max-w-full flex-wrap gap-1">
      {tags.map((tag) => (
        <TagChip key={tag.tag_id} label={tag.name} tooltip={tag.fqn} />
      ))}
    </div>
  ) : null;
};

const DetailRecordsTable = ({
  maps,
  records,
}: {
  readonly maps: LookupMaps;
  readonly records: readonly JournalRecord[];
}) => (
  <div className="overflow-x-auto border-2 border-[var(--border-ink)]">
    <table className="w-full min-w-[980px] table-fixed border-collapse text-sm">
      <thead>
        <tr className="font-heading bg-[var(--table-header)] text-left text-xs font-semibold uppercase">
          <th className="w-[20%] px-2 py-2">Account</th>
          <th className="w-[12%] px-2 py-2 text-right">Amount</th>
          <th className="w-[16%] px-2 py-2">Category</th>
          <th className="w-[16%] px-2 py-2">Tags</th>
          <th className="w-[10%] px-2 py-2">Member</th>
          <th className="w-[13%] px-2 py-2">Statuses</th>
          <th className="w-[13%] px-2 py-2">Memo</th>
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
              <td className="px-2 py-2">
                <RecordTagSet maps={maps} record={record} />
              </td>
              <td className="px-2 py-2">{member?.name ?? ""}</td>
              <td className="px-2 py-2">
                <div className="flex flex-col gap-1">
                  <span className="inline-flex items-center gap-1">
                    <StatusIcon status={record.posting_status} />
                    {statusLabel(record.posting_status)}
                  </span>
                </div>
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

const LoadingPanelContent = () => (
  <div className="space-y-4 p-4">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-14 w-full" />
    <Skeleton className="h-44 w-full" />
  </div>
);

export const TransactionDetailPanel = ({
  errorMessage,
  loading,
  lookups,
  onClose,
  onDelete,
  onRestoreFocus,
  transaction,
}: TransactionDetailPanelProps) => {
  const panelRef = useRef<HTMLElement | null>(null);
  const deleteDialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const maps = useMemo(() => buildLookupMaps(lookups), [lookups]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<
    string | undefined
  >();
  const [deleting, setDeleting] = useState(false);

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
      closeButtonRef.current?.focus({ preventScroll: true });
    });

    return () => {
      onRestoreFocus();
    };
  }, [onRestoreFocus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (confirmDeleteOpen) {
          closeDeleteConfirmation();
        } else {
          onClose();
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const trapRoot = confirmDeleteOpen
        ? deleteDialogRef.current
        : panelRef.current;
      if (!trapRoot) {
        return;
      }
      const focusable = Array.from(
        trapRoot.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        trapRoot.focus();
        return;
      }

      if (!trapRoot.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeDeleteConfirmation, confirmDeleteOpen, onClose]);

  useEffect(() => {
    if (!confirmDeleteOpen) {
      return;
    }

    window.requestAnimationFrame(() => {
      cancelDeleteButtonRef.current?.focus({ preventScroll: true });
    });
  }, [confirmDeleteOpen]);

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
      aria-modal="true"
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
          ref={closeButtonRef}
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
          <LoadingPanelContent />
        ) : errorMessage ? (
          <div className="p-4" role="alert">
            <p className="text-destructive font-semibold">
              Transaction could not be loaded.
            </p>
            <p className="text-muted-foreground mt-2 text-sm">{errorMessage}</p>
          </div>
        ) : transaction ? (
          <div className="space-y-5 p-4">
            <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0 space-y-3">
                <ClassBadge transactionClass={transaction.transaction_class} />
                <p className="text-muted-foreground text-sm">
                  Initiated {formatInitiatedDate(transaction.initiated_date)}
                </p>
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
              <DetailRecordsTable maps={maps} records={transaction.records} />
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
        ) : null}
      </div>
      {transaction && !loading && !errorMessage ? (
        <div className="bg-card flex justify-end border-t-2 border-[var(--border-ink)] p-4">
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
      {confirmDeleteOpen && transaction ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-[color-mix(in_srgb,var(--frame),transparent_18%)] p-4"
          role="presentation"
        >
          <section
            ref={deleteDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-transaction-title"
            aria-describedby="delete-transaction-description"
            className="bg-card w-[min(480px,100%)] border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)]"
            tabIndex={-1}
          >
            <h3
              id="delete-transaction-title"
              className="font-heading text-base font-bold uppercase"
            >
              Delete transaction
            </h3>
            <div
              id="delete-transaction-description"
              className="font-body text-muted-foreground mt-3 space-y-2 text-sm"
            >
              <p>
                Delete {transaction.display_title} from{" "}
                {formatInitiatedDate(transaction.initiated_date)} for{" "}
                <DetailAmountSummary transaction={transaction} />?
              </p>
              <p>
                This tombstones the transaction and removes it from default
                transaction lists.
              </p>
            </div>
            {deleteErrorMessage ? (
              <p
                className="border-destructive text-destructive mt-3 border-2 p-2 text-sm"
                role="alert"
              >
                {deleteErrorMessage}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                ref={cancelDeleteButtonRef}
                type="button"
                variant="outline"
                onClick={closeDeleteConfirmation}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  void confirmDelete();
                }}
                disabled={deleting}
              >
                <Trash aria-hidden="true" />
                {deleting ? "Deleting" : "Delete transaction"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  );
};
