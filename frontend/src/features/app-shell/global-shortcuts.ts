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

export const matchesListSearchShortcut = (event: KeyboardEvent): boolean =>
  (event.key === "/" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey) ||
  (event.key.toLocaleLowerCase() === "l" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey);

export const resolveVisibleListSearchInput = (): HTMLInputElement | undefined =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-list-search-input]"),
  ).find(
    (input) =>
      input.isConnected &&
      !input.disabled &&
      !input.closest("[inert]") &&
      input.getClientRects().length > 0,
  );

export const isListSearchFocusInsideDialog = (): boolean =>
  Boolean(document.activeElement?.closest("[role='dialog']"));

export const globalShortcutGroup: ShortcutGroup = {
  id: "global",
  title: "Global",
  order: 0,
  shortcuts: [
    { id: "palette", keys: ["Mod", "K"], label: "Open command palette" },
    { id: "new", keys: ["n"], label: "New transaction" },
    {
      id: "new-tab",
      keys: ["n", "s"],
      label: "New transaction on a tab",
      detail:
        "n then s, i, r, t, e, or a for Spend, Income, Refund, Transfer, Exchange, or Advanced.",
    },
    { id: "help", keys: ["?"], label: "Keyboard shortcuts" },
    { id: "close", keys: ["Esc"], label: "Close the topmost overlay" },
  ],
};
