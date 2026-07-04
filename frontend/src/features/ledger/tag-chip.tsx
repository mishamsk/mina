import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

interface TagChipProps {
  readonly className?: string;
  readonly label: string;
  readonly micro?: boolean;
  readonly tooltip?: string;
}

export const TagChip = ({
  className,
  label,
  micro = false,
  tooltip,
}: TagChipProps) => (
  <Tooltip
    label={tooltip ?? label}
    className={cn(
      "bg-muted text-foreground inline-flex min-w-0 shrink-0 items-center border border-[var(--border-ink)] font-mono shadow-[var(--shadow-chip)]",
      micro
        ? "h-4 max-w-20 px-1 text-[11px] leading-none"
        : "h-5 max-w-36 px-1.5 text-xs",
      className,
    )}
  >
    <span className="truncate">{label}</span>
  </Tooltip>
);
