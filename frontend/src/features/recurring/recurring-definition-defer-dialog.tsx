import { Calendar } from "pixelarticons/react";
import { useRef, useState } from "react";

import type {
  RecurringDefinition,
  RecurringDefinitionDeferRequest,
} from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FqnPath } from "@/features/ledger";

export interface RecurringDefinitionIntervalCadence {
  readonly every: number;
  readonly unit: "DAY" | "WEEK" | "MONTH" | "YEAR";
}

export const recurringDefinitionIntervalCadence = (
  definition: RecurringDefinition,
): RecurringDefinitionIntervalCadence | undefined => {
  if (definition.schedule_class !== "interval") {
    return undefined;
  }
  const every = definition.schedule_rule.every;
  const unit = definition.schedule_rule.unit;
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

interface RecurringDefinitionDeferDialogProps {
  readonly definition: RecurringDefinition | undefined;
  readonly errorMessage: string | undefined;
  readonly loading?: boolean;
  readonly onConfirm: (request: RecurringDefinitionDeferRequest) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly pending: boolean;
}

const RecurringDefinitionDeferDialogContent = ({
  definition,
  errorMessage,
  loading = false,
  onConfirm,
  onOpenChange,
  open,
  pending,
}: RecurringDefinitionDeferDialogProps) => {
  const cadence = definition
    ? recurringDefinitionIntervalCadence(definition)
    : undefined;
  const [everyOverride, setEveryOverride] = useState<number>();
  const [unitOverride, setUnitOverride] =
    useState<RecurringDefinitionIntervalCadence["unit"]>();
  const every = everyOverride ?? cadence?.every ?? 1;
  const unit = unitOverride ?? cadence?.unit ?? "MONTH";
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <ConfirmationDialog
      confirmDisabled={!definition || loading}
      confirmDisabledTooltip={
        loading
          ? "Wait for the recurring definition to load."
          : !definition
            ? "The recurring definition could not be loaded."
            : undefined
      }
      confirmIcon={<Calendar aria-hidden="true" />}
      confirmLabel="Defer definition"
      confirmVariant="default"
      errorMessage={errorMessage}
      initialFocusRef={inputRef}
      onConfirm={() => {
        if (!definition) return;
        onConfirm(cadence ? { every, unit } : { every });
      }}
      onOpenChange={onOpenChange}
      open={open}
      pending={pending}
      pendingLabel="Deferring"
      title="Defer next occurrence"
    >
      {definition ? (
        <div className="min-w-0">
          <FqnPath value={definition.fqn} />
        </div>
      ) : (
        <Skeleton className="h-5 w-64" />
      )}
      {definition ? (
        <label
          className="text-foreground grid gap-1 font-mono"
          htmlFor="recurring-defer-every"
        >
          {cadence ? "Offset" : "Periods"}
          <span className="flex gap-2">
            <input
              ref={inputRef}
              id="recurring-defer-every"
              className="bg-card h-9 w-20 border-2 border-[var(--border-ink)] px-2 font-mono shadow-[var(--shadow-pixel)]"
              min={1}
              onChange={(event) =>
                setEveryOverride(Math.max(1, Number(event.target.value) || 1))
              }
              type="number"
              value={every}
            />
            {cadence ? (
              <select
                aria-label="Defer unit"
                className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono shadow-[var(--shadow-pixel)]"
                onChange={(event) =>
                  setUnitOverride(
                    event.target
                      .value as RecurringDefinitionIntervalCadence["unit"],
                  )
                }
                value={unit}
              >
                <option value="DAY">day</option>
                <option value="WEEK">week</option>
                <option value="MONTH">month</option>
                <option value="YEAR">year</option>
              </select>
            ) : null}
          </span>
        </label>
      ) : (
        <div
          aria-label="Loading recurring definition"
          aria-busy="true"
          className="grid gap-1"
        >
          <Skeleton className="h-5 w-16" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
      )}
      <p>
        This reschedules future occurrences. Existing transactions stay
        unchanged.
      </p>
    </ConfirmationDialog>
  );
};

export const RecurringDefinitionDeferDialog = (
  props: RecurringDefinitionDeferDialogProps,
) => (
  <RecurringDefinitionDeferDialogContent key={String(props.open)} {...props} />
);
