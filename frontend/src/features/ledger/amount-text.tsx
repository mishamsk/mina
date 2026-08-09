import { Fragment } from "react";

import type { DisplayAmount, TransactionClass } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";
import { currencyDisplayMarker } from "@/utils/currency";

import { formatDecimalAmount } from "./format";

interface AmountTextProps {
  readonly amount: Pick<DisplayAmount, "amount" | "currency">;
  readonly className?: string;
  readonly chip?: boolean;
  readonly positiveSign?: boolean;
  readonly tone?: "class-aware" | "neutral";
  readonly transactionClass?: TransactionClass;
  readonly truncate?: boolean;
  readonly overflowTooltip?: boolean;
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
  overflowTooltip = false,
  positiveSign = true,
  tone = "class-aware",
  transactionClass,
  truncate = false,
}: AmountTextProps) => {
  const formattedAmount = formatDecimalAmount(amount.amount, amount.currency, {
    positiveSign,
  });
  const marker = currencyDisplayMarker(amount.currency);
  const label = `${formattedAmount} ${marker}`;
  const amountContent = (
    <>
      <span className={cn(truncate && "min-w-0 truncate")}>
        {formattedAmount}
      </span>
      <span className="text-muted-foreground shrink-0 whitespace-pre">
        {` ${marker}`}
      </span>
    </>
  );

  const content = (
    <span
      data-testid={chip ? "amount-chip" : "amount-text"}
      className={cn(
        "font-mono tabular-nums",
        chip
          ? "bg-card inline-flex h-7 max-w-full items-center justify-end overflow-visible border border-[var(--border-ink)] px-2 text-right font-medium whitespace-nowrap shadow-[var(--shadow-chip)]"
          : "inline-flex max-w-full text-right whitespace-nowrap",
        chip && truncate && "min-w-0 overflow-hidden",
        tone === "neutral"
          ? "text-foreground"
          : amountClassName(transactionClass),
        className,
      )}
    >
      {amountContent}
    </span>
  );

  return overflowTooltip ? (
    <Tooltip label={label} className="justify-end">
      {content}
    </Tooltip>
  ) : (
    content
  );
};

export const UnavailableUsdAmountChip = () => (
  <span
    className="bg-card text-muted-foreground inline-flex h-7 max-w-full items-center justify-end overflow-visible border border-[var(--border-ink)] px-2 font-mono font-medium whitespace-nowrap tabular-nums shadow-[var(--shadow-chip)]"
    data-testid="usd-amount-unavailable-chip"
  >
    <span aria-hidden="true">N/A</span>
    <span className="sr-only">USD amount unavailable</span>
  </span>
);

const AmountSeparator = () => <span className="whitespace-pre">{" / "}</span>;

const countedDisplayAmounts = (amounts: readonly DisplayAmount[]) => {
  const counted = new Map<
    string,
    { readonly amount: DisplayAmount; count: number }
  >();
  for (const amount of amounts) {
    const key = `${amount.currency}:${amount.amount}`;
    const existing = counted.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counted.set(key, { amount, count: 1 });
    }
  }
  return [...counted.values()];
};

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
  const countedAmounts = countedDisplayAmounts(amounts);
  if (oneCurrency) {
    return (
      <>
        {countedAmounts.map(({ amount, count }, index) => (
          <Fragment key={`${amount.currency}:${amount.amount}`}>
            {index > 0 ? <AmountSeparator /> : null}
            <span>{formatDecimalAmount(amount.amount, amount.currency)}</span>
            {count > 1 ? <span>{`×${count}`}</span> : null}
          </Fragment>
        ))}
        <span className="text-muted-foreground whitespace-pre">
          {` ${currencyDisplayMarker(first.currency)}`}
        </span>
      </>
    );
  }

  return countedAmounts.map(({ amount, count }, index) => (
    <Fragment key={`${amount.currency}:${amount.amount}`}>
      {index > 0 ? <AmountSeparator /> : null}
      <span>{formatDecimalAmount(amount.amount, amount.currency)}</span>
      {count > 1 ? <span>{`×${count}`}</span> : null}
      <span className="text-muted-foreground whitespace-pre">
        {` ${currencyDisplayMarker(amount.currency)}`}
      </span>
    </Fragment>
  ));
};

const compactAmountsLabel = (amounts: readonly DisplayAmount[]): string => {
  const [first] = amounts;
  if (!first) {
    return "";
  }
  const oneCurrency = amounts.every(
    (amount) => amount.currency === first.currency,
  );
  const countedAmounts = countedDisplayAmounts(amounts);
  if (oneCurrency) {
    return `${countedAmounts
      .map(
        ({ amount, count }) =>
          `${formatDecimalAmount(amount.amount, amount.currency)}${
            count > 1 ? `×${count}` : ""
          }`,
      )
      .join(" / ")} ${currencyDisplayMarker(first.currency)}`;
  }
  return countedAmounts
    .map(
      ({ amount, count }) =>
        `${formatDecimalAmount(amount.amount, amount.currency)}${
          count > 1 ? `×${count}` : ""
        } ${currencyDisplayMarker(amount.currency)}`,
    )
    .join(" / ");
};

export const MixedAmounts = ({
  amounts,
  className,
  overflowTooltip = false,
}: {
  readonly amounts: readonly DisplayAmount[];
  readonly className?: string;
  readonly overflowTooltip?: boolean;
}) => {
  if (amounts.length === 0) {
    return null;
  }

  const content = (
    <span
      className={cn(
        "bg-card inline-flex h-7 max-w-full items-center justify-end overflow-visible border border-[var(--border-ink)] px-2 text-right font-mono font-medium whitespace-nowrap tabular-nums shadow-[var(--shadow-chip)]",
        className,
      )}
      data-testid="amount-chip"
    >
      <CompactAmounts amounts={amounts} />
    </span>
  );

  return overflowTooltip ? (
    <Tooltip label={compactAmountsLabel(amounts)} className="justify-end">
      {content}
    </Tooltip>
  ) : (
    content
  );
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
