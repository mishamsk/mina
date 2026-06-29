import { type DBSchema, type IDBPDatabase, openDB } from "idb";

export type ThemePreference = "system" | "light" | "dark";

export interface UiPreferences {
  readonly theme: ThemePreference;
}

export interface StatusPageUiState {
  readonly showDetails: boolean;
}

interface MinaUiDb extends DBSchema {
  readonly status_page_ui_state: {
    readonly key: "status-page";
    readonly value: StatusPageUiState;
  };
  readonly ui_preferences: {
    readonly key: "preferences";
    readonly value: UiPreferences;
  };
}

const databaseName = "mina-ui-state";
const databaseVersion = 1;
const preferencesKey = "preferences";
const statusPageKey = "status-page";

let databasePromise: Promise<IDBPDatabase<MinaUiDb>> | undefined;

const openMinaUiDb = (): Promise<IDBPDatabase<MinaUiDb>> => {
  databasePromise ??= openDB<MinaUiDb>(databaseName, databaseVersion, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore("ui_preferences");
        database.createObjectStore("status_page_ui_state");
      }
    },
  });

  return databasePromise;
};

export const readUiPreferences = async (): Promise<
  UiPreferences | undefined
> => {
  const database = await openMinaUiDb();
  return database.get("ui_preferences", preferencesKey);
};

export const writeUiPreferences = async (
  preferences: UiPreferences,
): Promise<void> => {
  const database = await openMinaUiDb();
  await database.put("ui_preferences", preferences, preferencesKey);
};

export const readStatusPageUiState = async (): Promise<
  StatusPageUiState | undefined
> => {
  const database = await openMinaUiDb();
  return database.get("status_page_ui_state", statusPageKey);
};

export const writeStatusPageUiState = async (
  state: StatusPageUiState,
): Promise<void> => {
  const database = await openMinaUiDb();
  await database.put("status_page_ui_state", state, statusPageKey);
};
