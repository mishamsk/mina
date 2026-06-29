import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import {
  readUiPreferences,
  type ThemePreference,
  type UiPreferences,
  writeUiPreferences,
} from "../services/indexeddb";
import { createSelectors } from "./selectors";

const defaultUiPreferences: UiPreferences = {
  theme: "system",
};

interface PreferencesState {
  readonly errorMessage: string | undefined;
  readonly preferences: UiPreferences;
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "UI preferences could not be saved.";

const initialPreferencesState: PreferencesState = {
  errorMessage: undefined,
  preferences: defaultUiPreferences,
};

const preferencesStore = create<PreferencesState>()(
  devtools(() => initialPreferencesState, { name: "PreferencesStore" }),
);

export const usePreferencesStore = createSelectors(preferencesStore);

export const usePreferencesView = () =>
  usePreferencesStore(
    useShallow((state) => ({
      errorMessage: state.errorMessage,
      preferences: state.preferences,
    })),
  );

export const getUiPreferencesSnapshot = (): UiPreferences =>
  usePreferencesStore.getState().preferences;

export const hydrateUiPreferences = async (): Promise<void> => {
  const storedPreferences = await readUiPreferences();
  usePreferencesStore.setState(
    {
      errorMessage: undefined,
      preferences: storedPreferences
        ? { ...storedPreferences }
        : defaultUiPreferences,
    },
    false,
    "PreferencesStore/hydrateUiPreferences",
  );
};

export const setThemePreference = (theme: ThemePreference): void => {
  const nextPreferences = {
    ...usePreferencesStore.getState().preferences,
    theme,
  };
  usePreferencesStore.setState(
    { errorMessage: undefined, preferences: nextPreferences },
    false,
    "PreferencesStore/setThemePreference",
  );

  void writeUiPreferences(nextPreferences).catch((error: unknown) => {
    usePreferencesStore.setState(
      { errorMessage: toErrorMessage(error) },
      false,
      "PreferencesStore/setThemePreferenceError",
    );
  });
};
