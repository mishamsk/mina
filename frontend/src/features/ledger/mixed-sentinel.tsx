import type { Transaction } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { currencyDisplayMarker } from "@/utils/currency";

import { detailDisplayAmounts, formatDecimalAmount } from "./format";

export const MixedSentinel = ({
  label = "Mixed",
}: {
  readonly label?: string;
}) => (
  <span className="font-heading text-foreground bg-card inline-flex h-5 items-center border border-[var(--border-ink)] px-1.5 text-[11px] font-semibold uppercase shadow-[var(--shadow-chip)]">
    {label}
  </span>
);

export const transactionPartsLabel = (transaction: Transaction): string =>
  detailDisplayAmounts(transaction)
    .map(
      (amount) =>
        `${formatDecimalAmount(amount.amount, amount.currency)} ${currencyDisplayMarker(amount.currency)}`,
    )
    .join(", ");

export const moreTransactionPartsLabel = (transaction: Transaction): string =>
  `More transaction parts. All parts: ${transactionPartsLabel(transaction)}`;

export const MorePartsIndicator = ({
  transaction,
}: {
  readonly transaction: Transaction;
}) => (
  <Tooltip asChild label={`All parts: ${transactionPartsLabel(transaction)}`}>
    <span
      aria-label={moreTransactionPartsLabel(transaction)}
      className="font-heading text-foreground inline-grid h-4 w-3 shrink-0 place-items-center self-center text-sm leading-none font-semibold"
      data-testid="more-parts-indicator"
      role="img"
    >
      +
    </span>
  </Tooltip>
);
