import {
  Calendar,
  Check,
  Close,
  MagicEdit,
  Minus,
  Play,
  Reload,
  Repeat,
} from "pixelarticons/react";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  apiErrorMessage,
  confirmNextRecurringDefinition,
  deferRecurringDefinition,
  deleteRecurringDefinition,
  pauseRecurringDefinition,
  type RecurringDefinition,
  type RecurringDefinitionDeferRequest,
  type RecurringScheduleRule,
  resumeRecurringDefinition,
} from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { type RowAction, RowActions } from "@/components/row-actions";
import { focusWithoutTooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { refreshFeaturedBalances } from "@/features/featured-balances";
import {
  AmountText,
  displayAmountKey,
  FqnPath,
  MixedAmounts,
} from "@/features/ledger";
import { refreshOverview } from "@/features/overview";
import { cn } from "@/lib/utils";
import {
  invalidateAccountHeaders,
  invalidateAllAccountRegisterPages,
  invalidateAllAccountTransactionCache,
  invalidateGroupRegisterPages,
  invalidateTransactionPages,
} from "@/store";
import { formatLocalCivilDate } from "@/utils/date";

import type { RecurringDefinitionsSnapshot } from "./use-recurring-definitions-resource";

interface RecurringPageContentProps {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly onEdit: (
    definition: RecurringDefinition,
    opener: HTMLElement,
  ) => void;
  readonly onNotice: (message: string, tone?: "error" | "success") => void;
  readonly refresh: () => Promise<boolean>;
  readonly snapshot: RecurringDefinitionsSnapshot | undefined;
}

interface CancelTarget {
  readonly definition: RecurringDefinition;
  readonly opener: HTMLElement;
}

interface DeferTarget {
  readonly definition: RecurringDefinition;
  readonly opener: HTMLElement;
}

type DefinitionAction = "cancel" | "confirm" | "defer" | "pause" | "resume";

type DefinitionActionResult = Promise<{
  readonly data?: unknown;
  readonly error?: unknown;
}>;

type RefreshDefinitions = () => Promise<boolean>;

interface IntervalCadence {
  readonly every: number;
  readonly unit: "DAY" | "WEEK" | "MONTH" | "YEAR";
}

const ruleValue = (rule: RecurringScheduleRule, key: string): unknown =>
  rule[key];

const scheduleKind = (rule: RecurringScheduleRule): string | undefined => {
  const kind = ruleValue(rule, "kind");
  return typeof kind === "string" ? kind : undefined;
};

const intervalCadence = (
  definition: RecurringDefinition,
): IntervalCadence | undefined => {
  if (definition.schedule_class !== "interval") {
    return undefined;
  }
  const every = ruleValue(definition.schedule_rule, "every");
  const unit = ruleValue(definition.schedule_rule, "unit");
  if (
    typeof every !== "number" ||
    !Number.isInteger(every) ||
    every < 1 ||
    (unit !== "DAY" && unit !== "WEEK" && unit !== "MONTH" && unit !== "YEAR")
  ) {
    return undefined;
  }
  return { every, unit };
};

const pluralUnit = (unit: IntervalCadence["unit"], every: number): string => {
  const label = unit.toLowerCase();
  return every === 1 ? label : `${label}s`;
};

const scheduleSummary = (definition: RecurringDefinition): string => {
  const rule = definition.schedule_rule;
  if (definition.schedule_class === "interval") {
    const cadence = intervalCadence(definition);
    return cadence
      ? `Every ${cadence.every} ${pluralUnit(cadence.unit, cadence.every)}`
      : "Interval schedule";
  }
  if (scheduleKind(rule) === "last_day_of_month") {
    return "Last day of month";
  }
  const day = ruleValue(rule, "day");
  return typeof day === "number" &&
    Number.isInteger(day) &&
    day >= 1 &&
    day <= 31
    ? `Monthly on the ${day}${ordinalSuffix(day)}`
    : "Monthly schedule";
};

const ordinalSuffix = (day: number): string => {
  if (day % 100 >= 11 && day % 100 <= 13) {
    return "th";
  }
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};

const invalidateRecurringDefinitionMutationCaches = () => {
  invalidateTransactionPages();
  invalidateAllAccountRegisterPages();
  invalidateAllAccountTransactionCache();
  invalidateGroupRegisterPages();
};

export const refreshAfterRecurringDefinitionMutation = async (
  refresh: RefreshDefinitions,
): Promise<boolean> => {
  invalidateRecurringDefinitionMutationCaches();
  return refresh();
};

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

const RecurringDefinitionsSkeleton = () => (
  <div
    className="bg-card border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
    aria-label="Loading recurring definitions"
  >
    <div className="grid grid-cols-[minmax(12rem,1.2fr)_minmax(10rem,1fr)_6rem_8rem_10rem_11rem] bg-[var(--table-header)] py-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="px-3">
          <Skeleton className="h-5" />
        </div>
      ))}
    </div>
    {Array.from({ length: 6 }).map((_, index) => (
      <div
        key={index}
        className={cn(
          "grid grid-cols-[minmax(12rem,1.2fr)_minmax(10rem,1fr)_6rem_8rem_10rem_11rem] py-3",
          index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
        )}
      >
        {Array.from({ length: 6 }).map((_, cellIndex) => (
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
  onEdit,
  onNotice,
  refresh,
  snapshot,
}: RecurringPageContentProps) => {
  const [actionErrorMessage, setActionErrorMessage] = useState<string>();
  const [cancelTarget, setCancelTarget] = useState<CancelTarget>();
  const [deferTarget, setDeferTarget] = useState<DeferTarget>();
  const [deferEvery, setDeferEvery] = useState(1);
  const [deferUnit, setDeferUnit] = useState<IntervalCadence["unit"]>("MONTH");
  const [inFlight, setInFlight] = useState<{
    readonly action: DefinitionAction;
    readonly definitionId: number;
  }>();
  const inFlightRef = useRef<number | undefined>(undefined);
  const focusFallbackRef = useRef<HTMLDivElement>(null);

  const definitions = snapshot?.definitions ?? [];
  const restoreFocus = useCallback((opener: HTMLElement | undefined) => {
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) {
        focusWithoutTooltip(opener, { preventScroll: true });
        return;
      }
      focusFallbackRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const refreshAfterConfirm = useCallback(async () => {
    invalidateAccountHeaders();
    invalidateRecurringDefinitionMutationCaches();
    const [, , definitionsRefreshed] = await Promise.all([
      refreshFeaturedBalances(),
      refreshOverview(),
      refresh(),
    ]);
    return definitionsRefreshed;
  }, [refresh]);

  const runAction = useCallback(
    async (
      action: DefinitionAction,
      definition: RecurringDefinition,
      opener: HTMLElement,
      run: () => DefinitionActionResult,
      successMessage: string,
      refreshAfter = () => refreshAfterRecurringDefinitionMutation(refresh),
    ) => {
      if (inFlightRef.current !== undefined) {
        return;
      }
      inFlightRef.current = definition.recurring_definition_id;
      setActionErrorMessage(undefined);
      setInFlight({ action, definitionId: definition.recurring_definition_id });
      try {
        const result = await run();
        if (result.data !== undefined || !result.error) {
          await refreshAfter();
          onNotice(successMessage);
          return true;
        }
        setActionErrorMessage(
          apiErrorMessage(
            result.error,
            "Definition action could not be completed.",
          ),
        );
        return false;
      } finally {
        inFlightRef.current = undefined;
        setInFlight(undefined);
        restoreFocus(opener);
      }
    },
    [onNotice, refresh, restoreFocus],
  );

  const actionByDefinition = useMemo(
    () =>
      new Map<number, DefinitionAction>(
        inFlight ? [[inFlight.definitionId, inFlight.action]] : [],
      ),
    [inFlight],
  );

  const closeCancel = () => {
    if (inFlightRef.current !== undefined) {
      return;
    }
    const opener = cancelTarget?.opener;
    setCancelTarget(undefined);
    setActionErrorMessage(undefined);
    restoreFocus(opener);
  };

  const closeDefer = () => {
    if (inFlightRef.current !== undefined) {
      return;
    }
    const opener = deferTarget?.opener;
    setDeferTarget(undefined);
    setActionErrorMessage(undefined);
    restoreFocus(opener);
  };

  if (loading && !snapshot) {
    return <RecurringDefinitionsSkeleton />;
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
          Recurring definitions could not be loaded.
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
          onClick={() => void refresh()}
        >
          <Reload aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  if (definitions.length === 0) {
    return (
      <div
        ref={focusFallbackRef}
        className="bg-card flex h-full min-h-64 flex-col items-start justify-center gap-3 border-2 border-[var(--border-ink)] p-6 shadow-[var(--shadow-pixel)]"
        data-testid="recurring-definitions-empty-state"
        tabIndex={-1}
      >
        <Repeat
          className="size-8 text-[var(--color-class-transfer-ink)]"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="font-heading text-base font-semibold uppercase">
            No recurring definitions
          </p>
          <p className="font-body text-muted-foreground max-w-prose text-sm">
            Create a definition to schedule a complete balanced transaction.
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
              Definition action failed.
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {actionErrorMessage}
            </p>
          </div>
        ) : null}
        <div
          ref={focusFallbackRef}
          className="bg-card flex min-h-0 flex-1 flex-col overflow-hidden border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
          data-testid="recurring-definitions-table"
          tabIndex={-1}
        >
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="recurring-review-table w-full table-fixed border-collapse text-sm">
              <thead className="text-foreground sticky top-0 z-10 bg-[var(--table-header)]">
                <tr className="font-heading text-left text-xs font-semibold uppercase">
                  <th scope="col" className="w-[22%] px-3 py-2">
                    Definition
                  </th>
                  <th scope="col" className="w-[20%] px-3 py-2">
                    Schedule
                  </th>
                  <th scope="col" className="w-[10%] px-3 py-2">
                    Status
                  </th>
                  <th scope="col" className="w-[12%] px-3 py-2">
                    Next
                  </th>
                  <th scope="col" className="w-[18%] px-3 py-2 text-right">
                    Amount
                  </th>
                  <th scope="col" className="w-[18%] px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {definitions.map((definition, index) => {
                  const cadence = intervalCadence(definition);
                  const rowAction = actionByDefinition.get(
                    definition.recurring_definition_id,
                  );
                  const rowBusy = rowAction !== undefined;
                  const actionDisabled = inFlight !== undefined && !rowBusy;
                  const amounts = definition.display_amounts;
                  const status = definition.paused_at ? "Paused" : "Active";
                  const actions: readonly RowAction[] = [
                    {
                      disabled: actionDisabled || rowBusy,
                      disabledReason: rowBusy
                        ? "Definition action in progress."
                        : "Another definition action is in progress.",
                      icon: <MagicEdit aria-hidden="true" />,
                      label: "Edit definition",
                      onSelect: (opener) => onEdit(definition, opener),
                    },
                    {
                      disabled:
                        actionDisabled ||
                        rowBusy ||
                        Boolean(definition.paused_at),
                      disabledReason: definition.paused_at
                        ? "Resume the definition before confirming its next occurrence."
                        : rowBusy
                          ? "Definition action in progress."
                          : "Another definition action is in progress.",
                      icon: <Check aria-hidden="true" />,
                      label:
                        rowAction === "confirm" ? "Confirming" : "Confirm next",
                      onSelect: (opener) => {
                        void runAction(
                          "confirm",
                          definition,
                          opener,
                          () =>
                            confirmNextRecurringDefinition({
                              path: {
                                recurring_definition_id:
                                  definition.recurring_definition_id,
                              },
                            }),
                          "Next occurrence confirmed.",
                          refreshAfterConfirm,
                        );
                      },
                    },
                    {
                      disabled: actionDisabled || rowBusy,
                      disabledReason: rowBusy
                        ? "Definition action in progress."
                        : "Another definition action is in progress.",
                      icon: definition.paused_at ? (
                        <Play aria-hidden="true" />
                      ) : (
                        <Minus aria-hidden="true" />
                      ),
                      label: definition.paused_at ? "Resume" : "Pause",
                      kind: "toggle",
                      onToggle: (opener) => {
                        const action = definition.paused_at
                          ? "resume"
                          : "pause";
                        void runAction(
                          action,
                          definition,
                          opener,
                          () =>
                            definition.paused_at
                              ? resumeRecurringDefinition({
                                  path: {
                                    recurring_definition_id:
                                      definition.recurring_definition_id,
                                  },
                                })
                              : pauseRecurringDefinition({
                                  path: {
                                    recurring_definition_id:
                                      definition.recurring_definition_id,
                                  },
                                }),
                          definition.paused_at
                            ? "Definition resumed."
                            : "Definition paused.",
                        );
                      },
                      pressed: Boolean(definition.paused_at),
                    },
                    ...(cadence
                      ? [
                          {
                            disabled:
                              actionDisabled ||
                              rowBusy ||
                              Boolean(definition.paused_at),
                            disabledReason: definition.paused_at
                              ? "Resume the definition before deferring it."
                              : rowBusy
                                ? "Definition action in progress."
                                : "Another definition action is in progress.",
                            icon: <Calendar aria-hidden="true" />,
                            label: "Defer",
                            onSelect: (opener: HTMLElement) => {
                              setActionErrorMessage(undefined);
                              setDeferEvery(cadence.every);
                              setDeferUnit(cadence.unit);
                              setDeferTarget({ definition, opener });
                            },
                          },
                        ]
                      : [{ kind: "placeholder" as const }]),
                    {
                      disabled: actionDisabled || rowBusy,
                      disabledReason: rowBusy
                        ? "Definition action in progress."
                        : "Another definition action is in progress.",
                      icon: <Close aria-hidden="true" />,
                      label: "Cancel definition",
                      onSelect: (opener) => {
                        setActionErrorMessage(undefined);
                        setCancelTarget({ definition, opener });
                      },
                    },
                  ];
                  return (
                    <tr
                      key={definition.recurring_definition_id}
                      className={cn(
                        "align-middle",
                        index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
                        "focus-within:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)] hover:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)]",
                      )}
                      data-recurring-definition-id={
                        definition.recurring_definition_id
                      }
                      data-testid="recurring-definition-row"
                      tabIndex={0}
                      onClick={(event) =>
                        onEdit(definition, event.currentTarget)
                      }
                      onKeyDown={(event) => {
                        if (
                          isInteractiveTarget(event.target, event.currentTarget)
                        ) {
                          return;
                        }
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onEdit(definition, event.currentTarget);
                        }
                      }}
                    >
                      <td className="min-w-0 px-3 py-2 align-middle">
                        <FqnPath value={definition.fqn} />
                      </td>
                      <td className="px-3 py-2 align-middle font-mono">
                        {scheduleSummary(definition)}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <span
                          className={cn(
                            "inline-flex h-6 items-center border border-[var(--border-ink)] px-2 font-mono text-xs font-medium uppercase shadow-[var(--shadow-chip)]",
                            definition.paused_at
                              ? "bg-[var(--color-class-adjustment-bright)]"
                              : "bg-[var(--color-money-in-bright)]",
                          )}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-middle font-mono">
                        {definition.next_due_date
                          ? formatLocalCivilDate(definition.next_due_date)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right align-middle">
                        {amounts.length > 0 ? (
                          <div className="flex min-w-0 flex-row flex-nowrap items-center justify-end gap-1 overflow-visible">
                            {definition.transaction_class === "mixed" ? (
                              <MixedAmounts amounts={amounts} />
                            ) : (
                              amounts.map((amount) => (
                                <AmountText
                                  key={displayAmountKey(amount)}
                                  amount={amount}
                                  chip
                                  positiveSign={
                                    definition.transaction_class !==
                                      "transfer" &&
                                    definition.transaction_class !==
                                      "currency_exchange"
                                  }
                                  tone="neutral"
                                />
                              ))
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <RowActions
                          actions={actions}
                          className="justify-end"
                          foldable
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
        confirmLabel="Cancel definition"
        errorMessage={
          cancelTarget && !inFlight ? actionErrorMessage : undefined
        }
        onConfirm={() => {
          if (!cancelTarget) return;
          void runAction(
            "cancel",
            cancelTarget.definition,
            cancelTarget.opener,
            () =>
              deleteRecurringDefinition({
                path: {
                  recurring_definition_id:
                    cancelTarget.definition.recurring_definition_id,
                },
              }),
            "Definition cancelled.",
          ).then((success) => {
            if (success) setCancelTarget(undefined);
          });
        }}
        onOpenChange={(open) => {
          if (!open) closeCancel();
        }}
        open={Boolean(cancelTarget)}
        pending={inFlight?.action === "cancel"}
        pendingLabel="Cancelling"
        title="Cancel recurring definition"
      >
        <p>{cancelTarget?.definition.fqn ?? ""}</p>
        <p>
          This stops future occurrences. Generated transaction history remains
          unchanged.
        </p>
      </ConfirmationDialog>
      <ConfirmationDialog
        confirmIcon={<Calendar aria-hidden="true" />}
        confirmLabel="Defer definition"
        errorMessage={deferTarget && !inFlight ? actionErrorMessage : undefined}
        onConfirm={() => {
          if (!deferTarget) return;
          const body: RecurringDefinitionDeferRequest = {
            every: deferEvery,
            unit: deferUnit,
          };
          void runAction(
            "defer",
            deferTarget.definition,
            deferTarget.opener,
            () =>
              deferRecurringDefinition({
                body,
                path: {
                  recurring_definition_id:
                    deferTarget.definition.recurring_definition_id,
                },
              }),
            "Next occurrence deferred.",
          ).then((success) => {
            if (success) setDeferTarget(undefined);
          });
        }}
        onOpenChange={(open) => {
          if (!open) closeDefer();
        }}
        open={Boolean(deferTarget)}
        pending={inFlight?.action === "defer"}
        pendingLabel="Deferring"
        title="Defer next occurrence"
      >
        <p>{deferTarget?.definition.fqn ?? ""}</p>
        <label
          className="text-foreground grid gap-1 font-mono"
          htmlFor="recurring-defer-every"
        >
          Offset
          <span className="flex gap-2">
            <input
              id="recurring-defer-every"
              className="border-input bg-card h-9 w-20 border px-2 font-mono"
              min={1}
              onChange={(event) =>
                setDeferEvery(Math.max(1, Number(event.target.value) || 1))
              }
              type="number"
              value={deferEvery}
            />
            <select
              aria-label="Defer unit"
              className="border-input bg-card h-9 border px-2 font-mono"
              onChange={(event) =>
                setDeferUnit(event.target.value as IntervalCadence["unit"])
              }
              value={deferUnit}
            >
              <option value="DAY">day</option>
              <option value="WEEK">week</option>
              <option value="MONTH">month</option>
              <option value="YEAR">year</option>
            </select>
          </span>
        </label>
        <p>
          This re-anchors future non-materialized occurrences. Existing
          occurrences stay unchanged.
        </p>
      </ConfirmationDialog>
    </>
  );
};
