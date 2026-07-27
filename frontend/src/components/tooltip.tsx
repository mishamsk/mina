import {
  type FocusEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Tooltip as TooltipRoot,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TooltipProps {
  readonly asChild?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly focusable?: boolean;
  readonly label: string;
}

const suppressFocusTooltipAttribute = "data-mina-suppress-focus-tooltip";

export const focusWithoutTooltip = (
  element: HTMLElement | null | undefined,
  options?: FocusOptions,
) => {
  if (!element) {
    return;
  }

  element.setAttribute(suppressFocusTooltipAttribute, "true");
  element.focus(options);
  window.requestAnimationFrame(() => {
    element.removeAttribute(suppressFocusTooltipAttribute);
  });
};

export const AppTooltipProvider = ({
  children,
}: {
  readonly children: ReactNode;
}) => (
  <TooltipProvider delayDuration={150} disableHoverableContent>
    {children}
  </TooltipProvider>
);

export const Tooltip = ({
  asChild = false,
  children,
  className,
  disabled = false,
  focusable = true,
  label,
}: TooltipProps) => {
  const [open, setOpen] = useState(false);
  const forwardEscapeTargetRef = useRef<EventTarget | null>(null);
  const suppressNextOpenRef = useRef(false);

  useEffect(() => {
    if (open || !forwardEscapeTargetRef.current) {
      return;
    }

    const target = forwardEscapeTargetRef.current;
    forwardEscapeTargetRef.current = null;
    const timeout = window.setTimeout(() => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: "Escape",
          composed: true,
          key: "Escape",
        }),
      );
    });

    return () => {
      window.clearTimeout(timeout);
    };
  }, [open]);

  const handleFocusCapture = (event: FocusEvent<HTMLElement>) => {
    if (
      event.currentTarget.hasAttribute(suppressFocusTooltipAttribute) ||
      (event.target instanceof HTMLElement &&
        event.target.closest(`[${suppressFocusTooltipAttribute}]`))
    ) {
      suppressNextOpenRef.current = true;
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled) {
      setOpen(false);
      return;
    }

    if (nextOpen && suppressNextOpenRef.current) {
      suppressNextOpenRef.current = false;
      setOpen(false);
      return;
    }

    if (!nextOpen) {
      suppressNextOpenRef.current = false;
    }
    setOpen(nextOpen);
  };

  const handleEscapeKeyDown = (event: KeyboardEvent) => {
    // Radix prevents the native event while dismissing its layer. Stop that
    // delivery and forward the Escape from its original target after the
    // tooltip unmounts so exactly one interactive ladder level handles it.
    event.stopPropagation();
    forwardEscapeTargetRef.current = event.target;
  };

  return (
    <TooltipRoot open={disabled ? false : open} onOpenChange={handleOpenChange}>
      {asChild ? (
        <TooltipTrigger
          asChild
          className={className}
          onFocusCapture={handleFocusCapture}
        >
          {children}
        </TooltipTrigger>
      ) : (
        <TooltipTrigger asChild onFocusCapture={handleFocusCapture}>
          <span
            className={cn("inline-flex max-w-full min-w-0", className)}
            tabIndex={focusable ? 0 : undefined}
          >
            {children}
          </span>
        </TooltipTrigger>
      )}
      <TooltipContent onEscapeKeyDown={handleEscapeKeyDown}>
        {label}
      </TooltipContent>
    </TooltipRoot>
  );
};
