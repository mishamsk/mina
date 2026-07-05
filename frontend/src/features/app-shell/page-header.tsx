import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  readonly actions?: ReactNode;
  readonly eyebrow?: string;
  readonly help?: ReactNode;
  readonly title: ReactNode;
  readonly titleClassName?: string;
  readonly titleId?: string;
  readonly toolbar?: ReactNode;
}

export const PageHeader = ({
  actions,
  eyebrow,
  help,
  title,
  titleClassName,
  titleId,
  toolbar,
}: PageHeaderProps) => (
  <header className="flex flex-col gap-4 border-b-2 border-[var(--border-ink)] pb-5 text-[var(--frame-foreground)]">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="font-heading text-sm font-semibold text-[var(--frame-muted)] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <div className="mt-1 flex items-center gap-2">
          <h1
            id={titleId}
            className={cn("text-pixel min-w-0 text-2xl", titleClassName)}
          >
            {title}
          </h1>
          {help}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-3">{actions}</div>
      ) : null}
    </div>
    <div
      className={cn(
        "min-h-0",
        toolbar ? "border-t-2 border-[var(--border-ink)] pt-4" : "",
      )}
    >
      {toolbar}
    </div>
  </header>
);
