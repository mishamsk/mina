import {
  Calendar,
  Check,
  Close,
  Reload,
  WarningDiamond,
} from "pixelarticons/react";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  confirmRecurringOccurrenceById,
  dismissRecurringOccurrenceById,
  type RecurringDefinition,
  type RecurringOccurrence,
  type Transaction,
} from "@/api";
import { apiErrorMessage } from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { type RowAction, RowActions } from "@/components/row-actions";
import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AmountText,
  displayAmountKey,
  formatInitiatedDate,
  FqnPath,
  lineDisplayAmounts,
  MixedAmounts,
} from "@/features/ledger";
import { cn } from "@/lib/utils";
import { localTodayISODate } from "@/utils/date";

import {
  type RecurringReviewSnapshot,
  refreshRecurringAfterOccurrenceMutation,
} from "./use-recurring-review-resource";

interface RecurringPageContentProps {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly onNotice: (message: string) => void;
  readonly refresh: () => Promise<boolean>;
  readonly snapshot: RecurringReviewSnapshot | undefined;
}

interface DismissTarget {
  readonly definition: RecurringDefinition | undefined;
  readonly occurrence: RecurringOccurrence;
  readonly opener: HTMLElement;
}

const occurrenceSummary = (transaction: Transaction | undefined): string =>
  transaction?.display_title ?? "Generated transaction unavailable";

const occurrenceAmounts = (transaction: Transaction | undefined) =>
  transaction ? lineDisplayAmounts(transaction) : [];

const dismissDescription = (
  occurrence: RecurringOccurrence,
  definition: RecurringDefinition | undefined,
): string =>
  `${definition?.fqn ?? occurrence.recurring_definition_fqn} scheduled ${formatInitiatedDate(
    occurrence.scheduled_date,
  )}`;

const RecurringReviewSkeleton = () => (
  <div
    className="bg-card border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
    aria-label="Loading recurring occurrences"
  >
    <div className="grid grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(9rem,0.7fr)_7rem] bg-[var(--table-header)] py-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="px-3">
          <Skeleton className="h-5" />
        </div>
      ))}
    </div>
    {Array.from({ length: 6 }).map((_, index) => (
      <div
        key={index}
        className={cn(
          "grid grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(9rem,0.7fr)_7rem] py-3",
          index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
        )}
      >
        {Array.from({ length: 5 }).map((_, cellIndex) => (
          <div key={cellIndex} className="px-3">
            <Skeleton className="h-5" />
          </div>
        ))}
      </div>
    ))}
  </div>
);

