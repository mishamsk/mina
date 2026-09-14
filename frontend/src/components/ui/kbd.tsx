import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const Kbd = ({
  className,
  children,
  ...props
}: ComponentProps<"kbd">) => (
  <kbd
    className={cn(
      "bg-muted border-2 border-[var(--border-ink)] px-1.5 py-0.5 font-mono text-xs shadow-[var(--shadow-chip)]",
      className,
    )}
    {...props}
  >
    {children === "Mod" ? "Cmd/Ctrl" : children}
  </kbd>
);
