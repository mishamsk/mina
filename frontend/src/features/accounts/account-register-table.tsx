import {
  Check,
  Close,
  Plus,
  Reload,
  WarningDiamond,
} from "pixelarticons/react";
import { type KeyboardEvent, useRef, useState } from "react";

import type { DisplayAmount, JournalRecord, Transaction } from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RowActions } from "@/components/row-actions";
import { Tooltip } from "@/components/tooltip";
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
import {
  AmountText,
  FqnPath,
  type LookupMaps,
  postingStatusLabel,
  StatusIcon,
} from "@/features/ledger";
import { cn } from "@/lib/utils";
import {
  formatLocalCivilDate,
  formatLocalCivilDateParts,
  localTodayISODate,
} from "@/utils/date";

interface AccountRegisterTableProps {
  readonly errorMessage: string | undefined;
  readonly hideExpected: boolean;
  readonly loading: boolean;
  readonly lookupErrorMessage: string | undefined;
  readonly lookupsLoaded: boolean;
  readonly maps: LookupMaps;
  readonly onConfirmRecurringOccurrence?: (
    transaction: Transaction,
  ) => Promise<void>;
  readonly onDismissRecurringOccurrence?: (
    transaction: Transaction,
  ) => Promise<void>;
  readonly onHideExpectedChange: (hideExpected: boolean) => void;
  readonly onNewTransaction: () => void;
  readonly onNextPage: () => void;
  readonly onOpenRecord: (record: JournalRecord, opener: HTMLElement) => void;
  readonly onPageSizeChange: (pageSize: number) => void;
  readonly onPreviousPage: () => void;
  readonly onRetry: () => void;
  readonly onRetryLookups: () => void;
  readonly page: number;
  readonly pageSize: number;
  readonly pageSizeOptions: readonly number[];
  readonly records: readonly JournalRecord[] | undefined;
  readonly selectedRecordId: number | undefined;
  readonly showAccount?: boolean;
  readonly showRunningBalance?: boolean;
  readonly totalCount: number | undefined;
  readonly transactionErrorsById: Readonly<Record<number, string>>;
  readonly transactionsById: Readonly<Record<number, Transaction>>;
}

interface DismissOccurrenceDialog {
  readonly opener: HTMLElement;
  readonly rowIndex: number;
  readonly transaction: Transaction;
}

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

const pageCount = (totalCount: number | undefined, pageSize: number): number =>
  totalCount === undefined ? 1 : Math.max(1, Math.ceil(totalCount / pageSize));

const displayAmount = (
  amount: string | null | undefined,
  currency: string,
): DisplayAmount | undefined =>
  amount === null || amount === undefined ? undefined : { amount, currency };

const skeletonTemplate = (
  showAccount: boolean,
  showRunningBalance: boolean,
): string => {
  if (showAccount && showRunningBalance) {
    return "grid-cols-[7rem_minmax(9rem,1fr)_minmax(10rem,1.2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_6rem_8rem_8rem_5.5rem]";
  }
  if (showAccount) {
    return "grid-cols-[7rem_minmax(10rem,1fr)_minmax(10rem,1.2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_6rem_8rem_5.5rem]";
  }
  if (showRunningBalance) {
    return "grid-cols-[7rem_minmax(10rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_6rem_8rem_8rem_5.5rem]";
  }
  return "grid-cols-[7rem_minmax(10rem,1.5fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_6rem_8rem_5.5rem]";
};

const AccountRegisterSkeleton = ({
  showAccount,
  showRunningBalance,
}: {
  readonly showAccount: boolean;
  readonly showRunningBalance: boolean;
}) => {
  const template = skeletonTemplate(showAccount, showRunningBalance);
  const columnCount = 7 + (showAccount ? 1 : 0) + (showRunningBalance ? 1 : 0);

  return (
    <div
      className="bg-card min-h-0 flex-1 overflow-hidden border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
      aria-hidden="true"
    >
      <div
        className={cn(
          "grid gap-3 bg-[var(--table-header)] px-3 py-2",
          template,
        )}
      >
        {Array.from({ length: columnCount }).map((_, index) => (
          <Skeleton key={index} className="h-5" />
        ))}
      </div>
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "grid gap-3 px-3 py-3",
            template,
            index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
          )}
        >
          {Array.from({ length: columnCount }).map((__, cellIndex) => (
            <Skeleton key={cellIndex} className="h-5" />
          ))}
        </div>
      ))}
    </div>
  );
};

