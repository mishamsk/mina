import type { ShortcutGroup } from "@/store";

export const modalOverlaySelector =
  "[role='alertdialog'], [role='dialog'][aria-modal='true'], [data-global-shortcut-blocking-overlay], [data-recurring-definition-editor], [data-page-help-content], [data-slot='popover-content'], [data-slot='select-content'][data-state='open']";

export const isVisibleOverlay = (element: Element): boolean =>
  element instanceof HTMLElement && element.getClientRects().length > 0;

export const hasActiveOverlay = (): boolean =>
  Array.from(document.querySelectorAll(modalOverlaySelector)).some(
    isVisibleOverlay,
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

export const commandPaletteShortcutGroup: ShortcutGroup = {
  id: "command-palette",
  title: "Command palette",
  order: 1,
  shortcuts: [
    {
      id: "account-transactions",
      keys: ["Mod", "Enter"],
      label: "Open Transactions filtered to the account",
      detail:
        "On an account or account-group result; Enter alone opens its register.",
    },
  ],
};

export const transactionEntryShortcutGroup: ShortcutGroup = {
  id: "entry",
  title: "Transaction entry",
  order: 2,
  shortcuts: [
    {
      id: "entry-0",
      keys: ["Mod", "Enter"],
      label: "Save and add another, or update",
    },
    {
      id: "entry-1",
      keys: ["Mod", "Shift", "Enter"],
      label: "Save and close",
    },
    {
      id: "entry-2",
      keys: ["Esc"],
      label: "Close the picker, then the modal",
    },
    {
      id: "entry-3",
      keys: ["↑", "↓"],
      label: "Move through picker options",
    },
    {
      id: "entry-4",
      keys: ["Enter"],
      label: "Choose a picker option",
    },
    {
      id: "entry-5",
      keys: ["Tab", "→"],
      label: "Commit a hierarchy segment",
    },
    {
      id: "entry-6",
      keys: ["←", "Backspace"],
      label: "Back out of a hierarchy segment",
    },
    {
      id: "entry-7",
      keys: ["Cmd"],
      label: "Reveal full picker paths",
      detail: "Hold while using a hierarchical picker.",
    },
  ],
};
