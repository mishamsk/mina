import type { TransactionClass } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

import { compactTransactionClassLabel, transactionClassLabel } from "./format";
import { ClassGlyph } from "./line-icons";

interface ClassBadgeProps {
  readonly className?: string;
  readonly transactionClass: TransactionClass;
}

const classStyles: Record<TransactionClass, string> = {
  adjustment:
    "border-[var(--border-ink)] bg-[var(--color-class-adjustment-bright)] text-foreground",
  currency_exchange:
    "border-[var(--border-ink)] bg-[var(--color-class-currency_exchange-bright)] text-foreground",
  clawback:
    "border-[var(--border-ink)] bg-[var(--color-class-clawback-bright)] text-foreground",
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
}: ClassBadgeProps) => {
  const label = transactionClassLabel(transactionClass);

  return (
    <Tooltip label={label}>
      <span
        aria-label={label}
        className={cn(
          "font-heading inline-flex h-5 items-center gap-1 border px-1.5 text-[11px] leading-none font-semibold whitespace-nowrap uppercase shadow-[var(--shadow-chip)]",
          classStyles[transactionClass],
          className,
        )}
        data-testid="class-badge"
        role="img"
      >
        <ClassGlyph
          className="size-4 shrink-0"
          transactionClass={transactionClass}
        />
        <span aria-hidden="true">
          {compactTransactionClassLabel(transactionClass)}
        </span>
      </span>
    </Tooltip>
  );
};
