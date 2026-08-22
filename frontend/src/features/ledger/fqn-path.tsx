import { Link } from "react-router";

import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

interface FqnPathBaseProps {
  readonly ancestorClassName?: string;
  readonly className?: string;
  readonly collapseAncestors?: boolean;
  readonly focusable?: boolean;
  readonly leafClassName?: string;
  readonly truncate?: boolean;
  readonly variant?: "full" | "full-chip" | "leaf-chip";
  readonly value: string;
}

type FqnPathProps = FqnPathBaseProps &
  (
    | {
        readonly onActivate?: undefined;
        readonly to?: undefined;
      }
    | {
        readonly onActivate: () => void;
        readonly to?: never;
      }
    | {
        readonly onActivate?: never;
        readonly to: string;
        readonly variant?: "full";
      }
  );

export const FqnPath = ({
  ancestorClassName,
  className,
  collapseAncestors = true,
  focusable = true,
  leafClassName,
  onActivate,
  to,
  truncate = true,
  value,
  variant = "full",
}: FqnPathProps) => {
  const segments = value.split(":");
  const leaf = segments.at(-1) ?? value;
  const fullAncestors =
    segments.length > 1 ? `${segments.slice(0, -1).join(":")}:` : "";
  const ancestors =
    segments.length > 2
      ? collapseAncestors
        ? `${segments[0]}:…:`
        : fullAncestors
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
            "text-muted-foreground max-w-full min-w-0",
            truncate ? "truncate" : "break-all whitespace-normal",
            to && "decoration-1 underline-offset-2 group-hover:underline",
            hasCollapsedAncestors && to && "group-focus-visible:hidden",
            ancestorClassName,
          )}
        >
          {ancestors}
        </span>
      ) : null}
      {hasCollapsedAncestors && to ? (
        <span
          aria-hidden="true"
          className={cn(
            "text-muted-foreground hidden max-w-full min-w-0 truncate decoration-1 underline-offset-2 group-hover:underline group-focus-visible:inline",
            ancestorClassName,
          )}
        >
          {fullAncestors}
        </span>
      ) : null}
      <span
        aria-hidden={hasCollapsedAncestors || undefined}
        className={cn(
          "text-foreground max-w-full min-w-0 font-medium",
          truncate ? "truncate" : "break-all whitespace-normal",
          to && "decoration-1 underline-offset-2 group-hover:underline",
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
    "inline-flex max-w-full min-w-0 font-mono text-sm",
    truncate ? "overflow-hidden" : "flex-wrap whitespace-normal",
    onActivate &&
      "focus-visible:outline-ring hover:bg-muted active:bg-muted cursor-pointer border-0 bg-transparent p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2",
    className,
  );

  if (to) {
    return (
      <Tooltip label={value} asChild>
        <Link
          aria-label={value}
          className={cn(
            pathClassName,
            "focus-visible:outline-ring group cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2",
          )}
          onClick={(event) => {
            event.stopPropagation();
          }}
          to={to}
        >
          {pathContent}
        </Link>
      </Tooltip>
    );
  }

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
