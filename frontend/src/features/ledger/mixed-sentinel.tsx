export const MixedSentinel = ({
  label = "Mixed",
}: {
  readonly label?: string;
}) => (
  <span className="font-heading text-foreground bg-card inline-flex h-5 items-center border border-[var(--border-ink)] px-1.5 text-[11px] font-semibold uppercase shadow-[var(--shadow-chip)]">
    {label}
  </span>
);
