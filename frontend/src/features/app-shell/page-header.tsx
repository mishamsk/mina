import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  readonly actions?: ReactNode;
  readonly eyebrow?: string;
  readonly help?: ReactNode;
  readonly title: string;
  readonly titleId?: string;
  readonly toolbar?: ReactNode;
}

export const PageHeader = ({
  actions,
  eyebrow,
  help,
  title,
  titleId,
  toolbar,
}: PageHeaderProps) => (
  <header className="flex flex-col gap-4 border-b-2 border-[var(--border-ink)] pb-5 text-[var(--frame-foreground)]">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="font-heading text-sm font-semibold text-[var(--frame-muted)] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <div className="mt-1 flex items-center gap-2">
          <h1 id={titleId} className="text-pixel text-2xl">
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
