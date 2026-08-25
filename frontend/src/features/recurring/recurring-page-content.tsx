import {
  Calendar,
  Check,
  Close,
  MagicEdit,
  Play,
  Power,
  Reload,
  Repeat,
} from "pixelarticons/react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  apiErrorMessage,
  confirmNextRecurringDefinition,
  deferRecurringDefinition,
  deleteRecurringDefinition,
  pauseRecurringDefinition,
  type RecurringDefinition,
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
  invalidateTransactionsForRecurringDefinitionMutation,
  MixedAmounts,
} from "@/features/ledger";
import { refreshOverview } from "@/features/overview";
import { cn } from "@/lib/utils";
import {
  invalidateAccountHeaders,
  invalidateAllAccountRegisterPages,
  invalidateAllAccountTransactionCache,
  invalidateGroupRegisterPages,
} from "@/store";
import { formatLocalCivilDate } from "@/utils/date";

import {
  RecurringDefinitionDeferDialog,
  type RecurringDefinitionIntervalCadence,
  recurringDefinitionIntervalCadence,
} from "./recurring-definition-defer-dialog";
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

const ruleValue = (rule: RecurringScheduleRule, key: string): unknown =>
  rule[key];

const scheduleKind = (rule: RecurringScheduleRule): string | undefined => {
  const kind = ruleValue(rule, "kind");
  return typeof kind === "string" ? kind : undefined;
};

const pluralUnit = (
  unit: RecurringDefinitionIntervalCadence["unit"],
  every: number,
): string => {
  const label = unit.toLowerCase();
  return every === 1 ? label : `${label}s`;
};

