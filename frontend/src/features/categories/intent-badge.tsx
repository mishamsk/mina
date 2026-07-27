import type { CategoryEconomicIntent } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

const intentLabels = {
  expense: "Expense",
  income: "Income",
} satisfies Record<CategoryEconomicIntent, string>;

const intentBadgeClasses = {
  expense: "bg-muted text-foreground border-[var(--border-ink)]",
  income:
    "bg-[var(--color-class-income-bright)] text-foreground border-[var(--border-ink)]",
} satisfies Record<CategoryEconomicIntent, string>;

export const intentLabel = (economicIntent: CategoryEconomicIntent): string =>
  intentLabels[economicIntent];

interface IntentBadgeProps {
  readonly className?: string;
  readonly economicIntent: CategoryEconomicIntent;
}

export const IntentBadge = ({
  className,
  economicIntent,
}: IntentBadgeProps) => {
  const label = intentLabel(economicIntent);
  return (
    <Tooltip focusable={false} label={`Intent: ${label}`}>
      <span
        className={cn(
          "inline-flex max-w-full items-center border px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase shadow-[var(--shadow-chip)]",
          intentBadgeClasses[economicIntent],
          className,
        )}
      >
        {label}
      </span>
    </Tooltip>
  );
};
