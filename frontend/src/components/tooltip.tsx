import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface TooltipProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly label: string;
}

export const Tooltip = ({ children, className, label }: TooltipProps) => (
  <span
    className={cn("group/tooltip relative inline-flex max-w-full", className)}
    title={label}
  >
    {children}
    <span
      aria-hidden="true"
      className="bg-card text-foreground pointer-events-none absolute bottom-full left-0 z-50 mb-1 hidden max-w-72 border-2 border-[var(--border-ink)] px-2 py-1 font-mono text-xs whitespace-normal shadow-[var(--shadow-pixel)] group-focus-within/tooltip:block group-hover/tooltip:block"
    >
      {label}
    </span>
  </span>
);
