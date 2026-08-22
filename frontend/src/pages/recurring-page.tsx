import { Plus } from "pixelarticons/react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import type { RecurringDefinition } from "@/api";
import { PageHelp } from "@/components/page-help";
import { Toast, toastDurationMs } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell";
import {
  DefinitionEditorPanel,
  RecurringPageContent,
  refreshAfterRecurringDefinitionMutation,
  revealRecurringDefinitionActionRow,
  useRecurringDefinitionsResource,
} from "@/features/recurring";
import {
  openEditRecurringDefinitionEditor,
  takeConsumedRecurringDefinitionFragmentNavigation,
  useCommandPaletteOpen,
  useRecurringDefinitionEditorView,
  useTemplateEditorView,
} from "@/store";

interface Notice {
  readonly id: number;
  readonly message: string;
  readonly tone: "error" | "success";
}

interface EditorTarget {
  readonly definition: RecurringDefinition | undefined;
  readonly key: string | number;
  readonly opener: HTMLElement | undefined;
}

const definitionIdFromFragment = (hash: string): number | undefined => {
  const match = /^#definition-([1-9][0-9]*)$/.exec(hash);
  return match ? Number(match[1]) : undefined;
};

export const RecurringPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const recurringDefinitions = useRecurringDefinitionsResource();
  const commandPaletteOpen = useCommandPaletteOpen();
  const recurringDefinitionEditor = useRecurringDefinitionEditorView();
  const templateEditor = useTemplateEditorView();
  const [notice, setNotice] = useState<Notice | undefined>();
  const [editorTarget, setEditorTarget] = useState<EditorTarget>();
  const handledFragmentNavigationRef = useRef<string | undefined>(undefined);
  const deferredFragmentNavigationRef = useRef<string | undefined>(undefined);
  const newDefinitionButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const definitionId = definitionIdFromFragment(location.hash);
    if (definitionId === undefined) {
      handledFragmentNavigationRef.current = undefined;
      deferredFragmentNavigationRef.current = undefined;
      return;
    }
    const fragmentNavigation = `${location.key}:${location.hash}`;
    if (takeConsumedRecurringDefinitionFragmentNavigation(fragmentNavigation)) {
      handledFragmentNavigationRef.current = fragmentNavigation;
      deferredFragmentNavigationRef.current = undefined;
      void navigate(
        { pathname: location.pathname, search: location.search },
        { replace: true },
      );
      return;
    }
    if (handledFragmentNavigationRef.current === fragmentNavigation) {
      return;
    }
    if (
      commandPaletteOpen ||
      recurringDefinitionEditor.open ||
      templateEditor.open
    ) {
      deferredFragmentNavigationRef.current = fragmentNavigation;
      return;
    }
    if (editorTarget) {
      handledFragmentNavigationRef.current = fragmentNavigation;
      deferredFragmentNavigationRef.current = undefined;
      void navigate(
        { pathname: location.pathname, search: location.search },
        { replace: true },
      );
      return;
    }
    if (!recurringDefinitions.snapshot) {
      return;
    }
    const definition = recurringDefinitions.snapshot.definitions.find(
      (candidate) => candidate.recurring_definition_id === definitionId,
    );
    if (!definition) {
      handledFragmentNavigationRef.current = fragmentNavigation;
      deferredFragmentNavigationRef.current = undefined;
      const frame = window.requestAnimationFrame(() => {
        setNotice((current) => ({
          id: (current?.id ?? 0) + 1,
          message: "Recurring definition is no longer available.",
          tone: "error",
        }));
        void navigate(
          { pathname: location.pathname, search: location.search },
          { replace: true },
        );
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }
    const openLinkedEditor = () => {
      const opener = document.getElementById(`definition-${definitionId}`);
      if (opener instanceof HTMLElement) {
        revealRecurringDefinitionActionRow(opener);
      }
      handledFragmentNavigationRef.current = fragmentNavigation;
      deferredFragmentNavigationRef.current = undefined;
      openEditRecurringDefinitionEditor(
        definition,
        opener instanceof HTMLElement ? opener : undefined,
        fragmentNavigation,
      );
    };
    let deferredFrame: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      if (deferredFragmentNavigationRef.current === fragmentNavigation) {
        deferredFrame = window.requestAnimationFrame(openLinkedEditor);
        return;
      }
      openLinkedEditor();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (deferredFrame !== undefined) {
        window.cancelAnimationFrame(deferredFrame);
      }
    };
  }, [
    commandPaletteOpen,
    editorTarget,
    location.hash,
    location.key,
    location.pathname,
    location.search,
    navigate,
    recurringDefinitionEditor.open,
    recurringDefinitions.snapshot,
    templateEditor.open,
  ]);

  const clearDefinitionFragment = () => {
    if (definitionIdFromFragment(location.hash) === undefined) {
      return;
    }
    void navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true },
    );
  };

  const showNotice = (message: string) => {
    setNotice((current) => ({
      id: (current?.id ?? 0) + 1,
      message,
      tone: "success",
    }));
  };

  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6"
      aria-labelledby="recurring-title"
    >
      <PageHeader
        title="Recurring"
        titleId="recurring-title"
        eyebrow="Ledger"
        actions={
          <Button
            ref={newDefinitionButtonRef}
            type="button"
            onClick={(event) => {
              clearDefinitionFragment();
              setEditorTarget({
                definition: undefined,
                key: "new",
                opener: event.currentTarget,
              });
            }}
          >
            <Plus aria-hidden="true" />
            New definition
          </Button>
        }
        help={
          <PageHelp label="Recurring help">
            Manage recurring transaction definitions. Expected occurrences
            appear inline in Transactions.
          </PageHelp>
        }
      />
      <div className="min-h-0 flex-1">
        <RecurringPageContent
          errorMessage={recurringDefinitions.errorMessage}
          loading={recurringDefinitions.loading}
          onEdit={(definition, opener) => {
            clearDefinitionFragment();
            setEditorTarget({
              definition,
              key: definition.recurring_definition_id,
              opener,
            });
          }}
          onNotice={showNotice}
          refresh={recurringDefinitions.refresh}
          snapshot={recurringDefinitions.snapshot}
        />
      </div>
      <Toast
        key={notice?.id ?? "empty"}
        className={
          notice?.tone === "error"
            ? "text-destructive"
            : "text-[var(--color-money-in)]"
        }
        durationMs={toastDurationMs}
        message={notice?.message}
        onDismiss={() => {
          setNotice(undefined);
        }}
      />
      {editorTarget ? (
        <DefinitionEditorPanel
          key={editorTarget.key}
          definition={editorTarget.definition}
          onClose={() => {
            setEditorTarget(undefined);
          }}
          onNotice={showNotice}
          onSaved={() =>
            refreshAfterRecurringDefinitionMutation(
              recurringDefinitions.refresh,
            )
          }
          open
          resolveReturnFocusTo={() => {
            const liveOpener = editorTarget.opener?.isConnected
              ? editorTarget.opener
              : editorTarget.definition
                ? document.querySelector<HTMLElement>(
                    `[data-recurring-definition-id="${editorTarget.definition.recurring_definition_id}"]`,
                  )
                : undefined;
            const target = liveOpener ?? newDefinitionButtonRef.current;
            if (target) {
              revealRecurringDefinitionActionRow(target);
            }
            return target ?? undefined;
          }}
        />
      ) : null}
    </section>
  );
};
