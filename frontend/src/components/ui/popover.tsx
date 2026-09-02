import { ChevronLeft } from "pixelarticons/react";
import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";

import { markMobileControlsLayer } from "@/components/compact-overlay";
import { cn } from "@/lib/utils";

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverContent({
  align = "start",
  children,
  className,
  compactBack = false,
  onCompactBack,
  ref,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  readonly compactBack?: boolean;
  readonly "data-picker-mode"?: "level" | "search";
  readonly onCompactBack?: () => void;
}) {
  const contentRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      markMobileControlsLayer(node);
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  const compactListbox = compactBack && props.role === "listbox";
  const compactListboxId = compactListbox ? props.id : undefined;
  const compactListboxBusy = compactListbox ? props["aria-busy"] : undefined;
  const compactListboxMode = compactListbox
    ? props["data-picker-mode"]
    : undefined;
  const contentProps = compactListbox
    ? { ...props, "aria-busy": undefined, id: undefined, role: undefined }
    : props;

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={contentRef}
        data-slot="popover-content"
        data-compact-bottom-sheet
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-card text-card-foreground z-80 w-86 border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)] outline-none",
          className,
        )}
        {...contentProps}
      >
        {compactBack ? (
          <PopoverPrimitive.Close
            className="compact-shell:flex font-heading -mx-3 -mt-3 mb-3 hidden h-11 w-[calc(100%+1.5rem)] items-center gap-2 border-b-2 border-[var(--border-ink)] bg-[var(--band)] px-3 text-sm font-semibold uppercase"
            aria-label="Back"
            onClick={onCompactBack}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            Back
          </PopoverPrimitive.Close>
        ) : null}
        {compactListbox ? (
          <div
            id={compactListboxId}
            role="listbox"
            aria-busy={compactListboxBusy}
            data-picker-mode={compactListboxMode}
          >
            {children}
          </div>
        ) : (
          children
        )}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
