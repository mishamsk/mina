import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

interface MemberChipProps {
  readonly name: string;
  readonly onActivate?: () => void;
}

export const MemberChip = ({ name, onActivate }: MemberChipProps) => {
  const className =
    "font-heading text-foreground inline-grid size-6 place-items-center border border-[var(--border-ink)] bg-[var(--color-class-adjustment-bright)] text-[11px] font-semibold shadow-[var(--shadow-chip)]";
  const content = <span>{name.slice(0, 2)}</span>;

  if (onActivate) {
    return (
      <Tooltip label={name} asChild>
        <button
          type="button"
          className={cn(
            className,
            "hover:bg-[color-mix(in_srgb,var(--color-class-adjustment-bright),var(--table-header)_35%)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
          )}
          aria-label={`Filter by ${name}`}
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
    <Tooltip label={name} className={className}>
      {content}
    </Tooltip>
  );
};
