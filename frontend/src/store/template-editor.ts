import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type {
  TransactionTemplate,
  TransactionTemplateRecordRequest,
} from "@/api";

export interface TemplateEditorLaunch {
  readonly initialRecords: readonly TransactionTemplateRecordRequest[];
  readonly key: number;
  readonly opener: HTMLElement | undefined;
  readonly template: TransactionTemplate | undefined;
}

interface TemplateEditorState {
  readonly launch: TemplateEditorLaunch | undefined;
  readonly open: boolean;
}

export const useTemplateEditorStore = create<TemplateEditorState>()(
  devtools(
    () => ({
      launch: undefined,
      open: false,
    }),
    { name: "TemplateEditorStore" },
  ),
);

let nextTemplateEditorLaunchKey = 0;

export const useTemplateEditorView = (): TemplateEditorState =>
  useTemplateEditorStore(
    useShallow((state) => ({ launch: state.launch, open: state.open })),
  );

export const getTemplateEditorSnapshot = (): TemplateEditorState =>
  useTemplateEditorStore.getState();

export const openNewTemplateEditor = (
  opener?: HTMLElement,
  initialRecords: readonly TransactionTemplateRecordRequest[] = [],
): void => {
  nextTemplateEditorLaunchKey += 1;
  useTemplateEditorStore.setState(
    {
      launch: {
        initialRecords,
        key: nextTemplateEditorLaunchKey,
        opener,
        template: undefined,
      },
      open: true,
    },
    false,
    "TemplateEditorStore/openNewTemplateEditor",
  );
};

export const openEditTemplateEditor = (
  template: TransactionTemplate,
  opener?: HTMLElement,
): void => {
  nextTemplateEditorLaunchKey += 1;
  useTemplateEditorStore.setState(
    {
      launch: {
        initialRecords: [],
        key: nextTemplateEditorLaunchKey,
        opener,
        template,
      },
      open: true,
    },
    false,
    "TemplateEditorStore/openEditTemplateEditor",
  );
};

export const closeTemplateEditor = (): void => {
  useTemplateEditorStore.setState(
    { open: false },
    false,
    "TemplateEditorStore/closeTemplateEditor",
  );
};
