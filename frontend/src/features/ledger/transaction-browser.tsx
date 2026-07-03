import { ChevronDown, ChevronRight, Plus } from "pixelarticons/react";
import { Fragment, useMemo, useState } from "react";

import type { DisplayAmount, JournalRecord, Transaction } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LedgerLookupsSnapshot } from "@/store";

import { AmountText } from "./amount-text";
import {
  buildLookupMaps,
  counterpartyTitle,
  displayAmountKey,
  formatDecimalAmount,
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

interface TransactionBrowserProps {
  readonly errorMessage: string | undefined;
  readonly hasNextPage: boolean;
  readonly loading: boolean;
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly onNewTransaction: () => void;
  readonly onNextPage: () => void;
  readonly onPageSizeChange: (pageSize: number) => void;
  readonly onPreviousPage: () => void;
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
        className="grid grid-cols-[5%_10%_29%_14%_17%_7%_6%_12%] gap-3 border-b border-[var(--hairline)] p-3 last:border-b-0"
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

const TagChip = ({
  label,
  micro = false,
  title,
}: {
  readonly label: string;
  readonly micro?: boolean;
  readonly title?: string;
}) => (
  <Tooltip
    label={title ?? label}
    className={cn(
      "bg-muted text-foreground inline-flex min-w-0 items-center border border-[var(--border-ink)] font-mono shadow-[var(--shadow-chip)]",
      micro
        ? "h-4 max-w-20 px-1 text-[11px] leading-none"
        : "h-5 max-w-28 px-1.5 text-xs",
    )}
  >
    <span className="truncate">{label}</span>
  </Tooltip>
);

const MemberChip = ({ name }: { readonly name: string }) => (
  <span
    className="font-heading text-foreground inline-grid size-6 place-items-center border border-[var(--border-ink)] bg-[var(--color-class-adjustment-bright)] text-[11px] font-semibold uppercase shadow-[var(--shadow-chip)]"
    title={name}
  >
    {name.slice(0, 2)}
  </span>
);

const MixedSentinel = ({ label = "Mixed" }: { readonly label?: string }) => (
  <span className="font-heading text-foreground bg-card inline-flex h-5 items-center border border-[var(--border-ink)] px-1.5 text-[11px] font-semibold uppercase shadow-[var(--shadow-chip)]">
    {label}
  </span>
);

const compactAmountsText = (amounts: readonly DisplayAmount[]): string => {
  const [first] = amounts;
  if (!first) {
    return "";
  }
  const oneCurrency = amounts.every(
    (amount) => amount.currency === first.currency,
  );
  if (oneCurrency) {
    return `${amounts
      .map((amount) => formatDecimalAmount(amount.amount, amount.currency))
      .join(" / ")} ${first.currency}`;
  }
  return amounts
    .map(
      (amount) =>
        `${formatDecimalAmount(amount.amount, amount.currency)} ${amount.currency}`,
    )
    .join(" / ");
};

const MixedAmounts = ({
  amounts,
}: {
  readonly amounts: readonly DisplayAmount[];
}) =>
  amounts.length > 0 ? (
    <span className="bg-card inline-flex h-7 max-w-full items-center border border-[var(--border-ink)] px-2 font-mono font-medium whitespace-nowrap tabular-nums shadow-[var(--shadow-chip)]">
      {compactAmountsText(amounts)}
    </span>
  ) : null;

const RecordStatus = ({ record }: { readonly record: JournalRecord }) => (
  <span>{record.posting_status === "posted" ? "" : record.posting_status}</span>
);

const isInteractiveTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  Boolean(
    target.closest(
      "a, button, input, select, textarea, summary, [role='button'], [contenteditable='true']",
    ),
  );

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
  onNewTransaction,
  onNextPage,
  onPageSizeChange,
  onPreviousPage,
  page,
  pageSize,
  totalCount,
  transactions,
}: TransactionBrowserProps) => {
  const [expandedTransactionIds, setExpandedTransactionIds] = useState<
    ReadonlySet<number>
  >(new Set());
  const maps = useMemo(() => buildLookupMaps(lookups), [lookups]);

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
      <div className="border-border bg-card border p-10 text-center">
        <EmptyStateSprite />
        <h2 className="text-pixel mt-4 text-base">No transactions</h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">
          Transaction lines appear here after activity is created or demo data
          is seeded.
        </p>
        <Button type="button" className="mt-5" onClick={onNewTransaction}>
          <Plus aria-hidden="true" />
          New transaction
        </Button>
      </div>
    );
  }

  return (
    <div
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
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[var(--table-header)]">
            <tr className="font-heading text-foreground border-b-2 border-[var(--border-ink)] text-left text-xs font-semibold uppercase">
              <th className="px-3 py-2">
                <span className="sr-only min-[1920px]:not-sr-only">Class</span>
              </th>
              <th className="px-3 py-2">Date</th>
              <th className="transactions-status-column px-1 py-2">
                <span className="sr-only">Status</span>
              </th>
              <th className="px-3 py-2">Description</th>
              <th className="transactions-category-column px-3 py-2">
                Category
              </th>
              <th className="transactions-tags-column px-3 py-2">Tags</th>
              <th className="transactions-member-column px-3 py-2">Member</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction, transactionIndex) => {
              const expanded = expandedTransactionIds.has(
                transaction.transaction_id,
              );
              const title = counterpartyTitle(transaction, maps);
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
                postingStatus === "pending" || postingStatus === "cancelled";
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
                    tabIndex={0}
                    onClick={(event) => {
                      if (isInteractiveTarget(event.target)) {
                        return;
                      }
                      toggleExpanded();
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") {
                        return;
                      }
                      if (isInteractiveTarget(event.target)) {
                        return;
                      }
                      event.preventDefault();
                      toggleExpanded();
                    }}
                  >
                    <td className="px-3 py-2">
                      <ClassIcon
                        transactionClass={transaction.transaction_class}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono">
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
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <span
                          className="mt-0.5 grid size-6 shrink-0 place-items-center"
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
                        <div className="min-w-0">
                          <div className="truncate font-medium" title={title}>
                            {title}
                          </div>
                          {memo ? (
                            <Tooltip label={memo} className="block min-w-0">
                              <div className="text-muted-foreground truncate text-xs">
                                {memo}
                              </div>
                            </Tooltip>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="transactions-category-column px-3 py-2">
                      {category === "mixed" ? (
                        <MixedSentinel />
                      ) : category ? (
                        <FqnPath value={category.fqn} variant="leaf-chip" />
                      ) : null}
                    </td>
                    <td className="transactions-tags-column px-3 py-2">
                      <div className="flex min-w-0 flex-nowrap gap-1 overflow-hidden">
                        {tags === "mixed" ? (
                          <MixedSentinel />
                        ) : (
                          tags.map((tag) => (
                            <TagChip
                              key={tag.tag_id}
                              label={tag.name}
                              micro
                              title={tag.fqn}
                            />
                          ))
                        )}
                      </div>
                    </td>
                    <td className="transactions-member-column px-3 py-2">
                      {member === "mixed" ? (
                        <MixedSentinel />
                      ) : member ? (
                        <MemberChip name={member.name} />
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex min-w-0 flex-row flex-wrap items-center justify-end gap-1">
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
                              transactionClass={transaction.transaction_class}
                            />
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="border-b border-[var(--border-ink)]">
                      <td colSpan={8} className="max-w-0 overflow-hidden p-0">
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

      <div className="bg-card flex shrink-0 flex-col gap-3 border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)] sm:flex-row sm:items-center sm:justify-between">
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
    </div>
  );
};
