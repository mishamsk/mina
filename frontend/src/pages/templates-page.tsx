import { Plus } from "pixelarticons/react";
import { useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { apiErrorMessage, restructureLedgerTransactionTemplates } from "@/api";
import { PageHelp } from "@/components/page-help";
import { Toast, toastDurationMs } from "@/components/toast";
import { focusWithoutTooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell";
import {
  RestructureDialog,
  type RestructureSubmitInput,
} from "@/features/hierarchy";
import {
  readReferenceSearchState,
  ReferenceToolbar,
} from "@/features/reference";
import {
  refreshTransactionTemplates,
  TemplatesPageContent,
} from "@/features/templates";
import {
  openEditTemplateEditor,
  openNewTemplateEditor,
  restructureTransactionTemplates,
  useTemplateEditorView,
} from "@/store";

interface Notice {
  readonly id: number;
  readonly message: string;
}

const movedTemplateMessage = (count: number): string =>
  `Moved ${count} ${count === 1 ? "template" : "templates"}.`;

export const TemplatesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [restructurePath, setRestructurePath] = useState<string>();
  const [restructureError, setRestructureError] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const restructureOpenerRef = useRef<HTMLElement | null>(null);
  const templateEditor = useTemplateEditorView();
  const { search } = readReferenceSearchState(searchParams);

  const showNotice = (message: string) => {
    setNotice((current) => ({
      id: (current?.id ?? 0) + 1,
      message,
    }));
  };

  const restoreRestructureFocus = () => {
    const opener = restructureOpenerRef.current;
    restructureOpenerRef.current = null;
    const searchField = document.getElementById("templates-search");
    window.requestAnimationFrame(() => {
      focusWithoutTooltip(
        opener?.isConnected
          ? opener
          : searchField instanceof HTMLElement
            ? searchField
            : null,
        { preventScroll: true },
      );
    });
  };

  const closeRestructureDialog = (restoreFocus = true) => {
    setRestructurePath(undefined);
    setRestructureError(undefined);
    if (restoreFocus) {
      restoreRestructureFocus();
    }
  };

  const submitRestructure = async ({
    fromFqn,
    toFqn,
  }: RestructureSubmitInput) => {
    setRestructureError(undefined);
    const result = await restructureLedgerTransactionTemplates({
      from_fqn: fromFqn,
      to_fqn: toFqn,
    });
    if (result.data) {
      restructureTransactionTemplates(fromFqn, toFqn);
      closeRestructureDialog();
      showNotice(movedTemplateMessage(result.data.moved_count));
      void refreshTransactionTemplates();
      return;
    }
    setRestructureError(
      apiErrorMessage(result.error, "Template path could not be moved."),
    );
  };

  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6"
      aria-labelledby="templates-title"
    >
      <PageHeader
        actions={
          <Button
            type="button"
            data-template-editor-restore-target
            onClick={(event) => {
              openNewTemplateEditor(event.currentTarget);
            }}
          >
            <Plus aria-hidden="true" />
            New template
          </Button>
        }
        title="Templates"
        titleId="templates-title"
        eyebrow="Reference data"
        help={
          <PageHelp label="Templates help">
            Reusable, date-free record defaults for starting transaction entry.
          </PageHelp>
        }
        toolbar={
          <ReferenceToolbar
            includeHidden={false}
            search={search}
            searchInputId="templates-search"
            searchPlaceholder="Full template path"
            setSearchParams={setSearchParams}
            showIncludeHiddenToggle={false}
          />
        }
      />
      <div className="min-h-0 flex-1">
        <TemplatesPageContent
          onCreateTemplate={openNewTemplateEditor}
          onEditTemplate={(template, opener) => {
            openEditTemplateEditor(template, opener);
          }}
          onNotice={showNotice}
          onRestructurePath={(fqn, opener) => {
            restructureOpenerRef.current = opener;
            setRestructureError(undefined);
            setRestructurePath(fqn);
          }}
          search={search}
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
      {restructurePath ? (
        <RestructureDialog
          key={restructurePath}
          entityLabel="Template path"
          errorMessage={restructureError}
          escapeDisabled={templateEditor.open}
          fromFqn={restructurePath}
          hint="Rename this template path or move its full subtree to an unoccupied destination."
          onClearError={() => {
            setRestructureError(undefined);
          }}
          onClose={() => {
            closeRestructureDialog();
          }}
          onSubmit={submitRestructure}
        />
      ) : null}
    </section>
  );
};
