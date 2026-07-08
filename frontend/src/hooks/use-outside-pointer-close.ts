import { type RefObject, useEffect } from "react";

const defaultFloatingOverlaySelectors = [
  "[data-slot='popover-content']",
  "[data-slot='tooltip-content']",
  "[role='dialog'][aria-modal='true']",
  "[role='alertdialog'][aria-modal='true']",
] as const;

const isInsidePortalSafeElement = (
  target: Node,
  selectors: readonly string[],
): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest(selectors.join(",")) !== null;
};

export const useOutsidePointerClose = <T extends HTMLElement>({
  enabled = true,
  floatingOverlaySelectors = [],
  onOutsideClose,
  ref,
}: {
  readonly enabled?: boolean;
  readonly floatingOverlaySelectors?: readonly string[];
  readonly onOutsideClose: () => void;
  readonly ref: RefObject<T | null>;
}) => {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const panel = ref.current;
      const target = event.target;
      if (!panel || !(target instanceof Node)) {
        return;
      }
      const safeSelectors = [
        ...defaultFloatingOverlaySelectors,
        ...floatingOverlaySelectors,
      ];
      if (
        panel.contains(target) ||
        isInsidePortalSafeElement(target, safeSelectors)
      ) {
        return;
      }
      onOutsideClose();
    };

    document.addEventListener("pointerdown", onPointerDown, {
      capture: true,
    });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
    };
  }, [enabled, floatingOverlaySelectors, onOutsideClose, ref]);
};
