import { Eye, EyeOff, MagicEdit, Trash } from "pixelarticons/react";
import { useState } from "react";
import { useNavigate } from "react-router";

import type { Category, GroupState } from "@/api";
import {
  apiErrorMessage,
  deleteLedgerCategoryById,
  setLedgerCategoryHiddenByPath,
  updateLedgerCategory,
} from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ReferenceEntityDeleteDescription } from "@/components/reference-entity-delete-description";
import type { RowAction } from "@/components/row-actions";
import { focusWithoutTooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import type { CategoriesPageSnapshot } from "@/store";

import {
  readReferenceSearchState,
  ReferenceTree,
  type ReferenceTreeRow,
} from "../reference";
import { IntentBadge } from "./intent-badge";
import {
  refreshCategoriesAfterMutation,
  refreshCategoriesPage,
} from "./use-categories-resource";

export const readCategoriesSearchState = readReferenceSearchState;

interface CategoriesPageContentProps {
  readonly categoriesPage: {
    readonly errorMessage: string | undefined;
    readonly loading: boolean;
    readonly snapshot: CategoriesPageSnapshot | undefined;
  };
  readonly includeHidden: boolean;
  readonly onCategoryDeleted: (categoryId: number) => void;
  readonly onEditCategory: (category: Category, opener: HTMLElement) => void;
  readonly onNotice: (message: string, tone?: "error" | "success") => void;
  readonly onRestructurePath: (fqn: string, opener: HTMLElement) => void;
  readonly search: string;
}

type CategoryDeleteTarget = {
  readonly category: Category;
  readonly opener: HTMLElement;
};

const renderCategoryBadge = (row: ReferenceTreeRow<Category, GroupState>) => {
  if (!row.leaf) {
    return null;
  }
  return <IntentBadge economicIntent={row.leaf.economic_intent} />;
};

export const CategoriesPageContent = ({
  categoriesPage,
  includeHidden,
  onCategoryDeleted,
  onEditCategory,
  onNotice,
  onRestructurePath,
  search,
}: CategoriesPageContentProps) => {
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<
    CategoryDeleteTarget | undefined
  >();
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
    const result = await deleteLedgerCategoryById(
      deleteTarget.category.category_id,
    );
    if (result.data !== undefined || !result.error) {
      await refreshCategoriesAfterMutation();
      onCategoryDeleted(deleteTarget.category.category_id);
      onNotice("Category deleted.");
      setDeleting(false);
      setDeleteTarget(undefined);
      window.requestAnimationFrame(() => {
        const searchField = document.getElementById("categories-search");
        if (searchField instanceof HTMLElement && searchField.isConnected) {
          focusWithoutTooltip(searchField, { preventScroll: true });
        }
      });
      return;
    }
    setDeleting(false);
    setDeleteErrorMessage(
      apiErrorMessage(result.error, "Category could not be deleted."),
    );
  };

  const toggleCategoryHidden = async (category: Category) => {
    const result = await updateLedgerCategory(category.category_id, {
      is_hidden: !category.is_hidden,
    });
    if (!result.data) {
      showQuickToggleError(
        result.error,
        "Category hidden state was not saved.",
      );
      return;
    }
    const refreshed = await refreshCategoriesAfterMutation();
    if (!refreshed) {
      return;
    }
    onNotice(result.data.is_hidden ? "Category hidden." : "Category unhidden.");
  };

  const toggleGroupHidden = async (group: GroupState) => {
    const result = await setLedgerCategoryHiddenByPath({
      is_hidden: !group.is_hidden,
      path_fqn: group.fqn,
    });
    if (!result.data) {
      showQuickToggleError(
        result.error,
        "Category group hidden state was not saved.",
      );
      return;
    }
    const refreshed = await refreshCategoriesAfterMutation({ bulk: true });
    if (!refreshed) {
      return;
    }
    onNotice(
      group.is_hidden ? "Category group unhidden." : "Category group hidden.",
    );
  };

  const moveAction = (
    row: ReferenceTreeRow<Category, GroupState>,
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
    row: ReferenceTreeRow<Category, GroupState>,
  ): readonly RowAction[] => {
    if (row.leaf) {
      return [
        {
          icon: <MagicEdit aria-hidden="true" />,
          label: "Edit category",
          onSelect: (opener: HTMLElement) => {
            onEditCategory(row.leaf as Category, opener);
          },
        },
        {
          icon: row.leaf.is_hidden ? (
            <EyeOff aria-hidden="true" />
          ) : (
            <Eye aria-hidden="true" />
          ),
          kind: "toggle",
          label: row.leaf.is_hidden ? "Unhide category" : "Hide category",
          onToggle: () => {
            void toggleCategoryHidden(row.leaf as Category);
          },
          pressed: row.leaf.is_hidden,
          slot: "hidden",
        },
        ...moveAction(row),
        {
          disabled: row.leaf.deletable !== true,
          disabledReason: "Category has active dependent records.",
          icon: <Trash aria-hidden="true" />,
          label: "Delete category",
          onSelect: (opener: HTMLElement) => {
            setDeleteErrorMessage(undefined);
            setDeleteTarget({ category: row.leaf as Category, opener });
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
          onToggle: () => {
            void toggleGroupHidden(row.group as GroupState);
          },
          pressed: row.group.is_hidden,
          slot: "hidden",
        },
        ...moveAction(row),
      ];
    }

    return moveAction(row);
  };

  const refreshErrorMessage = categoriesPage.snapshot
    ? categoriesPage.errorMessage
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {refreshErrorMessage ? (
        <div
          className="border-destructive bg-card flex flex-wrap items-center justify-between gap-3 border-2 p-3 shadow-[var(--shadow-pixel)]"
          role="alert"
        >
          <div>
            <p className="text-destructive font-semibold">
              Categories could not be refreshed.
            </p>
            <p className="text-muted-foreground font-body text-sm">
              Showing the last loaded category tree.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void refreshCategoriesPage();
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <ReferenceTree
          badgeHeader="Intent"
          emptyDescription="The category tree will show category paths, economic intent, and hidden state once categories exist."
          emptyFilteredDescription="No categories match the current search and filters. The tree shows category paths, economic intent, and hidden state."
          emptyTitle="No categories"
          errorMessage={
            categoriesPage.snapshot ? undefined : categoriesPage.errorMessage
          }
          groups={categoriesPage.snapshot?.groups}
          includeHidden={includeHidden}
          leaves={categoriesPage.snapshot?.categories}
          loading={categoriesPage.loading}
          loadErrorTitle="Categories could not be loaded."
          onRetry={() => {
            void refreshCategoriesPage();
          }}
          onRowClick={(row) => {
            if (row.leaf) {
              void navigate(`/categories/${row.leaf.category_id}`);
            }
          }}
          indicatorSlots={["featured", "hidden"]}
          renderActions={renderActions}
          renderBadge={renderCategoryBadge}
          rowActivationLabel={(row) => `Open category ${row.fqn}`}
          rowTestId="categories-tree-row"
          search={search}
        />
      </div>
      <ConfirmationDialog
        confirmIcon={<Trash aria-hidden="true" />}
        confirmLabel="Delete category"
        errorMessage={deleteErrorMessage}
        open={deleteTarget !== undefined}
        pending={deleting}
        pendingLabel="Deleting"
        title="Delete category"
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
            name={deleteTarget.category.fqn}
            noun="category"
          />
        ) : null}
      </ConfirmationDialog>
    </div>
  );
};
