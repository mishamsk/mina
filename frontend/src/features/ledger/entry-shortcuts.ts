import type { ShortcutGroup } from "@/store";

export const entryActionKeys = {
  save: ["Ctrl", "Enter"],
  saveAndClose: ["Ctrl", "Shift", "Enter"],
  draft: ["Ctrl", "S"],
  template: ["Mod", "Shift", "F"],
} as const;

export const entryActionHint = (
  action: "save" | "saveAndClose",
  editing: boolean,
): string =>
  editing
    ? `Update transaction · ${entryActionKeys.save.join("+")} / ${entryActionKeys.saveAndClose.join("+")}`
    : `${action === "save" ? "Save and add another" : "Save and close"} · ${entryActionKeys[action].join("+")}`;

export const matchesEntryAction = (
  event: KeyboardEvent,
  action: keyof typeof entryActionKeys,
): boolean => {
  const keys: readonly string[] = entryActionKeys[action];
  const modifier =
    action === "template"
      ? event.metaKey || event.ctrlKey
      : event.ctrlKey && !event.metaKey;
  return (
    modifier &&
    !event.altKey &&
    event.shiftKey === keys.includes("Shift") &&
    event.key.toLowerCase() === keys[keys.length - 1]?.toLowerCase()
  );
};

export const transactionEntryShortcutGroup = ({
  editing,
  draftEligible,
  templateEligible,
}: {
  readonly editing: boolean;
  readonly draftEligible: boolean;
  readonly templateEligible: boolean;
}): ShortcutGroup => ({
  id: "entry",
  title: "Transaction entry",
  order: 2,
  shortcuts: [
    {
      id: "entry-0",
      keys: [...entryActionKeys.save],
      label: editing ? "Update transaction" : "Save and add another",
      detail: "Ctrl is the physical Control key, including on Mac.",
    },
    {
      id: "entry-1",
      keys: [...entryActionKeys.saveAndClose],
      label: editing ? "Update transaction and close" : "Save and close",
    },
    ...(draftEligible
      ? [
          {
            id: "entry-2",
            keys: [...entryActionKeys.draft],
            label: "Save the draft and close",
          },
        ]
      : []),
    ...(templateEligible
      ? [
          {
            id: "entry-template",
            keys: [...entryActionKeys.template],
            label: "Start from a template",
          },
        ]
      : []),
    { id: "entry-3", keys: ["Esc"], label: "Close the picker, then the modal" },
    { id: "entry-4", keys: ["↑", "↓"], label: "Move through picker options" },
    { id: "entry-5", keys: ["Enter"], label: "Choose a picker option" },
    { id: "entry-6", keys: ["Tab", "→"], label: "Commit a hierarchy segment" },
    {
      id: "entry-7",
      keys: ["←", "Backspace"],
      label: "Back out of a hierarchy segment",
    },
    {
      id: "entry-8",
      keys: ["Cmd"],
      label: "Reveal full picker paths",
      detail: "Hold while using a hierarchical picker.",
    },
  ],
});
