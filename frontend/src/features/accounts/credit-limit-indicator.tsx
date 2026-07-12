import { CreditCard } from "pixelarticons/react";

import { Tooltip } from "@/components/tooltip";

export const CreditLimitIndicator = () => (
  <Tooltip focusable={false} label="Has credit limit">
    <span
      aria-label="Has credit limit"
      className="text-muted-foreground inline-flex shrink-0"
      data-testid="credit-limit-indicator"
    >
      <CreditCard aria-hidden="true" className="size-4" />
    </span>
  </Tooltip>
);
