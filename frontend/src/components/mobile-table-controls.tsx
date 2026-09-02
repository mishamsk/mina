import { Close, SettingsCog2 } from "pixelarticons/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { preserveNestedControlLayer } from "@/components/compact-overlay";
import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface MobileTableControlsContextValue {
  readonly open: boolean;
  readonly register: (id: string) => () => void;
  readonly setTriggerElement: (node: HTMLButtonElement | null) => void;
  readonly sourceCount: number;
  readonly target: HTMLDivElement | null;
}

const MobileTableControlsContext =
  createContext<MobileTableControlsContextValue | null>(null);

const focusableControlSelector =
  "[data-mobile-table-controls-content] :is(button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1']))";
const outsideFocusTransferSelector =
  "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export const MobileTableControlsProvider = ({
  children,
}: {
  readonly children: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const [sourceIds, setSourceIds] = useState<ReadonlySet<string>>(new Set());
  const sourceIdsRef = useRef<ReadonlySet<string>>(new Set());
  const [triggerElement, setTriggerElement] =
    useState<HTMLButtonElement | null>(null);
  const lastFocusedSurfaceRef = useRef<"controls" | "trigger" | undefined>(
    undefined,
  );
  const lastFocusedControlRef = useRef<HTMLElement | null>(null);
  const outsideFocusTransferRef = useRef(false);
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const register = useCallback((id: string) => {
    const registered = new Set(sourceIdsRef.current).add(id);
    sourceIdsRef.current = registered;
    setSourceIds(registered);
    return () => {
      const remaining = new Set(sourceIdsRef.current);
      remaining.delete(id);
      sourceIdsRef.current = remaining;
      setSourceIds(remaining);
      if (remaining.size === 0) setOpen(false);
    };
  }, []);
  useEffect(() => {
    if (!triggerElement) return;
    let triggerWasVisible = triggerElement.getClientRects().length > 0;
    const trackControlsFocus = (event: FocusEvent) => {
      const target =
        event.target instanceof HTMLElement ? event.target : undefined;
      if (target === triggerElement) {
        lastFocusedSurfaceRef.current = "trigger";
        return;
      }
      if (
        target?.closest(
          "[data-mobile-table-controls-content], [aria-label='Table controls']",
        )
      ) {
        lastFocusedSurfaceRef.current = "controls";
        if (target.closest("[data-mobile-table-controls-content]")) {
          lastFocusedControlRef.current = target;
        }
        return;
      }
      if (target !== document.body) {
        lastFocusedSurfaceRef.current = undefined;
        lastFocusedControlRef.current = null;
      }
    };
    const handOffBreakpointFocus = () => {
      const triggerIsVisible = triggerElement.getClientRects().length > 0;
      if (triggerIsVisible === triggerWasVisible) return;
      triggerWasVisible = triggerIsVisible;
      if (!triggerIsVisible && open) setOpen(false);
      const previousSurface = lastFocusedSurfaceRef.current;
      const destinationSurface = triggerIsVisible ? "trigger" : "controls";
      if (!previousSurface || previousSurface === destinationSurface) return;
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const activeElementIsVisible = Boolean(
        activeElement &&
        activeElement !== document.body &&
        activeElement.getClientRects().length,
      );
      const activeElementWasOnPreviousSurface =
        previousSurface === "trigger"
          ? activeElement === triggerElement
          : Boolean(
              activeElement?.closest(
                "[data-mobile-table-controls-content], [aria-label='Table controls']",
              ),
            );
      if (activeElementIsVisible && !activeElementWasOnPreviousSurface) return;
      window.requestAnimationFrame(() => {
        const focusTarget = triggerIsVisible
          ? triggerElement
          : lastFocusedControlRef.current?.getClientRects().length
            ? lastFocusedControlRef.current
            : Array.from(
                document.querySelectorAll<HTMLElement>(
                  focusableControlSelector,
                ),
              ).find(
                (control) =>
                  control.closest("[data-mobile-table-controls-content]") &&
                  control.getClientRects().length > 0,
              );
        focusWithoutTooltip(focusTarget, { preventScroll: true });
        lastFocusedSurfaceRef.current = destinationSurface;
      });
    };
    document.addEventListener("focusin", trackControlsFocus, {
      capture: true,
    });
    window.addEventListener("resize", handOffBreakpointFocus);
    return () => {
      document.removeEventListener("focusin", trackControlsFocus, {
        capture: true,
      });
      window.removeEventListener("resize", handOffBreakpointFocus);
    };
  }, [open, triggerElement]);

  const value = useMemo(
    () => ({
      open,
      register,
      setTriggerElement,
      sourceCount: sourceIds.size,
      target,
    }),
    [open, register, sourceIds.size, target],
  );

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) outsideFocusTransferRef.current = false;
        setOpen(nextOpen);
      }}
    >
      <MobileTableControlsContext.Provider value={value}>
        {children}
        {sourceIds.size > 0 ? (
          <PopoverContent
            side="top"
            align="end"
            sideOffset={10}
            aria-label="Table controls"
            compactBack={false}
            data-mobile-parent-sheet
            data-mobile-table-controls-surface
            className="flex max-h-[var(--radix-popover-content-available-height)] w-[min(30rem,calc(100vw-2rem))] flex-col gap-3 overflow-hidden p-0 [--frame-foreground:var(--foreground)] [--frame-muted:var(--muted-foreground)]"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              setTarget(null);
              const preserveOutsideFocus = outsideFocusTransferRef.current;
              outsideFocusTransferRef.current = false;
              const trigger = triggerElement;
              if (
                !preserveOutsideFocus &&
                trigger &&
                trigger.getClientRects().length > 0
              ) {
                focusWithoutTooltip(trigger, { preventScroll: true });
                return;
              }
              window.requestAnimationFrame(() => {
                const activeElement =
                  document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
                if (
                  preserveOutsideFocus &&
                  activeElement &&
                  activeElement !== document.body &&
                  activeElement.getClientRects().length > 0
                ) {
                  return;
                }
                const focusTarget =
                  trigger && trigger.getClientRects().length > 0
                    ? trigger
                    : Array.from(
                        document.querySelectorAll<HTMLElement>(
                          focusableControlSelector,
                        ),
                      ).find((control) => control.getClientRects().length > 0);
                focusWithoutTooltip(focusTarget, { preventScroll: true });
              });
            }}
            onInteractOutside={(event) => {
              preserveNestedControlLayer(event);
              if (event.defaultPrevented) return;
              outsideFocusTransferRef.current =
                event.target instanceof Element &&
                event.target.closest(outsideFocusTransferSelector) !== null;
            }}
          >
            <div className="flex shrink-0 items-center justify-between border-b-2 border-[var(--border-ink)] p-3">
              <p className="font-heading text-sm font-semibold uppercase">
                Table controls
              </p>
              <Button
                type="button"
                variant="outline"
                aria-label="Close table controls"
                onClick={() => setOpen(false)}
              >
                <Close aria-hidden="true" />
                Close
              </Button>
            </div>
            <div
              ref={setTarget}
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-3 pt-0"
            />
          </PopoverContent>
        ) : null}
      </MobileTableControlsContext.Provider>
    </Popover>
  );
};

