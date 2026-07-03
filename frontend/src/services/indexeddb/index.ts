import {
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  openDB,
} from "idb";

import type {
  StatusPageUiState,
  TransactionEntryDraft,
  UiPreferences,
} from "@/models/ui-state";

interface MinaUiDb extends DBSchema {
  readonly transaction_entry_draft: {
    readonly key: "transaction-entry";
    readonly value: TransactionEntryDraft;
  };
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
const databaseVersion = 3;
const legacySpendEntryKey = "spend-entry";
const legacySpendEntryStoreName = "spend_entry_draft";
const preferencesKey = "preferences";
const statusPageKey = "status-page";
const transactionEntryKey = "transaction-entry";
const transactionEntryStoreName = "transaction_entry_draft";

let databasePromise: Promise<IDBPDatabase<MinaUiDb>> | undefined;

const migrateTransactionEntryDraftStore = (
  database: IDBPDatabase<MinaUiDb>,
  transaction: IDBPTransaction<unknown, string[], "versionchange">,
): void => {
  const storeNames = database.objectStoreNames as DOMStringList;
  if (storeNames.contains(transactionEntryStoreName)) {
    return;
  }

  if (!storeNames.contains(legacySpendEntryStoreName)) {
    database.createObjectStore(transactionEntryStoreName);
    return;
  }

  const draftStore = transaction.objectStore(legacySpendEntryStoreName);
  draftStore.name = transactionEntryStoreName;

  void draftStore
    .get(legacySpendEntryKey)
    .then((legacyDraft: unknown) => {
      if (!legacyDraft) {
        return undefined;
      }

      return draftStore
        .put(legacyDraft as TransactionEntryDraft, transactionEntryKey)
        .then(() => draftStore.delete(legacySpendEntryKey));
    })
    .catch(() => {
      transaction.abort();
    });
};

const openMinaUiDb = (): Promise<IDBPDatabase<MinaUiDb>> => {
  databasePromise ??= openDB<MinaUiDb>(databaseName, databaseVersion, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        database.createObjectStore("ui_preferences");
        database.createObjectStore("status_page_ui_state");
      }
      if (oldVersion < 3) {
        migrateTransactionEntryDraftStore(
          database,
          transaction as unknown as IDBPTransaction<
            unknown,
            string[],
            "versionchange"
          >,
        );
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

export const readTransactionEntryDraft = async (): Promise<
  TransactionEntryDraft | undefined
> => {
  const database = await openMinaUiDb();
  return database.get(transactionEntryStoreName, transactionEntryKey);
};

export const writeTransactionEntryDraft = async (
  draft: TransactionEntryDraft,
): Promise<void> => {
  const database = await openMinaUiDb();
  await database.put(transactionEntryStoreName, draft, transactionEntryKey);
};
