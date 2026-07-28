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

import type { PostingStatus, RecordRole, TransactionClass } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

import {
  postingStatusLabel,
  recordRoleLabel,
  transactionClassLabel,
} from "./format";

type PixelIcon = ComponentType<SVGProps<SVGSVGElement>>;

export const CalendarWeeksOff = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M7 4h12v2H7zm-2 16h14v2H5zM3 10h2v10H3zm0-4h2v2H3zm16 0h2v2h-2zm0 4h2v8h-2zM3 8h5v2H3zm7 0h11v2H10zm5-6h2v2h-2zM7 2h2v2H7zm0 10h5v2H7zm7 0h3v2h-3zm-7 4h9v2H7z" />
    <path d="M2 2h2v2H2zm2 2h2v2H4zm2 2h2v2H6zm2 2h2v2H8zm2 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2z" />
  </svg>
);

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
  readonly status: PostingStatus;
}

export const StatusIcon = ({
  className,
  focusable = true,
  status,
}: StatusIconProps) => {
  if (status === "posted") {
    return null;
  }

  const Icon =
    status === "expected" ? Calendar : status === "pending" ? Clock : Cancel;
  const label = postingStatusLabel(status);

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
            (status === "expected" || status === "pending") &&
              "text-[var(--color-status-pending-ink)]",
            status === "cancelled" && "text-muted-foreground",
          )}
        />
      </span>
    </Tooltip>
  );
};