export const MobileTableControlsTrigger = () => {
  const context = useContext(MobileTableControlsContext);
  const setTriggerElement = context?.setTriggerElement;
  const triggerRef = useCallback(
    (node: HTMLButtonElement | null) => {
      setTriggerElement?.(node);
    },
    [setTriggerElement],
  );

  if (!context) {
    throw new Error(
      "MobileTableControlsTrigger must be rendered inside MobileTableControlsProvider.",
    );
  }

  const trigger = (
    <PopoverTrigger asChild>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        className="h-11 min-w-0 flex-1 justify-center bg-[var(--color-interactive-bright)] text-[var(--foreground)] shadow-[var(--shadow-pixel)] disabled:bg-[var(--band)] data-[state=open]:bg-[var(--color-class-adjustment-bright)] data-[state=open]:shadow-[var(--shadow-pixel)]"
        aria-label="Table controls"
        data-mobile-table-controls-trigger
        data-testid="mobile-table-controls-trigger"
        disabled={context.sourceCount === 0}
      >
        <SettingsCog2 aria-hidden="true" />
        Controls
      </Button>
    </PopoverTrigger>
  );

  return context.sourceCount === 0 ? (
    <Tooltip
      className="flex min-w-0 flex-1 cursor-not-allowed"
      label="No table controls are available on this page."
      triggerLabel="Why table controls are unavailable"
    >
      {trigger}
    </Tooltip>
  ) : (
    trigger
  );
};

export const MobileTableControls = ({
  children,
  order = "toolbar",
}: {
  readonly children: ReactNode;
  readonly order?: "pagination" | "toolbar";
}) => {
  const context = useContext(MobileTableControlsContext);
  const sourceId = useId();
  const sourceRef = useRef<HTMLDivElement>(null);
  const [host] = useState(() => {
    const element = document.createElement("div");
    element.style.display = "contents";
    return element;
  });

  if (!context) {
    throw new Error(
      "MobileTableControls must be rendered inside MobileTableControlsProvider.",
    );
  }

  const { open, register, target } = context;
  useEffect(() => register(sourceId), [register, sourceId]);
  useLayoutEffect(() => {
    const destination = open && target ? target : sourceRef.current;
    if (destination && host.parentElement !== destination) {
      destination.append(host);
    }
  }, [host, open, target]);
  useLayoutEffect(
    () => () => {
      host.remove();
    },
    [host],
  );

  const controls = (
    <div
      className={`min-w-0 ${order === "toolbar" ? "order-1" : "order-2"}`}
      data-mobile-table-controls-content={order}
    >
      {children}
    </div>
  );

  return (
    <>
      <div ref={sourceRef} className="roomy-shell:block hidden" />
      {createPortal(controls, host)}
    </>
  );
};
