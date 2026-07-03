import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

interface FqnPathProps {
  readonly className?: string;
  readonly variant?: "full" | "leaf-chip";
  readonly value: string;
}

export const FqnPath = ({
  className,
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
      label={value}
      className={cn("inline-flex max-w-full font-mono text-sm", className)}
    >
      {ancestors ? (
        <span className="text-muted-foreground truncate">{ancestors}</span>
      ) : null}
      <span className="text-foreground shrink-0 truncate font-medium">
        {leaf}
      </span>
    </Tooltip>
  );
};
