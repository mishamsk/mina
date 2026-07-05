import { InfoBox } from "pixelarticons/react";
import { useEffect, useId, useRef, useState } from "react";

import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";

interface PageHelpProps {
  readonly children: string;
  readonly label: string;
}

export const PageHelp = ({ children, label }: PageHelpProps) => {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <Tooltip label={label} asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-controls={contentId}
          aria-expanded={open}
          aria-label={label}
          onClick={() => {
            setOpen((current) => !current);
          }}
        >
          <InfoBox aria-hidden="true" />
        </Button>
      </Tooltip>
      {open ? (
        <p
          id={contentId}
          role="note"
          data-page-help-content
          className="bg-card font-body text-foreground absolute top-full left-0 z-30 mt-2 w-72 border-2 border-[var(--border-ink)] p-3 text-sm shadow-[var(--shadow-pixel)]"
        >
          {children}
        </p>
      ) : null}
    </div>
  );
};
