import { Plus } from "pixelarticons/react";
import { useState } from "react";

import type { RecurringDefinition } from "@/api";
import { PageHelp } from "@/components/page-help";
import { Toast, toastDurationMs } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell";
import {
  DefinitionEditorPanel,
  RecurringPageContent,
  refreshAfterRecurringDefinitionMutation,
  useRecurringDefinitionsResource,
} from "@/features/recurring";

interface Notice {
  readonly id: number;
  readonly message: string;
}

interface EditorTarget {
  readonly definition: RecurringDefinition | undefined;
  readonly key: string | number;
  readonly opener: HTMLElement | undefined;
}

export const RecurringPage = () => {
  const recurringDefinitions = useRecurringDefinitionsResource();
  const [notice, setNotice] = useState<Notice | undefined>();
  const [editorTarget, setEditorTarget] = useState<EditorTarget>();

  const showNotice = (message: string) => {
    setNotice((current) => ({
      id: (current?.id ?? 0) + 1,
      message,
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
            type="button"
            onClick={(event) =>
              setEditorTarget({
                definition: undefined,
                key: "new",
                opener: event.currentTarget,
              })
            }
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
          onEdit={(definition, opener) =>
            setEditorTarget({
              definition,
              key: definition.recurring_definition_id,
              opener,
            })
          }
          onNotice={showNotice}
          refresh={recurringDefinitions.refresh}
          snapshot={recurringDefinitions.snapshot}
        />
      </div>
      <Toast
        key={notice?.id ?? "empty"}
        className="text-[var(--color-money-in)]"
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
          onClose={() => setEditorTarget(undefined)}
          onNotice={showNotice}
          onSaved={() =>
            refreshAfterRecurringDefinitionMutation(
              recurringDefinitions.refresh,
            )
          }
          open
          returnFocusTo={editorTarget.opener}
        />
      ) : null}
    </section>
  );
};
