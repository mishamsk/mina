import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type { RecurringDefinitionRecordRequest } from "@/api";

export interface RecurringDefinitionEditorLaunch {
  readonly initialRecords: readonly RecurringDefinitionRecordRequest[];
  readonly key: number;
  readonly opener: HTMLElement | undefined;
}

interface RecurringDefinitionEditorState {
  readonly launch: RecurringDefinitionEditorLaunch | undefined;
}

interface RecurringDefinitionEditorView extends RecurringDefinitionEditorState {
  readonly open: boolean;
}

export const useRecurringDefinitionEditorStore =
  create<RecurringDefinitionEditorState>()(
    devtools(
      () => ({
        launch: undefined,
      }),
      { name: "RecurringDefinitionEditorStore" },
    ),
  );

let nextRecurringDefinitionEditorLaunchKey = 0;

export const useRecurringDefinitionEditorView =
  (): RecurringDefinitionEditorView =>
    useRecurringDefinitionEditorStore(
      useShallow((state) => ({
        launch: state.launch,
        open: state.launch !== undefined,
      })),
    );

export const openNewRecurringDefinitionEditor = (
  opener?: HTMLElement,
  initialRecords: readonly RecurringDefinitionRecordRequest[] = [],
): void => {
  if (useRecurringDefinitionEditorStore.getState().launch !== undefined) {
    return;
  }
  nextRecurringDefinitionEditorLaunchKey += 1;
  useRecurringDefinitionEditorStore.setState(
    {
      launch: {
        initialRecords,
        key: nextRecurringDefinitionEditorLaunchKey,
        opener,
      },
    },
    false,
    "RecurringDefinitionEditorStore/openNewRecurringDefinitionEditor",
  );
};

export const closeRecurringDefinitionEditor = (): void => {
  useRecurringDefinitionEditorStore.setState(
    { launch: undefined },
    false,
    "RecurringDefinitionEditorStore/closeRecurringDefinitionEditor",
  );
};
