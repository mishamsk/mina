import { useMemo } from "react";
import { useLocation } from "react-router";

import type { RovingRowsEntryFocus } from "@/hooks/use-roving-rows";

import { hasActiveOverlay } from "./global-shortcuts";

const routeHasPendingFocusOwner = (): boolean => {
  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.has("entry") || searchParams.has("transaction");
};

const isAppNavigationControl = (element: HTMLElement): boolean =>
  Boolean(
    element.closest("aside[aria-label='Primary'] a[href]") ||
    element.closest("[data-mobile-app-toolbar] [aria-label='Navigation']"),
  );

const isTableEntryFocusEligible = (): boolean => {
  if (routeHasPendingFocusOwner() || hasActiveOverlay()) return false;

  const activeElement = document.activeElement;
  if (!activeElement || activeElement === document.body) {
    return true;
  }
  if (!(activeElement instanceof HTMLElement)) return false;
  if (activeElement.matches("main h1[tabindex='-1']")) return true;
  if (isAppNavigationControl(activeElement)) return true;
  return false;
};

export const useTableEntryFocus = ({
  identity,
  initialResultReady,
  rowIndex,
}: {
  readonly identity?: string;
  readonly initialResultReady: boolean;
  readonly rowIndex?: number;
}): RovingRowsEntryFocus => {
  const location = useLocation();
  const entryIdentity = identity
    ? `${location.pathname}:${identity}`
    : location.pathname;

  return useMemo(
    () => ({
      identity: entryIdentity,
      initialResultReady,
      isEligible: isTableEntryFocusEligible,
      rowIndex,
    }),
    [entryIdentity, initialResultReady, rowIndex],
  );
};
