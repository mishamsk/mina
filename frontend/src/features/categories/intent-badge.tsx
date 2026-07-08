import type { CategoryEconomicIntent } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

const intentLabels = {
  adjustment: "Adjustment",
  exchange: "Exchange",
  expense: "Expense",
  fee: "Fee",
  fx_gain_loss: "FX gain/loss",
  income: "Income",
  refund: "Refund",
  transfer: "Transfer",
} satisfies Record<CategoryEconomicIntent, string>;

const intentBadgeClasses = {
  adjustment:
    "bg-[var(--color-class-adjustment-bright)] text-foreground border-[var(--border-ink)]",
  exchange:
    "bg-[var(--color-class-currency_exchange-bright)] text-foreground border-[var(--border-ink)]",
  expense: "bg-muted text-foreground border-[var(--border-ink)]",
  fee: "bg-muted text-foreground border-[var(--border-ink)]",
  fx_gain_loss:
    "bg-card text-muted-foreground border-[var(--muted-foreground)]",
  income:
    "bg-[var(--color-class-income-bright)] text-foreground border-[var(--border-ink)]",
  refund:
    "bg-[var(--color-class-refund-bright)] text-foreground border-[var(--border-ink)]",
  transfer:
    "bg-[var(--color-class-transfer-bright)] text-foreground border-[var(--border-ink)]",
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
