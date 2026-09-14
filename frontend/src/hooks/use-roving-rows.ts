import {
  type KeyboardEvent,
  type RefObject,
  useLayoutEffect,
  useState,
} from "react";

import { isInteractiveTarget } from "@/components/link-activation";

type RowEvent = KeyboardEvent<HTMLTableRowElement>;
type RowAction = (
  index: number,
  row: HTMLTableRowElement,
  event: RowEvent,
) => void;

export function useRovingRows({
  containerRef,
  rowSelector,
  onActivate,
  onActiveChange,
  onKeyDown,
}: {
  containerRef: RefObject<HTMLElement | null>;
  rowSelector: string;
  onActivate?: RowAction;
  onActiveChange?: RowAction;
  onKeyDown?: RowAction;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [container, setContainer] = useState<HTMLElement | null>(null);

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
