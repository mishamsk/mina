import {
  type KeyboardEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { isInteractiveTarget } from "@/components/link-activation";

type RowEvent = KeyboardEvent<HTMLTableRowElement>;
type RowAction = (
  index: number,
  row: HTMLTableRowElement,
  event: RowEvent,
) => void;

export interface RovingRowsEntryFocus {
  readonly identity: string;
  readonly initialResultReady: boolean;
  readonly isEligible: () => boolean;
  readonly rowIndex?: number;
}

export function useRovingRows({
  containerRef,
  rowSelector,
  onActivate,
  onActiveChange,
  onKeyDown,
  entryFocus,
}: {
  containerRef: RefObject<HTMLElement | null>;
  rowSelector: string;
  onActivate?: RowAction;
  onActiveChange?: RowAction;
  onKeyDown?: RowAction;
  entryFocus?: RovingRowsEntryFocus;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const entryFocusAttemptRef = useRef<
    | {
        consumed: boolean;
        identity: string;
      }
    | undefined
  >(undefined);

  // Re-resolve after commits so loading/empty surfaces can replace the table.
  useLayoutEffect(() => {
    setContainer(
      containerRef.current?.querySelector(rowSelector)?.parentElement ?? null,
    );
  });

  useLayoutEffect(() => {
    if (!container) return;
    let restored: Array<() => void> = [];
    const restore = () => {
      restored.forEach((reset) => reset());
      restored = [];
    };
    const reconcile = () => {
      restore();
      const rows = container.querySelectorAll<HTMLTableRowElement>(rowSelector);
      const clamped = Math.min(activeIndex, Math.max(0, rows.length - 1));
      if (clamped !== activeIndex) setActiveIndex(clamped);
      // Only the active row's nested controls participate in sequential focus.
      rows.forEach((row, index) => {
        row
          .querySelectorAll<HTMLElement>(
            "a[href], button, input, select, textarea, summary, [contenteditable='true'], [tabindex]",
          )
          .forEach((control) => {
            const original = control.getAttribute("tabindex");
            // Explicit indexes also make native links and buttons tabbable in WebKit.
            control.tabIndex = index === clamped ? control.tabIndex : -1;
            restored.push(() => {
              if (original === null) control.removeAttribute("tabindex");
              else control.setAttribute("tabindex", original);
            });
          });
      });
    };
    reconcile();
    // Action clusters can replace their controls without rerendering the list.
    const observer = new MutationObserver(reconcile);
    observer.observe(container, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      restore();
    };
  }, [activeIndex, rowSelector, container]);

  useLayoutEffect(() => {
    if (!entryFocus) return;
    if (entryFocusAttemptRef.current?.identity !== entryFocus.identity) {
      entryFocusAttemptRef.current = {
        consumed: false,
        identity: entryFocus.identity,
      };
    }
    const attempt = entryFocusAttemptRef.current;
    if (attempt.consumed || !entryFocus.initialResultReady) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      attempt.consumed = true;
      if (!entryFocus.isEligible()) return;

      const rows =
        containerRef.current?.querySelectorAll<HTMLTableRowElement>(
          rowSelector,
        );
      const row =
        rows?.[
          Math.max(
            0,
            Math.min(entryFocus.rowIndex ?? activeIndex, rows.length - 1),
          )
        ];
      if (!row?.isConnected) return;
      row.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, containerRef, entryFocus, rowSelector]);

  return (index: number) => ({
    tabIndex: index === activeIndex ? 0 : -1,
    "data-active": index === activeIndex,
    onFocus: () => setActiveIndex(index),
    onKeyDown: (event: RowEvent) => {
      if (
        event.defaultPrevented ||
        isInteractiveTarget(event.target, event.currentTarget)
      )
        return;
      onKeyDown?.(index, event.currentTarget, event);
      if (event.defaultPrevented) return;
      if (event.key === "Enter" || event.key === " ") {
        // Link activation checks defaultPrevented itself, so call it first.
        onActivate?.(index, event.currentTarget, event);
        event.preventDefault();
        return;
      }
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const rows =
        containerRef.current?.querySelectorAll<HTMLTableRowElement>(
          rowSelector,
        );
      if (!rows?.length) return;
      const nextIndex =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? rows.length - 1
            : Math.max(
                0,
                Math.min(
                  rows.length - 1,
                  index + (event.key === "ArrowDown" ? 1 : -1),
                ),
              );
      const row = rows[nextIndex];
      if (!row) return;
      setActiveIndex(nextIndex);
      const header = row.closest("table")?.tHead;
      const scrollMarginTop = row.style.scrollMarginTop;
      if (header && getComputedStyle(header).position === "sticky") {
        row.style.scrollMarginTop = `${header.getBoundingClientRect().height}px`;
      }
      row.scrollIntoView({ block: "nearest" });
      row.style.scrollMarginTop = scrollMarginTop;
      row.focus({ preventScroll: true });
      onActiveChange?.(nextIndex, row, event);
    },
  });
}