const AccountRegisterControls = ({
  hideExpected,
  onHideExpectedChange,
}: {
  readonly hideExpected: boolean;
  readonly onHideExpectedChange: (hideExpected: boolean) => void;
}) => (
  <div className="bg-card flex shrink-0 justify-end border-2 border-[var(--border-ink)] px-3 py-2 shadow-[var(--shadow-pixel)]">
    <label className="font-heading inline-flex min-h-9 items-center gap-2 text-xs font-semibold uppercase">
      <Checkbox
        data-account-register-focus-fallback="true"
        checked={hideExpected}
        onCheckedChange={(checked) => {
          onHideExpectedChange(checked === true);
        }}
      />
      Hide expected
    </label>
  </div>
);

export const AccountRegisterTable = ({
  errorMessage,
  hideExpected,
  loading,
  lookupErrorMessage,
  lookupsLoaded,
  maps,
  onConfirmRecurringOccurrence,
  onDismissRecurringOccurrence,
  onHideExpectedChange,
  onNewTransaction,
  onNextPage,
  onOpenRecord,
  onPageSizeChange,
  onPreviousPage,
  onRetry,
  onRetryLookups,
  page,
  pageSize,
  pageSizeOptions,
  records,
  selectedRecordId,
  showAccount = false,
  showRunningBalance = true,
  totalCount,
  transactionErrorsById,
  transactionsById,
}: AccountRegisterTableProps) => {
  const today = localTodayISODate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [busyOccurrenceId, setBusyOccurrenceId] = useState<
    number | undefined
  >();
  const [dismissDialog, setDismissDialog] = useState<
    DismissOccurrenceDialog | undefined
  >();
  const [occurrenceActionErrorMessage, setOccurrenceActionErrorMessage] =
    useState<string | undefined>();
  const [dismissActionErrorMessage, setDismissActionErrorMessage] = useState<
    string | undefined
  >();
  const runOccurrenceAction = async (
    action: ((transaction: Transaction) => Promise<void>) | undefined,
    transaction: Transaction | undefined,
    setErrorMessage: (message: string | undefined) => void,
  ): Promise<boolean> => {
    if (
      !action ||
      !transaction ||
      transaction.recurring_occurrence_id === null
    ) {
      return false;
    }

    setBusyOccurrenceId(transaction.recurring_occurrence_id);
    setErrorMessage(undefined);
    try {
      await action(transaction);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
      return false;
    } finally {
      setBusyOccurrenceId(undefined);
    }
  };
  const closeDismissConfirmation = () => {
    setDismissDialog(undefined);
    setDismissActionErrorMessage(undefined);
  };
  const restoreOccurrenceActionFocus = (
    opener: HTMLElement,
    rowIndex: number,
  ) => {
    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement !== document.body &&
        activeElement.isConnected
      ) {
        return;
      }

      if (opener.isConnected) {
        opener.focus({ preventScroll: true });
        return;
      }

      const rows = Array.from(
        rootRef.current?.querySelectorAll<HTMLTableRowElement>(
          "[data-testid='account-register-row']",
        ) ?? [],
      );
      const targetRow = rows[rowIndex] ?? rows[rowIndex - 1] ?? rows[0];
      if (targetRow) {
        targetRow.scrollIntoView({ block: "nearest" });
        targetRow.focus({ preventScroll: true });
        return;
      }

      rootRef.current
        ?.querySelector<HTMLElement>("[data-account-register-focus-fallback]")
        ?.focus({ preventScroll: true });
    });
  };
  const confirmDismissOccurrence = async () => {
    const dialog = dismissDialog;
    const dismissed = await runOccurrenceAction(
      onDismissRecurringOccurrence,
      dialog?.transaction,
      setDismissActionErrorMessage,
    );
    if (dismissed && dialog) {
      closeDismissConfirmation();
      restoreOccurrenceActionFocus(dialog.opener, dialog.rowIndex);
    }
  };

  if (loading && !records) {
    return (
      <div ref={rootRef} className="flex h-full min-h-0 flex-col gap-3">
        <AccountRegisterControls
          hideExpected={hideExpected}
          onHideExpectedChange={onHideExpectedChange}
        />
        <AccountRegisterSkeleton
          showAccount={showAccount}
          showRunningBalance={showRunningBalance}
        />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        ref={rootRef}
        className="border-destructive bg-card border-2 p-4 shadow-[var(--shadow-pixel)]"
        role="alert"
      >
        <p className="text-destructive font-semibold">
          Account records could not be loaded.
        </p>
        <details className="text-muted-foreground mt-3 text-sm">
          <summary className="text-foreground cursor-pointer">
            API error
          </summary>
          <pre className="mt-2 overflow-auto font-mono text-xs whitespace-pre-wrap">
            {errorMessage}
          </pre>
        </details>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={onRetry}
        >
          <Reload aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  if (!records || records.length === 0) {
    return (
      <div ref={rootRef} className="flex h-full min-h-0 flex-col gap-3">
        <AccountRegisterControls
          hideExpected={hideExpected}
          onHideExpectedChange={onHideExpectedChange}
        />
        <div className="bg-card flex flex-col items-start gap-3 border-2 border-[var(--border-ink)] p-6 shadow-[var(--shadow-pixel)]">
          <div className="space-y-1">
            <p className="font-heading text-base font-semibold uppercase">
              No records
            </p>
            <p className="font-body text-muted-foreground max-w-prose text-sm">
              This register will list records for the account once matching
              activity exists.
            </p>
          </div>
          <Button type="button" onClick={onNewTransaction}>
            <Plus aria-hidden="true" />
            New transaction
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="flex h-full min-h-0 flex-col gap-3"
      aria-busy={loading ? "true" : undefined}
    >
      <AccountRegisterControls
        hideExpected={hideExpected}
        onHideExpectedChange={onHideExpectedChange}
      />
      {occurrenceActionErrorMessage ? (
        <div
          className="border-destructive bg-card text-destructive border-2 p-3 text-sm shadow-[var(--shadow-pixel)]"
          role="alert"
        >
          {occurrenceActionErrorMessage}
        </div>
      ) : null}
      <div
        className="account-register-table-scroll bg-card min-h-0 flex-1 overflow-x-hidden overflow-y-auto border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
        data-testid="account-register-table-scroll"
      >
        {lookupErrorMessage ? (
          <div
            className="border-destructive bg-card border-b-2 p-3"
            role="alert"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-destructive font-semibold">
                  Reference data could not be loaded.
                </p>
                <details className="text-muted-foreground mt-2 text-sm">
                  <summary className="text-foreground cursor-pointer">
                    API error
                  </summary>
                  <pre className="mt-2 overflow-auto font-mono text-xs whitespace-pre-wrap">
                    {lookupErrorMessage}
                  </pre>
                </details>
              </div>
              <Button type="button" variant="outline" onClick={onRetryLookups}>
                <Reload aria-hidden="true" />
                Retry
              </Button>
            </div>
          </div>
        ) : null}
        <table
          className={cn(
            "account-register-table w-full table-fixed border-collapse text-sm",
            showAccount && "account-register-table--with-account",
            records.some((record) => record.posting_status === "expected") &&
              "account-register-table--has-expected",
            !showRunningBalance && "account-register-table--without-running",
          )}
        >
          <colgroup>
            <col className="account-register-date-column" />
            {showAccount ? (
              <col className="account-register-account-column" />
            ) : null}
            <col className="account-register-counterparty-column" />
            <col className="account-register-category-column" />
            <col className="account-register-memo-column" />
            <col className="account-register-status-column" />
            <col className="account-register-amount-column" />
            {showRunningBalance ? (
              <col className="account-register-running-column" />
            ) : null}
            <col className="account-register-actions-column" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[var(--table-header)]">
            <tr className="font-heading text-foreground border-b-2 border-[var(--border-ink)] text-left text-xs font-semibold uppercase">
              <th className="account-register-date-column px-3 py-2">Date</th>
              {showAccount ? (
                <th className="account-register-account-column px-3 py-2">
                  Account
                </th>
              ) : null}
              <th className="account-register-counterparty-column px-3 py-2">
                Counterparty
              </th>
              <th className="account-register-category-column px-3 py-2">
                Category
              </th>
              <th className="account-register-memo-column px-3 py-2">Memo</th>
              <th className="account-register-status-column px-3 py-2">
                Status
              </th>
              <th className="account-register-amount-column px-3 py-2 text-right">
                Amount
              </th>
              {showRunningBalance ? (
                <th className="account-register-running-column px-3 py-2 text-right">
                  Running
                </th>
              ) : null}
              <th className="account-register-actions-column px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => {
              const date = formatLocalCivilDateParts(record.pending_date);
              const transaction = transactionsById[record.transaction_id];
              const transactionError =
                transactionErrorsById[record.transaction_id];
              const account = maps.accountsById.get(record.account_id);
              const category = maps.categoriesById.get(record.category_id);
              const amount = displayAmount(record.amount, record.currency);
              const runningBalance = displayAmount(
                record.running_balance,
                record.currency,
              );
              const inactive = record.posting_status === "cancelled";
              const pending = record.posting_status === "pending";
              const expected = record.posting_status === "expected";
              const expectedOccurrence =
                expected &&
                transaction !== undefined &&
                transaction.recurring_occurrence_id !== null;
              const occurrenceActionBusy =
                transaction !== undefined &&
                transaction.recurring_occurrence_id !== null &&
                busyOccurrenceId === transaction.recurring_occurrence_id;
              const overdueExpected =
                expected && record.pending_date.slice(0, 10) < today;
              const showStatus = record.posting_status !== "posted";
              const selected = selectedRecordId === record.record_id;
              const walkRowFocus = (
                event: KeyboardEvent<HTMLTableRowElement>,
                direction: -1 | 1,
              ) => {
                const nextRecord = records[index + direction];
                if (!nextRecord) {
                  return;
                }
                event.preventDefault();
                const rows = Array.from(
                  event.currentTarget
                    .closest("tbody")
                    ?.querySelectorAll<HTMLTableRowElement>(
                      "[data-testid='account-register-row']",
                    ) ?? [],
                );
                const nextRow = rows[index + direction];
                nextRow?.scrollIntoView({ block: "nearest" });
                nextRow?.focus({ preventScroll: true });
                if (selectedRecordId !== undefined && nextRow) {
                  onOpenRecord(nextRecord, nextRow);
                }
              };

              return (
                <tr
                  key={record.record_id}
                  data-record-id={record.record_id}
                  data-testid="account-register-row"
                  className={cn(
                    "border-b border-[var(--hairline)] align-middle focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]",
                    index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
                    "cursor-pointer hover:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)]",
                    selected &&
                      "outline-2 outline-offset-[-2px] outline-[var(--ring)]",
                    inactive && "text-muted-foreground line-through",
                  )}
                  tabIndex={0}
                  onClick={(event) => {
                    if (
                      isInteractiveTarget(event.target, event.currentTarget)
                    ) {
                      return;
                    }
                    onOpenRecord(record, event.currentTarget);
                  }}
                  onKeyDown={(event) => {
                    if (
                      isInteractiveTarget(event.target, event.currentTarget)
                    ) {
                      return;
                    }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onOpenRecord(record, event.currentTarget);
                      return;
                    }
                    if (event.key === "ArrowDown") {
                      walkRowFocus(event, 1);
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      walkRowFocus(event, -1);
                    }
                  }}
                >
                  <td className="account-register-date-column px-3 py-2 font-mono">
                    <div>{date.day}</div>
                    <div className="text-muted-foreground text-xs">
                      {date.year}
                    </div>
                  </td>
                  {showAccount ? (
                    <td className="account-register-account-column px-3 py-2">
                      {lookupsLoaded && account ? (
                        <FqnPath value={account.fqn} />
                      ) : (
                        <span className="text-muted-foreground font-mono text-xs">
                          {lookupsLoaded
                            ? "Missing account"
                            : lookupErrorMessage
                              ? "Lookup unavailable"
                              : "Loading"}
                        </span>
                      )}
                    </td>
                  ) : null}
                  <td className="account-register-counterparty-column px-3 py-2">
                    {transaction ? (
                      <Tooltip
                        label={transaction.display_title}
                        className="block min-w-0"
                      >
                        <div className="truncate font-medium">
                          {transaction.display_title}
                        </div>
                      </Tooltip>
                    ) : (
                      <div
                        className={cn(
                          "truncate font-medium",
                          transactionError && "text-muted-foreground",
                        )}
                      >
                        {transactionError
                          ? "Transaction unavailable"
                          : "Resolving transaction"}
                      </div>
                    )}
                  </td>
                  <td className="account-register-category-column px-3 py-2">
                    {lookupsLoaded && category ? (
                      <FqnPath value={category.fqn} />
                    ) : (
                      <span className="text-muted-foreground font-mono text-xs">
                        {lookupsLoaded
                          ? "Missing category"
                          : lookupErrorMessage
                            ? "Lookup unavailable"
                            : "Loading"}
                      </span>
                    )}
                  </td>
                  <td className="account-register-memo-column px-3 py-2">
                    {record.memo ? (
                      <Tooltip label={record.memo} className="block min-w-0">
                        <div className="text-muted-foreground truncate">
                          {record.memo}
                        </div>
                      </Tooltip>
                    ) : null}
                  </td>
                  <td className="account-register-status-column px-3 py-2">
                    {showStatus ? (
                      <div className="flex items-center gap-1">
                        {overdueExpected ? (
                          <Tooltip label="Overdue occurrence">
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
                        {<StatusIcon status={record.posting_status} />}
                        <span className="font-mono text-xs">
                          {postingStatusLabel(record.posting_status)}
                        </span>
                      </div>
                    ) : null}
                  </td>
                  <td className="account-register-amount-column px-3 py-2 text-right whitespace-nowrap">
                    {amount ? (
                      <AmountText
                        amount={amount}
                        className={cn(
                          (inactive || pending) && "text-muted-foreground",
                          expected && "text-muted-foreground",
                          "justify-end",
                        )}
                        positiveSign
                        tone="neutral"
                      />
                    ) : null}
                  </td>
                  {showRunningBalance ? (
                    <td className="account-register-running-column px-3 py-2 text-right whitespace-nowrap">
                      {runningBalance ? (
                        <AmountText
                          amount={runningBalance}
                          className="justify-end"
                          positiveSign={false}
                          tone="neutral"
                        />
                      ) : (
                        <span className="text-muted-foreground font-mono">
                          -
                        </span>
                      )}
                    </td>
                  ) : null}
                  <td className="account-register-actions-column px-3 py-2 text-right align-middle">
                    {expectedOccurrence ? (
                      <RowActions
                        foldable
                        actions={[
                          {
                            disabled:
                              occurrenceActionBusy ||
                              !onConfirmRecurringOccurrence,
                            disabledReason: occurrenceActionBusy
                              ? "Occurrence action in progress."
                              : "Occurrence confirmation is unavailable.",
                            icon: <Check aria-hidden="true" />,
                            label: occurrenceActionBusy
                              ? "Confirming"
                              : "Confirm occurrence",
                            onSelect: (opener) => {
                              void (async () => {
                                const confirmed = await runOccurrenceAction(
                                  onConfirmRecurringOccurrence,
                                  transaction,
                                  setOccurrenceActionErrorMessage,
                                );
                                if (confirmed) {
                                  restoreOccurrenceActionFocus(opener, index);
                                }
                              })();
                            },
                          },
                          {
                            disabled:
                              occurrenceActionBusy ||
                              !onDismissRecurringOccurrence,
                            disabledReason: occurrenceActionBusy
                              ? "Occurrence action in progress."
                              : "Occurrence dismissal is unavailable.",
                            icon: <Close aria-hidden="true" />,
                            label: "Dismiss occurrence",
                            onSelect: (opener) => {
                              setDismissActionErrorMessage(undefined);
                              setDismissDialog({
                                opener,
                                rowIndex: index,
                                transaction,
                              });
                            },
                          },
                        ]}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="bg-card flex shrink-0 flex-col gap-3 border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)] sm:flex-row sm:items-center sm:justify-between"
        data-testid="account-register-pagination-footer"
      >
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="account-register-page-size" className="font-medium">
            Rows
          </label>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              onPageSizeChange(Number(value));
            }}
          >
            <SelectTrigger id="account-register-page-size" size="compact">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((option) => (
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
              data-testid="account-register-page-busy"
              role="status"
            >
              Loading
            </span>
          ) : null}
          <span className="text-muted-foreground font-mono text-sm">
            Page {page} of {pageCount(totalCount, pageSize)}
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
            disabled={page >= pageCount(totalCount, pageSize)}
          >
            Next
          </Button>
        </div>
      </div>
      <ConfirmationDialog
        confirmIcon={<Close aria-hidden="true" />}
        confirmLabel="Dismiss occurrence"
        errorMessage={dismissActionErrorMessage}
        onConfirm={() => {
          void confirmDismissOccurrence();
        }}
        onOpenChange={(open) => {
          if (!open) {
            closeDismissConfirmation();
          }
        }}
        open={dismissDialog !== undefined}
        pending={busyOccurrenceId !== undefined}
        pendingLabel="Dismissing"
        title="Dismiss occurrence"
      >
        <p>
          {dismissDialog
            ? `${dismissDialog.transaction.display_title} scheduled ${formatLocalCivilDate(
                dismissDialog.transaction.initiated_date,
              )}`
            : ""}
        </p>
        <p>This skips only this scheduled occurrence.</p>
      </ConfirmationDialog>
    </div>
  );
};
