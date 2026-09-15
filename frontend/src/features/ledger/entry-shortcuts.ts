import type { ShortcutGroup } from "@/store";

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
