import type { DisplayAmount, TransactionClass } from "@/api";
import { cn } from "@/lib/utils";

import { formatDecimalAmount } from "./format";

interface AmountTextProps {
  readonly amount: DisplayAmount;
  readonly className?: string;
  readonly chip?: boolean;
  readonly positiveSign?: boolean;
  readonly tone?: "class-aware" | "neutral";
  readonly transactionClass?: TransactionClass;
}

const amountClassName = (
  transactionClass: TransactionClass | undefined,
): string => {
  if (transactionClass === "income") {
    return "text-[var(--color-class-income-ink)]";
  }
  if (transactionClass === "refund") {
    return "text-[var(--color-class-refund-ink)]";
  }
  return "text-foreground";
};

export const AmountText = ({
  amount,
  chip = false,
  className,
  positiveSign = true,
  tone = "class-aware",
  transactionClass,
}: AmountTextProps) => (
  <span
    className={cn(
      "font-mono whitespace-nowrap tabular-nums",
      chip &&
        "bg-card inline-flex h-7 items-center border border-[var(--border-ink)] px-2 font-medium shadow-[var(--shadow-chip)]",
      chip &&
        (transactionClass === "income"
          ? "text-foreground bg-[var(--color-class-income-bright)]"
          : transactionClass === "refund"
            ? "text-foreground bg-[var(--color-class-income-bright)]"
            : ""),
      tone === "neutral"
        ? "text-foreground"
        : amountClassName(transactionClass),
      className,
    )}
  >
    {formatDecimalAmount(amount.amount, amount.currency, { positiveSign })}
    <span className="text-muted-foreground whitespace-pre">
      {` ${amount.currency}`}
    </span>
  </span>
);
