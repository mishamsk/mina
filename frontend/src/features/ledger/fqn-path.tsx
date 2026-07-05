import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

interface FqnPathProps {
  readonly ancestorClassName?: string;
  readonly className?: string;
  readonly focusable?: boolean;
  readonly leafClassName?: string;
  readonly variant?: "full" | "leaf-chip";
  readonly value: string;
}

export const FqnPath = ({
  ancestorClassName,
  className,
  focusable = true,
  leafClassName,
  value,
  variant = "full",
}: FqnPathProps) => {
  const segments = value.split(":");
  const leaf = segments.at(-1) ?? value;
  const ancestors =
    segments.length > 2
      ? `${segments[0]}:…:`
      : segments.length > 1
        ? `${segments[0]}:`
        : "";

  if (variant === "leaf-chip") {
    return (
      <Tooltip
        focusable={focusable}
        label={value}
        className={cn(
          "bg-muted text-foreground inline-flex h-6 max-w-full items-center border border-[var(--border-ink)] px-1.5 font-mono text-xs font-medium shadow-[var(--shadow-chip)]",
          className,
        )}
      >
        <span className="truncate">{leaf}</span>
      </Tooltip>
    );
  }

  return (
    <Tooltip
      focusable={focusable}
      label={value}
      className={cn(
        "inline-flex max-w-full min-w-0 overflow-hidden font-mono text-sm",
        className,
      )}
    >
      {ancestors ? (
        <span
          className={cn(
            "text-muted-foreground max-w-full min-w-0 truncate",
            ancestorClassName,
          )}
        >
          {ancestors}
        </span>
      ) : null}
      <span
        className={cn(
          "text-foreground max-w-full min-w-0 truncate font-medium",
          leafClassName,
        )}
      >
        {leaf}
      </span>
    </Tooltip>
  );
};
