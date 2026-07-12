import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

interface FqnPathProps {
  readonly ancestorClassName?: string;
  readonly className?: string;
  readonly collapseAncestors?: boolean;
  readonly focusable?: boolean;
  readonly leafClassName?: string;
  readonly onActivate?: () => void;
  readonly variant?: "full" | "full-chip" | "leaf-chip";
  readonly value: string;
}

export const FqnPath = ({
  ancestorClassName,
  className,
  collapseAncestors = true,
  focusable = true,
  leafClassName,
  onActivate,
  value,
  variant = "full",
}: FqnPathProps) => {
  const segments = value.split(":");
  const leaf = segments.at(-1) ?? value;
  const ancestors =
    segments.length > 2
      ? collapseAncestors
        ? `${segments[0]}:…:`
        : `${segments.slice(0, -1).join(":")}:`
      : segments.length > 1
        ? `${segments[0]}:`
        : "";
  const hasCollapsedAncestors = collapseAncestors && segments.length > 2;
  const pathContent = (
    <>
      {hasCollapsedAncestors ? <span className="sr-only">{value}</span> : null}
      {ancestors ? (
        <span
          aria-hidden={hasCollapsedAncestors || undefined}
          className={cn(
            "text-muted-foreground max-w-full min-w-0 truncate",
            ancestorClassName,
          )}
        >
          {ancestors}
        </span>
      ) : null}
      <span
        aria-hidden={hasCollapsedAncestors || undefined}
        className={cn(
          "text-foreground max-w-full min-w-0 truncate font-medium",
          leafClassName,
        )}
      >
        {leaf}
      </span>
    </>
  );

  if (variant === "leaf-chip") {
    const chipClassName = cn(
      "bg-muted text-foreground inline-flex h-6 max-w-full items-center border border-[var(--border-ink)] px-1.5 font-mono text-xs font-medium shadow-[var(--shadow-chip)]",
      onActivate &&
        "hover:bg-[color-mix(in_srgb,var(--muted),var(--table-header)_35%)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
      className,
    );
    const content = <span className="truncate">{leaf}</span>;

    if (onActivate) {
      return (
        <Tooltip label={value} asChild>
          <button
            type="button"
            className={chipClassName}
            aria-label={`Filter by ${leaf}`}
            onClick={(event) => {
              event.stopPropagation();
              onActivate();
            }}
          >
            {content}
          </button>
        </Tooltip>
      );
    }

    return (
      <Tooltip focusable={focusable} label={value} className={chipClassName}>
        {content}
      </Tooltip>
    );
  }

  if (variant === "full-chip") {
    const chipClassName = cn(
      "bg-muted text-foreground inline-flex min-h-6 max-w-full items-center overflow-hidden border border-[var(--border-ink)] px-1.5 font-mono text-xs font-medium shadow-[var(--shadow-chip)]",
      onActivate &&
        "hover:bg-[color-mix(in_srgb,var(--muted),var(--table-header)_35%)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
      className,
    );
    const content = (
      <span className="inline-flex max-w-full min-w-0 overflow-hidden">
        {pathContent}
      </span>
    );

    if (onActivate) {
      return (
        <Tooltip label={value} asChild>
          <button
            type="button"
            className={chipClassName}
            aria-label={`Filter by ${value}`}
            onClick={(event) => {
              event.stopPropagation();
              onActivate();
            }}
          >
            {content}
          </button>
        </Tooltip>
      );
    }

    return (
      <Tooltip focusable={focusable} label={value} className={chipClassName}>
        {content}
      </Tooltip>
    );
  }

  const pathClassName = cn(
    "inline-flex max-w-full min-w-0 overflow-hidden font-mono text-sm",
    onActivate &&
      "focus-visible:outline-ring hover:bg-muted active:bg-muted cursor-pointer border-0 bg-transparent p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2",
    className,
  );

  if (onActivate) {
    return (
      <Tooltip label={value} asChild>
        <button
          type="button"
          className={pathClassName}
          aria-label={`Filter by ${value}`}
          onClick={(event) => {
            event.stopPropagation();
            onActivate();
          }}
        >
          {pathContent}
        </button>
      </Tooltip>
    );
  }

  return (
    <Tooltip focusable={focusable} label={value} className={pathClassName}>
      {pathContent}
    </Tooltip>
  );
};
