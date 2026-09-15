import type { ShortcutGroup } from "@/store";

export const modalOverlaySelector =
  "[role='alertdialog'], [role='dialog'][aria-modal='true'], [data-global-shortcut-blocking-overlay], [data-recurring-definition-editor], [data-page-help-content], [data-slot='popover-content'], [data-slot='select-content'][data-state='open']";

export const isVisibleOverlay = (element: Element): boolean =>
  element instanceof HTMLElement && element.getClientRects().length > 0;

export const hasActiveOverlay = (): boolean =>
  Array.from(document.querySelectorAll(modalOverlaySelector)).some(
    isVisibleOverlay,
  );

export const hasHelpBlockingOverlay = (): boolean =>
  Array.from(document.querySelectorAll(modalOverlaySelector)).some(
    (element) =>
      !element.hasAttribute("data-transaction-entry-modal") &&
      isVisibleOverlay(element),
  );

export const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.matches("input, textarea, select") || target.isContentEditable);

export const globalShortcutGroup: ShortcutGroup = {
  id: "global",
  title: "Global",
  order: 0,
  shortcuts: [
    { id: "palette", keys: ["Mod", "K"], label: "Open command palette" },
    { id: "new", keys: ["n"], label: "New transaction" },
    { id: "help", keys: ["?"], label: "Keyboard shortcuts" },
    { id: "close", keys: ["Esc"], label: "Close the topmost overlay" },
  ],
};