export const RecurringPageContent = ({
  errorMessage,
  loading,
  onNotice,
  refresh,
  snapshot,
}: RecurringPageContentProps) => {
  const today = localTodayISODate();
  const [actionErrorMessage, setActionErrorMessage] = useState<
    string | undefined
  >();
  const [inFlightOccurrenceId, setInFlightOccurrenceId] = useState<
    number | undefined
  >();
  const [dismissTarget, setDismissTarget] = useState<
    DismissTarget | undefined
  >();
  const inFlightOccurrenceIdRef = useRef<number | undefined>(undefined);
  const focusFallbackRef = useRef<HTMLDivElement | null>(null);
  const definitionsById = useMemo(
    () =>
      new Map(
        snapshot?.definitions.map((definition) => [
          definition.recurring_definition_id,
          definition,
        ]) ?? [],
      ),
    [snapshot?.definitions],
  );
  const transactionsById = useMemo(
    () =>
      new Map(
        snapshot?.transactions.map((transaction) => [
          transaction.transaction_id,
          transaction,
        ]) ?? [],
      ),
    [snapshot?.transactions],
  );

  const restoreFocus = useCallback((opener: HTMLElement | undefined) => {
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) {
        focusWithoutTooltip(opener, { preventScroll: true });
        return;
      }
      focusFallbackRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const confirmOccurrence = useCallback(
    async (occurrence: RecurringOccurrence, opener: HTMLElement) => {
      if (inFlightOccurrenceIdRef.current !== undefined) {
        return;
      }

      inFlightOccurrenceIdRef.current = occurrence.recurring_occurrence_id;
      setActionErrorMessage(undefined);
      setInFlightOccurrenceId(occurrence.recurring_occurrence_id);
      try {
        const result = await confirmRecurringOccurrenceById(occurrence);
        if (result.data) {
          await refreshRecurringAfterOccurrenceMutation(refresh);
          onNotice("Occurrence confirmed.");
          return;
        }

        setActionErrorMessage(
          apiErrorMessage(result.error, "Occurrence could not be confirmed."),
        );
      } finally {
        inFlightOccurrenceIdRef.current = undefined;
        setInFlightOccurrenceId(undefined);
        restoreFocus(opener);
      }
    },
    [onNotice, refresh, restoreFocus],
  );

  const confirmDismiss = useCallback(async () => {
    if (!dismissTarget || inFlightOccurrenceIdRef.current !== undefined) {
      return;
    }

    const target = dismissTarget;
    let restoreOpener: HTMLElement | undefined;
    inFlightOccurrenceIdRef.current = target.occurrence.recurring_occurrence_id;
    setActionErrorMessage(undefined);
    setInFlightOccurrenceId(target.occurrence.recurring_occurrence_id);
    try {
      const result = await dismissRecurringOccurrenceById(target.occurrence);
      if (result.data) {
        restoreOpener = target.opener;
        await refreshRecurringAfterOccurrenceMutation(refresh);
        onNotice("Occurrence dismissed.");
        setDismissTarget(undefined);
        return;
      }

      setActionErrorMessage(
        apiErrorMessage(result.error, "Occurrence could not be dismissed."),
      );
    } finally {
      inFlightOccurrenceIdRef.current = undefined;
      setInFlightOccurrenceId(undefined);
      if (restoreOpener) {
        restoreFocus(restoreOpener);
      }
    }
  }, [dismissTarget, onNotice, refresh, restoreFocus]);

  if (loading && !snapshot) {
    return <RecurringReviewSkeleton />;
  }

  if (errorMessage) {
    return (
      <div
        ref={focusFallbackRef}
        className="border-destructive bg-card border-2 p-4 shadow-[var(--shadow-pixel)]"
        role="alert"
        tabIndex={-1}
      >
        <p className="text-destructive font-semibold">
          Recurring occurrences could not be loaded.
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
          onClick={() => {
            void refresh();
          }}
        >
          <Reload aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  if (!snapshot || snapshot.occurrences.length === 0) {
    return (
      <div
        ref={focusFallbackRef}
        className="bg-card flex h-full min-h-64 flex-col items-start justify-center gap-3 border-2 border-[var(--border-ink)] p-6 shadow-[var(--shadow-pixel)]"
        tabIndex={-1}
      >
        <div className="space-y-1">
          <p className="font-heading text-base font-semibold uppercase">
            No expected occurrences
          </p>
          <p className="font-body text-muted-foreground max-w-prose text-sm">
            The review queue is clear.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-3">
        {actionErrorMessage ? (
          <div
            className="border-destructive bg-card border-2 p-3 shadow-[var(--shadow-pixel)]"
            role="alert"
          >
            <p className="text-destructive font-semibold">
              Occurrence action failed.
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {actionErrorMessage}
            </p>
          </div>
        ) : null}
        <div
          ref={focusFallbackRef}
          className="bg-card flex min-h-0 flex-1 flex-col overflow-hidden border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
          data-testid="recurring-review-table"
          tabIndex={-1}
        >
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="text-foreground sticky top-0 z-10 bg-[var(--table-header)]">
                <tr className="font-heading text-left text-xs font-semibold uppercase">
                  <th scope="col" className="w-[8rem] px-3 py-2">
                    Scheduled
                  </th>
                  <th scope="col" className="w-[24%] px-3 py-2">
                    Definition
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Summary
                  </th>
                  <th scope="col" className="w-[22%] px-3 py-2 text-right">
                    Amount
                  </th>
                  <th scope="col" className="w-[7rem] px-1 py-2 text-center">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.occurrences.map((occurrence, index) => {
                  const definition = definitionsById.get(
                    occurrence.recurring_definition_id,
                  );
                  const transaction =
                    occurrence.generated_transaction_id === null
                      ? undefined
                      : transactionsById.get(
                          occurrence.generated_transaction_id,
                        );
                  const summary = occurrenceSummary(transaction);
                  const amounts = occurrenceAmounts(transaction);
                  const overdue = occurrence.scheduled_date < today;
                  const actionDisabled =
                    inFlightOccurrenceId !== undefined &&
                    inFlightOccurrenceId !== occurrence.recurring_occurrence_id;
                  const rowBusy =
                    inFlightOccurrenceId === occurrence.recurring_occurrence_id;
                  return (
                    <tr
                      key={occurrence.recurring_occurrence_id}
                      className={cn(
                        "group/recurring-row align-middle",
                        index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
                        "focus-within:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)] hover:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)]",
                      )}
                      data-recurring-occurrence-id={
                        occurrence.recurring_occurrence_id
                      }
                      data-testid="recurring-review-row"
                    >
                      <td className="px-3 py-2 align-middle">
                        <div className="flex min-w-0 items-center gap-2">
                          {overdue ? (
                            <Tooltip
                              label="Overdue occurrence"
                              className="size-6 shrink-0"
                            >
                              <span
                                className="inline-flex size-6 shrink-0 items-center justify-center border border-[var(--border-ink)] bg-[var(--color-class-adjustment-bright)] text-[var(--color-class-adjustment-ink)] shadow-[var(--shadow-chip)]"
                                aria-label="Overdue"
                                role="img"
                              >
                                <WarningDiamond
                                  className="size-4"
                                  aria-hidden="true"
                                />
                              </span>
                            </Tooltip>
                          ) : (
                            <span
                              className="inline-grid size-6 shrink-0 place-items-center text-[var(--color-status-pending-ink)]"
                              aria-hidden="true"
                            >
                              <Calendar className="size-5" />
                            </span>
                          )}
                          <span className="font-mono">
                            {formatInitiatedDate(occurrence.scheduled_date)}
                          </span>
                        </div>
                      </td>
                      <td className="min-w-0 px-3 py-2 align-middle">
                        <FqnPath
                          value={
                            definition?.fqn ??
                            occurrence.recurring_definition_fqn
                          }
                        />
                      </td>
                      <td className="min-w-0 px-3 py-2 align-middle">
                        <Tooltip label={summary} className="w-full">
                          <span className="block truncate font-mono">
                            {summary}
                          </span>
                        </Tooltip>
                      </td>
                      <td className="min-w-0 px-3 py-2 text-right align-middle">
                        <div className="flex max-w-full min-w-0 flex-row flex-nowrap justify-end gap-1 overflow-hidden">
                          {transaction?.transaction_class === "mixed" ? (
                            <MixedAmounts
                              amounts={amounts}
                              className="bg-card text-muted-foreground min-w-0 overflow-hidden"
                            />
                          ) : (
                            amounts.map((amount) => (
                              <AmountText
                                key={displayAmountKey(amount)}
                                amount={amount}
                                chip
                                className="bg-card text-muted-foreground min-w-0 overflow-hidden"
                                positiveSign={
                                  transaction?.transaction_class !==
                                    "transfer" &&
                                  transaction?.transaction_class !==
                                    "currency_exchange"
                                }
                                tone="neutral"
                              />
                            ))
                          )}
                        </div>
                      </td>
                      <td className="w-[7rem] px-1 py-2 align-middle">
                        <RowActions
                          foldable
                          actions={
                            [
                              {
                                disabled: actionDisabled || rowBusy,
                                disabledReason: rowBusy
                                  ? "Occurrence action in progress."
                                  : "Another occurrence action is in progress.",
                                icon: <Check aria-hidden="true" />,
                                label: rowBusy ? "Confirming" : "Confirm",
                                onSelect: (opener) => {
                                  void confirmOccurrence(occurrence, opener);
                                },
                              },
                              {
                                disabled: actionDisabled || rowBusy,
                                disabledReason: rowBusy
                                  ? "Occurrence action in progress."
                                  : "Another occurrence action is in progress.",
                                icon: <Close aria-hidden="true" />,
                                label: "Dismiss",
                                onSelect: (opener) => {
                                  setActionErrorMessage(undefined);
                                  setDismissTarget({
                                    definition,
                                    occurrence,
                                    opener,
                                  });
                                },
                              },
                            ] satisfies readonly RowAction[]
                          }
                          className="justify-center"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <ConfirmationDialog
        confirmIcon={<Close aria-hidden="true" />}
        confirmLabel="Dismiss occurrence"
        errorMessage={
          dismissTarget && inFlightOccurrenceId === undefined
            ? actionErrorMessage
            : undefined
        }
        onConfirm={() => {
          void confirmDismiss();
        }}
        onOpenChange={(open) => {
          if (open || inFlightOccurrenceId !== undefined) {
            return;
          }
          const opener = dismissTarget?.opener;
          setDismissTarget(undefined);
          setActionErrorMessage(undefined);
          restoreFocus(opener);
        }}
        open={Boolean(dismissTarget)}
        pending={inFlightOccurrenceId !== undefined}
        pendingLabel="Dismissing"
        title="Dismiss occurrence"
      >
        <p>
          {dismissTarget
            ? dismissDescription(
                dismissTarget.occurrence,
                dismissTarget.definition,
              )
            : ""}
        </p>
        <p>This skips only this scheduled occurrence.</p>
      </ConfirmationDialog>
    </>
  );
};
