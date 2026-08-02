import {
  ArrowDownBox,
  ArrowUpBox,
  Calendar,
  Cancel,
  Clock,
  PlusBox,
  Receipt,
  Repeat,
  Shuffle,
  Switch,
  Wallet,
} from "pixelarticons/react";
import type { ComponentType, SVGProps } from "react";

import type { RecordRole, TransactionClass } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

import {
  displayStatusLabel,
  recordRoleLabel,
  transactionClassLabel,
  type TransactionDisplayStatus,
} from "./format";

type PixelIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface ClassIconProps {
  readonly className?: string;
  readonly focusable?: boolean;
  readonly transactionClass: TransactionClass;
}

interface ClassGlyphProps {
  readonly className?: string;
  readonly transactionClass: TransactionClass;
}

const classIcons: Record<TransactionClass, PixelIcon> = {
  adjustment: PlusBox,
  clawback: ArrowUpBox,
  currency_exchange: Shuffle,
  income: ArrowDownBox,
  mixed: Switch,
  refund: Repeat,
  spend: Receipt,
  transfer: Wallet,
};

const classTone: Record<TransactionClass, string> = {
  adjustment: "text-[var(--color-class-adjustment-ink)]",
  clawback: "text-[var(--color-class-clawback-ink)]",
  currency_exchange: "text-[var(--color-class-currency_exchange-ink)]",
  income: "text-[var(--color-class-income-ink)]",
  mixed: "text-[var(--color-class-mixed-ink)]",
  refund: "text-[var(--color-class-refund-ink)]",
  spend: "text-foreground",
  transfer: "text-[var(--color-class-transfer-ink)]",
};

export const ClassGlyph = ({
  className,
  transactionClass,
}: ClassGlyphProps) => {
  const Icon = classIcons[transactionClass];

  return (
    <Icon
      aria-hidden="true"
      className={cn("size-5", classTone[transactionClass], className)}
    />
  );
};

export const ClassIcon = ({
  className,
  focusable = true,
  transactionClass,
}: ClassIconProps) => {
  const label = transactionClassLabel(transactionClass);
  return (
    <Tooltip
      focusable={focusable}
      label={label}
      className={cn("inline-grid size-6 place-items-center", className)}
    >
      <span aria-label={label} role="img">
        <ClassGlyph transactionClass={transactionClass} />
      </span>
    </Tooltip>
  );
};

interface RecordRoleIconProps {
  readonly className?: string;
  readonly focusable?: boolean;
  readonly role: RecordRole;
}

const recordRoleIcons: Record<RecordRole, PixelIcon> = {
  adjustment: PlusBox,
  balance: Wallet,
  clawback: ArrowUpBox,
  exchange: Shuffle,
  expense: Receipt,
  income: ArrowDownBox,
  refund: Repeat,
};

export const RecordRoleIcon = ({
  className,
  focusable = true,
  role,
}: RecordRoleIconProps) => {
  const Icon = recordRoleIcons[role];
  const label = `${recordRoleLabel(role)} role`;

  return (
    <Tooltip
      focusable={focusable}
      label={label}
      className={cn("inline-grid size-5 min-w-5 place-items-center", className)}
    >
      <span aria-label={label} role="img">
        <Icon aria-hidden="true" className="text-muted-foreground size-4" />
      </span>
    </Tooltip>
  );
};

interface StatusIconProps {
  readonly className?: string;
  readonly focusable?: boolean;
  readonly status: TransactionDisplayStatus;
}

export const StatusIcon = ({
  className,
  focusable = true,
  status,
}: StatusIconProps) => {
  const Icon =
    status === "expected"
      ? Calendar
      : status === "pending"
        ? Clock
        : status === "mixed"
          ? Switch
          : Cancel;
  const label = displayStatusLabel(status);

  return (
    <Tooltip
      focusable={focusable}
      label={label}
      className={cn("inline-grid size-6 place-items-center", className)}
    >
      <span aria-label={label} role="img">
        <Icon
          aria-hidden="true"
          className={cn(
            "size-5",
            (status === "expected" ||
              status === "pending" ||
              status === "mixed") &&
              "text-[var(--color-status-pending-ink)]",
            status === "cancelled" && "text-muted-foreground",
          )}
        />
      </span>
    </Tooltip>
  );
};
