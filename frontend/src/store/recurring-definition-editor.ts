import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type {
  RecurringDefinition,
  RecurringDefinitionRecordRequest,
} from "@/api";

export interface RecurringDefinitionEditorLaunch {
  readonly definition: RecurringDefinition | undefined;
  readonly fragmentNavigation?: string;
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
const consumedFragmentNavigations = new Set<string>();

export const consumeRecurringDefinitionFragmentNavigation = (
  fragmentNavigation: string,
): void => {
  consumedFragmentNavigations.add(fragmentNavigation);
};

export const takeConsumedRecurringDefinitionFragmentNavigation = (
  fragmentNavigation: string,
): boolean => consumedFragmentNavigations.delete(fragmentNavigation);

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
        definition: undefined,
        initialRecords,
        key: nextRecurringDefinitionEditorLaunchKey,
        opener,
      },
    },
    false,
    "RecurringDefinitionEditorStore/openNewRecurringDefinitionEditor",
  );
};

export const openEditRecurringDefinitionEditor = (
  definition: RecurringDefinition,
  opener: HTMLElement | undefined,
  fragmentNavigation?: string,
): void => {
  if (useRecurringDefinitionEditorStore.getState().launch !== undefined) {
    return;
  }
  nextRecurringDefinitionEditorLaunchKey += 1;
  useRecurringDefinitionEditorStore.setState(
    {
      launch: {
        definition,
        fragmentNavigation,
        initialRecords: [],
        key: nextRecurringDefinitionEditorLaunchKey,
        opener,
      },
    },
    false,
    "RecurringDefinitionEditorStore/openEditRecurringDefinitionEditor",
  );
};

export const closeRecurringDefinitionEditor = (): void => {
  useRecurringDefinitionEditorStore.setState(
    { launch: undefined },
    false,
    "RecurringDefinitionEditorStore/closeRecurringDefinitionEditor",
  );
};
