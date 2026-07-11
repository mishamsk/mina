import { Eye, EyeOff, MagicEdit, Trash } from "pixelarticons/react";
import { useRef, useState } from "react";

import type { GroupState, Tag } from "@/api";
import {
  apiErrorMessage,
  deleteLedgerTagById,
  setLedgerTagHiddenByPath,
  updateLedgerTag,
} from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import type { RowAction } from "@/components/row-actions";
import { focusWithoutTooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import type { TagsPageSnapshot } from "@/store";

import {
  readReferenceSearchState,
  ReferenceTree,
  type ReferenceTreeRow,
} from "../reference";
import { refreshTagsAfterMutation, refreshTagsPage } from "./use-tags-resource";

export const readTagsSearchState = readReferenceSearchState;

interface TagsPageContentProps {
  readonly includeHidden: boolean;
  readonly onEditTag: (tag: Tag, opener: HTMLElement) => void;
  readonly onNotice: (message: string, tone?: "error" | "success") => void;
  readonly onRestructurePath: (fqn: string, opener: HTMLElement) => void;
  readonly search: string;
  readonly tagsPage: {
    readonly errorMessage: string | undefined;
    readonly loading: boolean;
    readonly snapshot: TagsPageSnapshot | undefined;
  };
}

type TagDeleteTarget = {
  readonly opener: HTMLElement;
  readonly tag: Tag;
};

export const TagsPageContent = ({
  includeHidden,
  onEditTag,
  onNotice,
  onRestructurePath,
  search,
  tagsPage,
}: TagsPageContentProps) => {
  const focusFallbackRef = useRef<HTMLDivElement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TagDeleteTarget>();
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<
    string | undefined
  >();
  const [deleting, setDeleting] = useState(false);

  const showQuickToggleError = (error: unknown, fallback: string) => {
    onNotice(apiErrorMessage(error, fallback), "error");
  };

  const closeDeleteDialog = () => {
    if (deleting) {
      return;
    }
    const opener = deleteTarget?.opener;
    setDeleteTarget(undefined);
    setDeleteErrorMessage(undefined);
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) {
        focusWithoutTooltip(opener, { preventScroll: true });
      }
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) {
      return;
    }
    setDeleting(true);
    setDeleteErrorMessage(undefined);
    const result = await deleteLedgerTagById(deleteTarget.tag.tag_id);
    if (result.data !== undefined || !result.error) {
      await refreshTagsAfterMutation();
      onNotice("Tag deleted.");
      setDeleting(false);
      setDeleteTarget(undefined);
      window.requestAnimationFrame(() => {
        const searchField = document.getElementById("tags-search");
        if (searchField instanceof HTMLElement && searchField.isConnected) {
          focusWithoutTooltip(searchField, { preventScroll: true });
        }
      });
      return;
    }
    setDeleting(false);
    setDeleteErrorMessage(
      apiErrorMessage(result.error, "Tag could not be deleted."),
    );
  };

  const restoreToggleFocus = (opener: HTMLElement) => {
    window.requestAnimationFrame(() => {
      focusWithoutTooltip(
        opener.isConnected ? opener : focusFallbackRef.current,
        {
          preventScroll: true,
        },
      );
    });
  };

  const toggleTagHidden = async (tag: Tag, opener: HTMLElement) => {
    const result = await updateLedgerTag(tag.tag_id, {
      is_hidden: !tag.is_hidden,
    });
    if (!result.data) {
      showQuickToggleError(result.error, "Tag hidden state was not saved.");
      return;
    }
    const refreshed = await refreshTagsAfterMutation();
    if (!refreshed) {
      return;
    }
    restoreToggleFocus(opener);
    onNotice(result.data.is_hidden ? "Tag hidden." : "Tag unhidden.");
  };

  const toggleGroupHidden = async (group: GroupState, opener: HTMLElement) => {
    const result = await setLedgerTagHiddenByPath({
      is_hidden: !group.is_hidden,
      path_fqn: group.fqn,
    });
    if (!result.data) {
      showQuickToggleError(
        result.error,
        "Tag group hidden state was not saved.",
      );
      return;
    }
    const refreshed = await refreshTagsAfterMutation();
    if (!refreshed) {
      return;
    }
    restoreToggleFocus(opener);
    onNotice(group.is_hidden ? "Tag group unhidden." : "Tag group hidden.");
  };

  const moveAction = (
    row: ReferenceTreeRow<Tag, GroupState>,
  ): readonly RowAction[] => [
    {
      icon: <MagicEdit aria-hidden="true" />,
      label: "Move or rename",
      onSelect: (opener: HTMLElement) => {
        opener.blur();
        onRestructurePath(row.fqn, opener);
      },
    },
  ];

  const renderActions = (
    row: ReferenceTreeRow<Tag, GroupState>,
  ): readonly RowAction[] => {
    if (row.leaf) {
      return [
        {
          icon: row.leaf.is_hidden ? (
            <EyeOff aria-hidden="true" />
          ) : (
            <Eye aria-hidden="true" />
          ),
          kind: "toggle",
          label: row.leaf.is_hidden ? "Unhide tag" : "Hide tag",
          onToggle: (opener: HTMLElement) => {
            void toggleTagHidden(row.leaf as Tag, opener);
          },
          pressed: row.leaf.is_hidden,
        },
        ...moveAction(row),
        {
          disabled: row.leaf.deletable !== true,
          disabledReason: "Tag has active dependent records.",
          icon: <Trash aria-hidden="true" />,
          label: "Delete tag",
          onSelect: (opener: HTMLElement) => {
            setDeleteErrorMessage(undefined);
            setDeleteTarget({ opener, tag: row.leaf as Tag });
          },
        },
      ];
    }

    if (row.group) {
      return [
        {
          icon: row.group.is_hidden ? (
            <EyeOff aria-hidden="true" />
          ) : (
            <Eye aria-hidden="true" />
          ),
          kind: "toggle",
          label: row.group.is_hidden ? "Unhide group" : "Hide group",
          onToggle: (opener: HTMLElement) => {
            void toggleGroupHidden(row.group as GroupState, opener);
          },
          pressed: row.group.is_hidden,
        },
        ...moveAction(row),
      ];
    }

    return moveAction(row);
  };

  const refreshErrorMessage = tagsPage.snapshot
    ? tagsPage.errorMessage
    : undefined;

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
              Tags could not be refreshed.
            </p>
            <p className="text-muted-foreground font-body text-sm">
              Showing the last loaded tag tree.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void refreshTagsPage();
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <ReferenceTree
          emptyDescription="The tag tree will show tag paths and hidden state once tags exist."
          emptyFilteredDescription="No tags match the current search and filters. The tree shows tag paths and hidden state."
          emptyTitle="No tags"
          errorMessage={tagsPage.snapshot ? undefined : tagsPage.errorMessage}
          groups={tagsPage.snapshot?.groups}
          includeHidden={includeHidden}
          leaves={tagsPage.snapshot?.tags}
          loading={tagsPage.loading}
          loadErrorTitle="Tags could not be loaded."
          onRetry={() => {
            void refreshTagsPage();
          }}
          onRowClick={(row, opener) => {
            if (row.leaf) {
              onEditTag(row.leaf, opener);
            }
          }}
          renderActions={renderActions}
          rowActivationLabel={(row) => `Edit tag ${row.fqn}`}
          rowTestId="tags-tree-row"
          search={search}
        />
      </div>
      <ConfirmationDialog
        confirmIcon={<Trash aria-hidden="true" />}
        confirmLabel="Delete tag"
        errorMessage={deleteErrorMessage}
        open={deleteTarget !== undefined}
        pending={deleting}
        pendingLabel="Deleting"
        title="Delete tag"
        onConfirm={() => {
          void confirmDelete();
        }}
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteDialog();
          }
        }}
      >
        <p className="flex flex-wrap items-center gap-1">
          <span>Delete</span>
          <span className="text-foreground font-mono break-all">
            {deleteTarget?.tag.fqn}
          </span>
          <span>?</span>
        </p>
        <p>
          This tombstones the tag and removes it from default tag lists and
          pickers.
        </p>
      </ConfirmationDialog>
    </div>
  );
};
