import type { TransactionClass } from "@/api";
import { cn } from "@/lib/utils";

import { transactionClassLabel } from "./format";

interface ClassBadgeProps {
  readonly className?: string;
  readonly transactionClass: TransactionClass;
}

const classStyles: Record<TransactionClass, string> = {
  adjustment:
    "border-[var(--border-ink)] bg-[var(--color-class-adjustment-bright)] text-foreground",
  currency_exchange:
    "border-[var(--border-ink)] bg-[var(--color-class-currency_exchange-bright)] text-foreground",
  fx_gain_loss: "border-muted-foreground bg-card text-muted-foreground",
  income:
    "border-[var(--border-ink)] bg-[var(--color-class-income-bright)] text-foreground",
  mixed: "border-[var(--border-ink)] bg-transparent text-foreground",
  refund:
    "border-[var(--border-ink)] bg-[var(--color-class-refund-bright)] text-foreground",
  spend: "border-[var(--border-ink)] bg-muted text-foreground",
  transfer:
    "border-[var(--border-ink)] bg-[var(--color-class-transfer-bright)] text-foreground",
};

export const ClassBadge = ({
  className,
  transactionClass,
}: ClassBadgeProps) => (
  <span
    className={cn(
      "font-heading inline-flex h-5 items-center border px-1.5 text-[11px] leading-none font-semibold whitespace-nowrap uppercase shadow-[var(--shadow-chip)]",
      classStyles[transactionClass],
      className,
    )}
  >
    {transactionClassLabel(transactionClass)}
  </span>
);
