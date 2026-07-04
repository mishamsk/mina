import type { DisplayAmount, TransactionClass } from "@/api";
import { cn } from "@/lib/utils";
import { currencyDisplayMarker } from "@/utils/currency";

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
}: AmountTextProps) => {
  const formattedAmount = formatDecimalAmount(amount.amount, amount.currency, {
    positiveSign,
  });
  const marker = currencyDisplayMarker(amount.currency);

  return (
    <span
      data-testid={chip ? "amount-chip" : "amount-text"}
      className={cn(
        "font-mono [overflow-wrap:anywhere] tabular-nums",
        chip
          ? "bg-card inline-flex min-h-7 max-w-full flex-wrap items-center justify-end border border-[var(--border-ink)] px-2 text-right font-medium shadow-[var(--shadow-chip)]"
          : "inline max-w-full text-right whitespace-normal",
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
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {formattedAmount}
      </span>
      <span className="text-muted-foreground whitespace-pre">
        {` ${marker}`}
      </span>
    </span>
  );
};
