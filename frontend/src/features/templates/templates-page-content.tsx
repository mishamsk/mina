import {
  ArrowsHorizontal,
  Pencil,
  Play,
  Plus,
  Repeat,
  Trash,
} from "pixelarticons/react";
import { useEffect, useRef, useState } from "react";

import type { TransactionTemplate } from "@/api";
import {
  apiErrorDetails,
  apiErrorMessage,
  deleteTransactionTemplateById,
  fetchAllTransactionTemplates,
} from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ReferenceEntityDeleteDescription } from "@/components/reference-entity-delete-description";
import type { RowAction } from "@/components/row-actions";
import { focusWithoutTooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { captureTransactionEntryLaunchContext } from "@/features/ledger";
import { recurringDefinitionRecordsFromTemplate } from "@/features/recurring";
import { ReferenceTree, type ReferenceTreeRow } from "@/features/reference";
import {
  openNewRecurringDefinitionEditor,
  openTransactionEntryTemplate,
  removeTransactionTemplate,
} from "@/store";

import {
  refreshTransactionTemplates,
  useTransactionTemplatesResource,
} from "./use-transaction-templates-resource";

interface TemplateTreeLeaf extends TransactionTemplate {
  readonly is_hidden: false;
}

interface TemplateTreeGroup {
  readonly fqn: string;
  readonly is_hidden: false;
}

interface TemplatesPageContentProps {
  readonly onCreateTemplate: (opener: HTMLElement) => void;
  readonly onEditTemplate: (
    template: TransactionTemplate,
    opener: HTMLElement,
  ) => void;
  readonly onNotice: (message: string) => void;
  readonly onRestructurePath: (fqn: string, opener: HTMLElement) => void;
  readonly search: string;
}

type DeleteTarget = {
  readonly opener: HTMLElement;
  readonly template: TransactionTemplate;
};

interface FilteredTemplatesState {
  readonly errorMessage: string | undefined;
  readonly mutationVersion: number;
  readonly query: string;
  readonly retryVersion: number;
  readonly templates: readonly TransactionTemplate[] | undefined;
}

const visibleTemplatesFocusTarget = (
  fallback: HTMLElement | null,
): HTMLElement | null => {
  const searchField = document.getElementById("templates-search");
  if (searchField?.getClientRects().length) {
    return searchField;
  }
  const controlsTrigger = document.querySelector<HTMLElement>(
    "[data-mobile-table-controls-trigger]",
  );
  return controlsTrigger?.getClientRects().length ? controlsTrigger : fallback;
};

const templateGroups = (
  templates: readonly TransactionTemplate[],
): readonly TemplateTreeGroup[] => {
  const groups = new Set<string>();
  for (const template of templates) {
    const segments = template.fqn.split(":");
    for (let index = 1; index < segments.length; index += 1) {
      groups.add(segments.slice(0, index).join(":"));
    }
  }
  return [...groups].map((fqn) => ({ fqn, is_hidden: false }));
};

const templateSummary = (template: TransactionTemplate): string => {
  const records = template.records.filter((record) => !record.tombstoned_at);
  const accounts = records.filter(
    (record) => record.account_id !== null,
  ).length;
  const amounts = records.filter((record) => record.amount !== null).length;
  return `${records.length} ${records.length === 1 ? "record" : "records"} · ${accounts} ${accounts === 1 ? "account" : "accounts"} · ${amounts} ${amounts === 1 ? "amount" : "amounts"}`;
};

const TemplateEmptySprite = () => (
  <svg
    aria-hidden="true"
    className="size-12"
    data-testid="templates-empty-sprite"
    shapeRendering="crispEdges"
    viewBox="0 0 48 48"
  >
    <path
      d="M6 10h24v4h12v28H6z"
      fill="var(--color-class-adjustment-bright)"
      stroke="var(--border-ink)"
      strokeWidth="4"
    />
    <path d="M12 20h24v4H12zm0 8h16v4H12z" fill="var(--table-header)" />
    <path d="M32 28h4v4h-4z" fill="var(--color-class-income-bright)" />
  </svg>
);

export const TemplatesPageContent = ({
  onCreateTemplate,
  onEditTemplate,
  onNotice,
  onRestructurePath,
  search,
}: TemplatesPageContentProps) => {
  const normalizedSearch = search.trim();
  const templatesResource = useTransactionTemplatesResource(
    normalizedSearch === "",
  );
  const focusFallbackRef = useRef<HTMLDivElement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>();
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const filteredLoadGenerationRef = useRef(0);
  const [filteredRetryVersion, setFilteredRetryVersion] = useState(0);
  const [filteredState, setFilteredState] = useState<FilteredTemplatesState>({
    errorMessage: undefined,
    mutationVersion: 0,
    query: "",
    retryVersion: 0,
    templates: undefined,
  });
  const templates = templatesResource.snapshot?.templates ?? [];
  useEffect(() => {
    filteredLoadGenerationRef.current += 1;
    const generation = filteredLoadGenerationRef.current;
    if (!normalizedSearch) {
      return;
    }
    void fetchAllTransactionTemplates(normalizedSearch).then((result) => {
      if (filteredLoadGenerationRef.current !== generation) {
        return;
      }
      if (!result.data) {
        setFilteredState((current) => ({
          errorMessage: apiErrorDetails(
            result.error,
            "Templates could not be searched.",
          ),
          mutationVersion: current.mutationVersion,
          query: normalizedSearch,
          retryVersion: filteredRetryVersion,
          templates: current.templates,
        }));
        return;
      }
      const focusedElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : undefined;
      setFilteredState({
        errorMessage: undefined,
        mutationVersion: templatesResource.mutationVersion,
        query: normalizedSearch,
        retryVersion: filteredRetryVersion,
        templates: result.data.transaction_templates,
      });
      window.requestAnimationFrame(() => {
        if (
          focusedElement?.isConnected ||
          (document.activeElement !== document.body &&
            document.activeElement !== document.documentElement)
        ) {
          return;
        }
        focusWithoutTooltip(
          visibleTemplatesFocusTarget(focusFallbackRef.current),
          { preventScroll: true },
        );
      });
    });
  }, [
    filteredRetryVersion,
    normalizedSearch,
    templatesResource.mutationVersion,
  ]);
  const filteredStateMatchesQuery = filteredState.query === normalizedSearch;
  const filteredRequestIsCurrent =
    filteredStateMatchesQuery &&
    filteredState.retryVersion === filteredRetryVersion;
  const filteredStateIsCurrent =
    filteredRequestIsCurrent &&
    filteredState.mutationVersion === templatesResource.mutationVersion;
  const filteredRequestFailed =
    filteredRequestIsCurrent && filteredState.errorMessage !== undefined;
  const filteredRowsAreCurrent =
    filteredState.mutationVersion === templatesResource.mutationVersion;
  const displayedTemplates = normalizedSearch
    ? (filteredState.templates ?? [])
    : templates;
  const leaves: readonly TemplateTreeLeaf[] = displayedTemplates.map(
    (template) => ({
      ...template,
      is_hidden: false,
    }),
  );
  const groups = templateGroups(displayedTemplates);

  const restoreFocus = (opener: HTMLElement | undefined) => {
    window.requestAnimationFrame(() => {
      focusWithoutTooltip(
        opener?.isConnected && opener.getClientRects().length
          ? opener
          : visibleTemplatesFocusTarget(focusFallbackRef.current),
        { preventScroll: true },
      );
    });
  };

  const closeDeleteDialog = () => {
    if (deleting) {
      return;
    }
    const opener = deleteTarget?.opener;
    setDeleteTarget(undefined);
    setDeleteErrorMessage(undefined);
    restoreFocus(opener);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) {
      return;
    }
    setDeleting(true);
    setDeleteErrorMessage(undefined);
    const result = await deleteTransactionTemplateById(
      deleteTarget.template.transaction_template_id,
    );
    if (result.data !== undefined || !result.error) {
      removeTransactionTemplate(deleteTarget.template.transaction_template_id);
      setDeleteTarget(undefined);
      onNotice("Template deleted.");
      setDeleting(false);
      void refreshTransactionTemplates();
      const searchField = document.getElementById("templates-search");
      restoreFocus(
        searchField instanceof HTMLElement ? searchField : undefined,
      );
      return;
    }
    setDeleting(false);
    setDeleteErrorMessage(
      apiErrorMessage(result.error, "Template could not be deleted."),
    );
  };

  const renderActions = (
    row: ReferenceTreeRow<TemplateTreeLeaf, TemplateTreeGroup>,
  ): readonly RowAction[] => {
    const moveAction: RowAction = {
      icon: <ArrowsHorizontal aria-hidden="true" />,
      label: "Move or rename",
      onSelect: (opener) => {
        opener.blur();
        onRestructurePath(row.fqn, opener);
      },
    };
    if (!row.leaf) {
      return [moveAction];
    }
    return [
      {
        icon: <Play aria-hidden="true" />,
        label: "Use template",
        onSelect: (opener) => {
          focusWithoutTooltip(opener, { preventScroll: true });
          openTransactionEntryTemplate(
            row.leaf!,
            captureTransactionEntryLaunchContext(),
          );
        },
      },
      {
        icon: <Pencil aria-hidden="true" />,
        label: "Edit template",
        onSelect: (opener) => {
          onEditTemplate(row.leaf!, opener);
        },
      },
      {
        icon: <Repeat aria-hidden="true" />,
        label: "Create recurring",
        onSelect: (opener) => {
          openNewRecurringDefinitionEditor(
            opener.closest<HTMLElement>("tr") ?? opener,
            recurringDefinitionRecordsFromTemplate(row.leaf!),
          );
        },
      },
      moveAction,
      {
        icon: <Trash aria-hidden="true" />,
        label: "Delete template",
        onSelect: (opener) => {
          setDeleteErrorMessage(undefined);
          setDeleteTarget({ opener, template: row.leaf! });
        },
      },
    ];
  };

  const refreshErrorMessage = normalizedSearch
    ? filteredRequestIsCurrent && filteredState.templates !== undefined
      ? filteredState.errorMessage
      : undefined
    : templatesResource.snapshot
      ? templatesResource.errorMessage
      : undefined;
  const loadErrorMessage = normalizedSearch
    ? filteredRequestIsCurrent && filteredState.templates === undefined
      ? filteredState.errorMessage
      : undefined
    : templatesResource.snapshot
      ? undefined
      : templatesResource.errorMessage;
  const retryTemplates = () => {
    focusWithoutTooltip(visibleTemplatesFocusTarget(focusFallbackRef.current), {
      preventScroll: true,
    });
    if (normalizedSearch) {
      setFilteredRetryVersion((current) => current + 1);
      return;
    }
    void refreshTransactionTemplates();
  };

  return (
    <div
      ref={focusFallbackRef}
      className="flex h-full min-h-0 flex-col gap-3"
      tabIndex={-1}
    >
      {refreshErrorMessage ? (
        <div
          className="border-destructive bg-card flex flex-wrap items-center justify-between gap-3 border-2 p-3 shadow-[var(--shadow-pixel)]"
          role="alert"
        >
          <div>
            <p className="text-destructive font-semibold">
              Templates could not be refreshed.
            </p>
            <p className="text-muted-foreground text-sm">
              Showing the last loaded template tree.
            </p>
            <details className="text-muted-foreground mt-3 text-sm">
              <summary className="text-foreground cursor-pointer">
                API error
              </summary>
              <pre className="mt-2 overflow-auto font-mono text-xs whitespace-pre-wrap">
                {refreshErrorMessage}
              </pre>
            </details>
          </div>
          <Button type="button" variant="outline" onClick={retryTemplates}>
            Retry
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <ReferenceTree
          actionsColumnWidthClassName="sm:[--reference-tree-actions-width:15.25rem]"
          badgeHeader="Defaults"
          emptyDescription="Reusable transaction shapes will appear here once templates exist."
          emptyFilteredDescription="No templates match the current full-path search."
          emptySprite={<TemplateEmptySprite />}
          emptyTitle="No templates"
          emptyAction={
            <Button
              type="button"
              onClick={(event) => {
                onCreateTemplate(event.currentTarget);
              }}
            >
              <Plus aria-hidden="true" />
              New template
            </Button>
          }
          errorMessage={loadErrorMessage}
          filtered={normalizedSearch !== ""}
          groups={groups}
          indicatorSlots={["featured", "hidden"]}
          leaves={
            normalizedSearch
              ? filteredState.templates !== undefined
                ? leaves
                : undefined
              : templatesResource.snapshot
                ? leaves
                : undefined
          }
          loading={
            normalizedSearch
              ? !filteredStateIsCurrent && !filteredRequestFailed
              : templatesResource.loading
          }
          loadErrorTitle="Templates could not be loaded."
          onRetry={retryTemplates}
          onRowClick={
            normalizedSearch && !filteredRowsAreCurrent
              ? undefined
              : (row, opener) => {
                  if (row.leaf) {
                    onEditTemplate(row.leaf, opener);
                  }
                }
          }
          renderActions={
            normalizedSearch && !filteredRowsAreCurrent
              ? undefined
              : renderActions
          }
          renderBadge={(row) =>
            row.leaf ? (
              <span className="font-mono text-xs">
                {templateSummary(row.leaf)}
              </span>
            ) : null
          }
          rowTestId="templates-tree-row"
          rowActivationLabel={(row) => `Edit template ${row.fqn}`}
        />
      </div>
      <ConfirmationDialog
        confirmIcon={<Trash aria-hidden="true" />}
        confirmLabel="Delete template"
        errorMessage={deleteErrorMessage}
        open={deleteTarget !== undefined}
        pending={deleting}
        pendingLabel="Deleting"
        title="Delete template"
        onConfirm={() => {
          void confirmDelete();
        }}
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteDialog();
          }
        }}
      >
        {deleteTarget ? (
          <ReferenceEntityDeleteDescription
            name={deleteTarget.template.fqn}
            noun="template"
          />
        ) : null}
      </ConfirmationDialog>
    </div>
  );
};
