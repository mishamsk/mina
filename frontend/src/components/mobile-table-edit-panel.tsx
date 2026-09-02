import { Close, Pencil } from "pixelarticons/react";
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
import { focusWithoutTooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface MobileTableEditPanelContextValue {
  readonly open: boolean;
  readonly register: (id: string) => () => void;
  readonly setOpen: (open: boolean) => void;
  readonly setTarget: (target: HTMLDivElement | null) => void;
  readonly sourceCount: number;
  readonly target: HTMLDivElement | null;
}

const MobileTableEditPanelContext =
  createContext<MobileTableEditPanelContextValue | null>(null);

export const useOpenMobileTableEditPanel = () => {
  const context = useContext(MobileTableEditPanelContext);
  if (!context) {
    throw new Error(
      "useOpenMobileTableEditPanel must be used inside MobileTableEditPanelProvider.",
    );
  }
  return useCallback(() => {
    const trigger = document.querySelector<HTMLElement>(
      "[data-mobile-table-edit-trigger]",
    );
    if (!trigger?.getClientRects().length) return false;
    context.setOpen(true);
    return true;
  }, [context]);
};

export const MobileTableEditPanelProvider = ({
  children,
}: {
  readonly children: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const [sourceIds, setSourceIds] = useState<ReadonlySet<string>>(new Set());
  const sourceIdsRef = useRef<ReadonlySet<string>>(new Set());
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
  const value = useMemo(
    () => ({
      open,
      register,
      setOpen,
      setTarget,
      sourceCount: sourceIds.size,
      target,
    }),
    [open, register, sourceIds.size, target],
  );

  return (
    <MobileTableEditPanelContext.Provider value={value}>
      {children}
    </MobileTableEditPanelContext.Provider>
  );
};

export const MobileTableEditPanelTrigger = () => {
  const context = useContext(MobileTableEditPanelContext);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const setTarget = context?.setTarget;
  const targetRef = useCallback(
    (node: HTMLDivElement | null) => setTarget?.(node),
    [setTarget],
  );
  if (!context) {
    throw new Error(
      "MobileTableEditPanelTrigger must be rendered inside MobileTableEditPanelProvider.",
    );
  }
  const { open, setOpen, sourceCount } = context;
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    let triggerWasVisible = trigger.getClientRects().length > 0;
    let triggerHadFocus = document.activeElement === trigger;
    const trackTriggerFocus = (event: FocusEvent) => {
      if (event.target === trigger) {
        triggerHadFocus = true;
      } else if (event.target !== document.body) {
        triggerHadFocus = false;
      }
    };
    const closeAtRoomyBreakpoint = () => {
      const triggerIsVisible = trigger.getClientRects().length > 0;
      if (triggerIsVisible === triggerWasVisible) return;
      triggerWasVisible = triggerIsVisible;
      if (triggerIsVisible) return;
      if (open) setOpen(false);
      if (!triggerHadFocus) return;
      window.requestAnimationFrame(() => {
        const activeElement =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        if (
          activeElement &&
          activeElement !== document.body &&
          activeElement.getClientRects().length
        ) {
          return;
        }
        focusWithoutTooltip(
          document.querySelector<HTMLElement>(
            "[data-transaction-browser-edit-controls] button:not([disabled])",
          ),
          { preventScroll: true },
        );
        triggerHadFocus = false;
      });
    };
    document.addEventListener("focusin", trackTriggerFocus, { capture: true });
    window.addEventListener("resize", closeAtRoomyBreakpoint);
    return () => {
      document.removeEventListener("focusin", trackTriggerFocus, {
        capture: true,
      });
      window.removeEventListener("resize", closeAtRoomyBreakpoint);
    };
  }, [open, setOpen, sourceCount]);
  if (sourceCount === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          className="h-11 min-w-0 justify-center bg-[var(--color-class-income-bright)] text-[var(--foreground)] shadow-[var(--shadow-pixel)] data-[state=open]:bg-[var(--color-class-adjustment-bright)] data-[state=open]:shadow-[var(--shadow-pixel)]"
          aria-label="Edit transactions"
          data-mobile-table-edit-trigger
        >
          <Pencil aria-hidden="true" />
          Edit
        </Button>
      </PopoverTrigger>
      <PopoverContent
        compactBack={false}
        aria-label="Transaction edit controls"
        data-mobile-parent-sheet
        className="flex max-h-[var(--radix-popover-content-available-height)] flex-col gap-0 overflow-hidden p-0 [--frame-foreground:var(--foreground)] [--frame-muted:var(--muted-foreground)]"
        side="top"
        align="end"
        sideOffset={10}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          setTarget?.(null);
          const trigger = triggerRef.current;
          const activeElement =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          if (
            activeElement !== trigger &&
            activeElement?.closest("[data-mobile-app-toolbar]")
          ) {
            return;
          }
          if (trigger?.getClientRects().length) {
            focusWithoutTooltip(trigger, { preventScroll: true });
            return;
          }
          window.requestAnimationFrame(() => {
            const activeElement =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            if (
              activeElement &&
              activeElement !== document.body &&
              activeElement.getClientRects().length
            ) {
              return;
            }
            focusWithoutTooltip(
              document.querySelector<HTMLElement>(
                "[data-transaction-browser-edit-controls] button:not([disabled])",
              ),
              { preventScroll: true },
            );
          });
        }}
        onInteractOutside={preserveNestedControlLayer}
      >
        <div className="flex shrink-0 items-center justify-between border-b-2 border-[var(--border-ink)] p-3">
          <p className="font-heading text-sm font-semibold uppercase">
            Edit transactions
          </p>
          <Button
            type="button"
            variant="outline"
            aria-label="Close transaction edit controls"
            onClick={() => setOpen(false)}
          >
            <Close aria-hidden="true" />
            Close
          </Button>
        </div>
        <div
          ref={targetRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
          data-mobile-table-controls-content="edit"
        />
      </PopoverContent>
    </Popover>
  );
};

export const MobileTableEditPanel = ({
  children,
}: {
  readonly children: ReactNode;
}) => {
  const context = useContext(MobileTableEditPanelContext);
  const sourceId = useId();
  const sourceRef = useRef<HTMLDivElement>(null);
  const [host] = useState(() => {
    const element = document.createElement("div");
    element.style.display = "contents";
    return element;
  });
  if (!context) {
    throw new Error(
      "MobileTableEditPanel must be rendered inside MobileTableEditPanelProvider.",
    );
  }

  const { open, register, target } = context;
  useLayoutEffect(() => register(sourceId), [register, sourceId]);
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

  return (
    <>
      <div ref={sourceRef} className="roomy-shell:contents hidden" />
      {createPortal(children, host)}
    </>
  );
};
