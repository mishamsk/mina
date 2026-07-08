import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

interface CommandPaletteState {
  readonly open: boolean;
}

const initialCommandPaletteState: CommandPaletteState = {
  open: false,
};

const commandPaletteStore = create<CommandPaletteState>()(
  devtools(() => initialCommandPaletteState, {
    name: "CommandPaletteStore",
  }),
);

export const useCommandPaletteStore = commandPaletteStore;

export const useCommandPaletteOpen = (): boolean =>
  useCommandPaletteStore((state) => state.open);

export const useCommandPaletteView = (): CommandPaletteState =>
  useCommandPaletteStore(
    useShallow((state) => ({
      open: state.open,
    })),
  );

export const getCommandPaletteSnapshot = (): CommandPaletteState =>
  useCommandPaletteStore.getState();

export const setCommandPaletteOpen = (open: boolean): void => {
  useCommandPaletteStore.setState(
    {
      open,
    },
    false,
    "CommandPaletteStore/setCommandPaletteOpen",
  );
};

export const openCommandPalette = (): void => {
  setCommandPaletteOpen(true);
};

export const closeCommandPalette = (): void => {
  setCommandPaletteOpen(false);
};

export const toggleCommandPalette = (): void => {
  useCommandPaletteStore.setState(
    (state) => ({
      open: !state.open,
    }),
    false,
    "CommandPaletteStore/toggleCommandPalette",
  );
};
