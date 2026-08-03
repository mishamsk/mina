import { Link } from "react-router";

import type { Account } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

interface AccountDisplayLabelProps {
  readonly account: Pick<Account, "display_label" | "fqn">;
  readonly className?: string;
  readonly focusable?: boolean;
  readonly onTooltipEscape?: () => void;
  readonly testId?: string;
  readonly to?: string;
  readonly tooltipOpen?: boolean;
}

export const AccountDisplayLabel = ({
  account,
  className,
  focusable = true,
  onTooltipEscape,
  testId,
  to,
  tooltipOpen = false,
}: AccountDisplayLabelProps) => {
  const tooltipLabel =
    account.display_label === account.fqn
      ? account.fqn
      : `${account.display_label} · ${account.fqn}`;
  const labelClassName = cn(
    "text-foreground inline-block max-w-full min-w-0 truncate font-mono text-sm font-medium",
    className,
  );

  if (to) {
    return (
      <Tooltip
        label={tooltipLabel}
        asChild
        forceOpen={tooltipOpen}
        onEscape={onTooltipEscape}
      >
        <Link
          data-testid={testId}
          className={cn(
            labelClassName,
            "focus-visible:outline-ring cursor-pointer hover:underline focus-visible:outline-2 focus-visible:outline-offset-2",
          )}
          onClick={(event) => {
            event.stopPropagation();
          }}
          to={to}
        >
          {account.display_label}
        </Link>
      </Tooltip>
    );
  }

  return (
    <Tooltip
      focusable={focusable}
      forceOpen={tooltipOpen}
      label={tooltipLabel}
      onEscape={onTooltipEscape}
      className={labelClassName}
    >
      {account.display_label}
    </Tooltip>
  );
};
