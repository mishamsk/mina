import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

export interface KeyboardShortcut {
  readonly id: string;
  readonly keys: readonly string[];
  readonly label: string;
  readonly detail?: string;
}

export interface ShortcutGroup {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly shortcuts: readonly KeyboardShortcut[];
}

interface KeyboardShortcutsState {
  readonly groups: ReadonlyMap<string, ShortcutGroup>;
  readonly launch:
    | { readonly key: number; readonly opener: HTMLElement | undefined }
    | undefined;
  readonly open: boolean;
}

export const useKeyboardShortcutsStore = create<KeyboardShortcutsState>()(
  devtools(() => ({ groups: new Map(), launch: undefined, open: false }), {
    name: "KeyboardShortcutsStore",
  }),
);
let nextLaunchKey = 0;

export const useKeyboardShortcutsView = () =>
  useKeyboardShortcutsStore(
    useShallow((state) => ({
      groups: state.groups,
      launch: state.launch,
      open: state.open,
    })),
  );
export const getKeyboardShortcutsSnapshot = (): KeyboardShortcutsState =>
  useKeyboardShortcutsStore.getState();

export const registerShortcutGroup = (group: ShortcutGroup): void => {
  useKeyboardShortcutsStore.setState(
    (state) => ({ groups: new Map(state.groups).set(group.id, group) }),
    false,
    "KeyboardShortcutsStore/registerShortcutGroup",
  );
};
export const unregisterShortcutGroup = (id: string): void => {
  useKeyboardShortcutsStore.setState(
    (state) => {
      const groups = new Map(state.groups);
      groups.delete(id);
      return { groups };
    },
    false,
    "KeyboardShortcutsStore/unregisterShortcutGroup",
  );
};
export const openKeyboardShortcuts = (opener?: HTMLElement): void => {
  useKeyboardShortcutsStore.setState(
    { launch: { key: ++nextLaunchKey, opener }, open: true },
    false,
    "KeyboardShortcutsStore/openKeyboardShortcuts",
  );
};
export const closeKeyboardShortcuts = (): void => {
  useKeyboardShortcutsStore.setState(
    { open: false },
    false,
    "KeyboardShortcutsStore/closeKeyboardShortcuts",
  );
};
