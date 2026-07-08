import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

interface TagChipProps {
  readonly className?: string;
  readonly label: string;
  readonly micro?: boolean;
  readonly onActivate?: () => void;
  readonly tooltip?: string;
}

export const tagChipMicroHeightClass = "[--tag-chip-micro-height:1rem]";

export const TagChip = ({
  className,
  label,
  micro = false,
  onActivate,
  tooltip,
}: TagChipProps) => {
  const chipClassName = cn(
    "bg-muted text-foreground inline-flex min-w-0 shrink-0 items-center border border-[var(--border-ink)] font-mono shadow-[var(--shadow-chip)]",
    micro
      ? cn(
          tagChipMicroHeightClass,
          "h-[var(--tag-chip-micro-height)] max-w-20 px-1 text-[11px] leading-none",
        )
      : "h-5 max-w-36 px-1.5 text-xs",
    onActivate &&
      "hover:bg-[color-mix(in_srgb,var(--muted),var(--table-header)_35%)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
    className,
  );
  const content = <span className="truncate">{label}</span>;

  if (onActivate) {
    return (
      <Tooltip label={tooltip ?? label} asChild>
        <button
          type="button"
          className={chipClassName}
          aria-label={`Filter by ${label}`}
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
    <Tooltip label={tooltip ?? label} className={chipClassName}>
      {content}
    </Tooltip>
  );
};