const scheduleSummary = (definition: RecurringDefinition): string => {
  const rule = definition.schedule_rule;
  if (definition.schedule_class === "interval") {
    const cadence = recurringDefinitionIntervalCadence(definition);
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

export const invalidateRecurringDefinitionMutationCaches = () => {
  invalidateTransactionsForRecurringDefinitionMutation();
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

type PostedRecurringDefinitionConfirmationRequest = ReturnType<
  typeof confirmNextRecurringDefinition
>;

interface PendingPostedRecurringDefinitionConfirmation {
  consumers: number;
  readonly request: PostedRecurringDefinitionConfirmationRequest;
}

export interface PostedRecurringDefinitionConfirmation {
  readonly release: () => void;
  readonly result: PostedRecurringDefinitionConfirmationRequest;
}

const pendingPostedConfirmations = new Map<
  number,
  PendingPostedRecurringDefinitionConfirmation
>();
const pendingPostedConfirmationListeners = new Set<() => void>();
let pendingPostedConfirmationIds: ReadonlySet<number> = new Set();

const publishPendingPostedConfirmations = () => {
  pendingPostedConfirmationIds = new Set(pendingPostedConfirmations.keys());
  for (const listener of pendingPostedConfirmationListeners) {
    listener();
  }
};

export const getPendingPostedRecurringDefinitionConfirmationIds = () =>
  pendingPostedConfirmationIds;

export const subscribePendingPostedRecurringDefinitionConfirmations = (
  listener: () => void,
) => {
  pendingPostedConfirmationListeners.add(listener);
  return () => {
    pendingPostedConfirmationListeners.delete(listener);
  };
};

export const confirmNextRecurringDefinitionPosted = (
  recurringDefinitionId: number,
): PostedRecurringDefinitionConfirmation => {
  let pending = pendingPostedConfirmations.get(recurringDefinitionId);
  if (!pending) {
    pending = {
      consumers: 0,
      request: confirmNextRecurringDefinition({
        body: { status: "posted" },
        path: { recurring_definition_id: recurringDefinitionId },
      }),
    };
    pendingPostedConfirmations.set(recurringDefinitionId, pending);
    publishPendingPostedConfirmations();
  }
  pending.consumers += 1;
  let released = false;
  return {
    release: () => {
      if (released) {
        return;
      }
      released = true;
      const current = pendingPostedConfirmations.get(recurringDefinitionId);
      if (!current) {
        return;
      }
      current.consumers -= 1;
      if (current.consumers > 0) {
        return;
      }
      pendingPostedConfirmations.delete(recurringDefinitionId);
      publishPendingPostedConfirmations();
    },
    result: pending.request,
  };
};

export const refreshAfterRecurringDefinitionConfirmation = async (
  refresh: RefreshDefinitions,
): Promise<boolean> => {
  invalidateAccountHeaders();
  invalidateRecurringDefinitionMutationCaches();
  const [, , definitionsRefreshed] = await Promise.all([
    refreshFeaturedBalances(),
    refreshOverview(),
    refresh(),
  ]);
  return definitionsRefreshed;
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

export const revealRecurringDefinitionActionRow = (opener: HTMLElement) => {
  const row = opener.closest("tr");
  row?.scrollIntoView({ block: "nearest" });

  const table = row?.closest("table");
  const scrollContainer = table?.parentElement;
  const header = table?.querySelector("thead");
  if (!row || !scrollContainer || !header) {
    return;
  }

  const revealBelowStickyHeader = () => {
    if (!row.isConnected) {
      return;
    }
    const rowBounds = row.getBoundingClientRect();
    const containerBounds = scrollContainer.getBoundingClientRect();
    const headerBounds = header.getBoundingClientRect();
    const visibleTop = Math.max(containerBounds.top, headerBounds.bottom);
    if (rowBounds.top < visibleTop) {
      scrollContainer.scrollTop += Math.floor(rowBounds.top - visibleTop) - 1;
    } else if (rowBounds.bottom > containerBounds.bottom) {
      scrollContainer.scrollTop +=
        Math.ceil(rowBounds.bottom - containerBounds.bottom) + 1;
    }
  };
  revealBelowStickyHeader();
  window.requestAnimationFrame(revealBelowStickyHeader);
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
  const [inFlight, setInFlight] = useState<{
    readonly action: DefinitionAction;
    readonly definitionId: number;
  }>();
  const pendingConfirmationIds = useSyncExternalStore(
    subscribePendingPostedRecurringDefinitionConfirmations,
    getPendingPostedRecurringDefinitionConfirmationIds,
    getPendingPostedRecurringDefinitionConfirmationIds,
  );
  const inFlightRef = useRef<number | undefined>(undefined);
  const focusFallbackRef = useRef<HTMLDivElement>(null);

  const definitions = snapshot?.definitions ?? [];
  const restoreFocus = useCallback((opener: HTMLElement | undefined) => {
    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement !== document.body &&
        activeElement !== document.documentElement &&
        !opener?.contains(activeElement)
      ) {
        return;
      }
      if (opener?.isConnected) {
        revealRecurringDefinitionActionRow(opener);
        focusWithoutTooltip(opener, { preventScroll: true });
        window.requestAnimationFrame(() => {
          if (opener.isConnected && document.activeElement === opener) {
            revealRecurringDefinitionActionRow(opener);
          }
        });
        return;
      }
      focusFallbackRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const refreshAfterConfirm = useCallback(async () => {
    return refreshAfterRecurringDefinitionConfirmation(refresh);
  }, [refresh]);

  const runAction = useCallback(
    async (
      action: DefinitionAction,
      definition: RecurringDefinition,
      opener: HTMLElement,
      run: () => DefinitionActionResult,
      successMessage: string,
      refreshAfter = () => refreshAfterRecurringDefinitionMutation(refresh),
      onSettled?: () => void,
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
        onSettled?.();
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
                  const rowAction = actionByDefinition.get(
                    definition.recurring_definition_id,
                  );
                  const confirmationPending = pendingConfirmationIds.has(
                    definition.recurring_definition_id,
                  );
                  const rowBusy =
                    rowAction !== undefined || confirmationPending;
                  const actionDisabled =
                    (inFlight !== undefined ||
                      pendingConfirmationIds.size > 0) &&
                    !rowBusy;
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
                      id: "confirm-next",
                      icon: <Check aria-hidden="true" />,
                      label:
                        rowAction === "confirm" || confirmationPending
                          ? "Confirming"
                          : "Confirm next",
                      onSelect: (opener) => {
                        let releaseConfirmation: (() => void) | undefined;
                        void runAction(
                          "confirm",
                          definition,
                          opener,
                          () => {
                            const confirmation =
                              confirmNextRecurringDefinitionPosted(
                                definition.recurring_definition_id,
                              );
                            releaseConfirmation = confirmation.release;
                            return confirmation.result;
                          },
                          "Next occurrence confirmed.",
                          refreshAfterConfirm,
                          () => releaseConfirmation?.(),
                        );
                      },
                    },
                    {
                      disabled: actionDisabled || rowBusy,
                      disabledReason: rowBusy
                        ? "Definition action in progress."
                        : "Another definition action is in progress.",
                      id: "pause-resume",
                      icon: definition.paused_at ? (
                        <Play aria-hidden="true" />
                      ) : (
                        <Power aria-hidden="true" />
                      ),
                      label: definition.paused_at ? "Resume" : "Pause",
                      onSelect: (opener) => {
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
                    },
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
                        setDeferTarget({ definition, opener });
                      },
                    },
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
                      id={`definition-${definition.recurring_definition_id}`}
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
      <RecurringDefinitionDeferDialog
        definition={deferTarget?.definition}
        errorMessage={deferTarget && !inFlight ? actionErrorMessage : undefined}
        onConfirm={(body) => {
          if (!deferTarget) return;
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
      />
    </>
  );
};
