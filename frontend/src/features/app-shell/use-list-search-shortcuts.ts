import { useShortcutGroup } from "@/hooks/use-shortcut-group";
import {
  type KeyboardShortcut,
  registerShortcutGroup,
  type ShortcutGroup,
  unregisterShortcutGroup,
} from "@/store";

const listSearchShortcuts: readonly KeyboardShortcut[] = [
  { id: "list-search-slash", keys: ["/"], label: "Focus list search" },
  {
    id: "list-search-primary-shift-f",
    keys: ["Mod", "Shift", "F"],
    label: "Focus list search",
  },
];

const listSearchShortcutGroup: ShortcutGroup = {
  id: "list-search",
  title: "List search",
  order: 5,
  shortcuts: listSearchShortcuts,
};

export const useListSearchShortcuts = (): void => {
  useShortcutGroup(
    listSearchShortcutGroup,
    registerShortcutGroup,
    unregisterShortcutGroup,
  );
};
