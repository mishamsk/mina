import { Fragment } from "react";

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

interface ApproximateUsdAmountProps {
  readonly amountUsd: string;
  readonly className?: string;
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

const AmountSeparator = () => <span className="whitespace-pre">{" / "}</span>;

const CompactAmounts = ({
  amounts,
}: {
  readonly amounts: readonly DisplayAmount[];
}) => {
  const [first] = amounts;
  if (!first) {
    return null;
  }
  const oneCurrency = amounts.every(
    (amount) => amount.currency === first.currency,
  );
  if (oneCurrency) {
    return (
      <>
        {amounts.map((amount, index) => (
          <Fragment key={`${amount.currency}:${amount.amount}:${index}`}>
            {index > 0 ? <AmountSeparator /> : null}
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {formatDecimalAmount(amount.amount, amount.currency)}
            </span>
          </Fragment>
        ))}
        <span className="text-muted-foreground whitespace-pre">
          {` ${currencyDisplayMarker(first.currency)}`}
        </span>
      </>
    );
  }

  return amounts.map((amount, index) => (
    <Fragment key={`${amount.currency}:${amount.amount}:${index}`}>
      {index > 0 ? <AmountSeparator /> : null}
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {formatDecimalAmount(amount.amount, amount.currency)}
      </span>
      <span className="text-muted-foreground whitespace-pre">
        {` ${currencyDisplayMarker(amount.currency)}`}
      </span>
    </Fragment>
  ));
};

const compactAmountsLength = (amounts: readonly DisplayAmount[]): number => {
  const [first] = amounts;
  if (!first) {
    return 0;
  }
  const oneCurrency = amounts.every(
    (amount) => amount.currency === first.currency,
  );
  if (oneCurrency) {
    return (
      amounts
        .map((amount) => formatDecimalAmount(amount.amount, amount.currency))
        .join(" / ").length +
      1 +
      currencyDisplayMarker(first.currency).length
    );
  }
  return amounts
    .map(
      (amount) =>
        `${formatDecimalAmount(amount.amount, amount.currency)} ${currencyDisplayMarker(amount.currency)}`,
    )
    .join(" / ").length;
};

export const MixedAmounts = ({
  amounts,
}: {
  readonly amounts: readonly DisplayAmount[];
}) => {
  const wraps = compactAmountsLength(amounts) > 24;

  return amounts.length > 0 ? (
    <span
      className={cn(
        "bg-card inline-flex max-w-full items-center justify-end border border-[var(--border-ink)] px-2 text-right font-mono font-medium tabular-nums shadow-[var(--shadow-chip)]",
        wraps
          ? "min-h-7 flex-wrap [overflow-wrap:anywhere]"
          : "h-7 whitespace-nowrap",
      )}
      data-testid="amount-chip"
    >
      <CompactAmounts amounts={amounts} />
    </span>
  ) : null;
};

export const ApproximateUsdAmount = ({
  amountUsd,
  className,
}: ApproximateUsdAmountProps) => {
  const formattedAmount = formatDecimalAmount(amountUsd, "USD", {
    positiveSign: false,
  });

  return (
    <span
      data-testid="approximate-usd-amount"
      className={cn(
        "inline-flex max-w-full items-baseline justify-end gap-1 font-mono tabular-nums",
        className,
      )}
    >
      <span>≈ </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {formattedAmount}
      </span>
      <span className="text-muted-foreground"> USD</span>
    </span>
  );
};
