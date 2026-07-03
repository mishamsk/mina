import {
  ArrowDownBox,
  Cancel,
  Chart,
  Clock,
  PlusBox,
  Receipt,
  Repeat,
  Shuffle,
  Switch,
  Wallet,
} from "pixelarticons/react";
import type { ComponentType, SVGProps } from "react";

import type { PostingStatus, TransactionClass } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

import { transactionClassLabel } from "./format";

type PixelIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface ClassIconProps {
  readonly className?: string;
  readonly transactionClass: TransactionClass;
}

const classIcons: Record<TransactionClass, PixelIcon> = {
  adjustment: PlusBox,
  currency_exchange: Shuffle,
  fx_gain_loss: Chart,
  income: ArrowDownBox,
  mixed: Switch,
  refund: Repeat,
  spend: Receipt,
  transfer: Wallet,
};

const classTone: Record<TransactionClass, string> = {
  adjustment: "text-[var(--color-class-adjustment-ink)]",
  currency_exchange: "text-[var(--color-class-currency_exchange-ink)]",
  fx_gain_loss: "text-muted-foreground",
  income: "text-[var(--color-class-income-ink)]",
  mixed: "text-[var(--color-class-mixed-ink)]",
  refund: "text-[var(--color-class-refund-ink)]",
  spend: "text-foreground",
  transfer: "text-[var(--color-class-transfer-ink)]",
};

export const ClassIcon = ({ className, transactionClass }: ClassIconProps) => {
  const Icon = classIcons[transactionClass];
  const label = transactionClassLabel(transactionClass);
  return (
    <Tooltip
      label={label}
      className={cn("inline-grid size-6 place-items-center", className)}
    >
      <span aria-label={label} role="img" title={label}>
        <Icon
          aria-hidden="true"
          className={cn("size-5", classTone[transactionClass])}
        />
      </span>
    </Tooltip>
  );
};

interface StatusIconProps {
  readonly className?: string;
  readonly status: PostingStatus;
}

export const StatusIcon = ({ className, status }: StatusIconProps) => {
  if (status === "posted") {
    return null;
  }

  const Icon = status === "pending" ? Clock : Cancel;
  const label = `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;

  return (
    <Tooltip
      label={label}
      className={cn("inline-grid size-6 place-items-center", className)}
    >
      <span aria-label={label} role="img" title={label}>
        <Icon
          aria-hidden="true"
          className={cn(
            "size-5",
            status === "pending" && "text-[var(--color-status-pending-ink)]",
            status === "cancelled" && "text-muted-foreground",
          )}
        />
      </span>
    </Tooltip>
  );
};
