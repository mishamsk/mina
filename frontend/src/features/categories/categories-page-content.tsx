import { Eye, EyeOff, MagicEdit } from "pixelarticons/react";

import type { Category, GroupState } from "@/api";
import {
  isNetworkFailure,
  setLedgerCategoryHiddenByPath,
  updateLedgerCategory,
} from "@/api";
import type { RowAction } from "@/components/row-actions";
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
  readonly onEditCategory: (category: Category, opener: HTMLElement) => void;
  readonly onNotice: (message: string, tone?: "error" | "success") => void;
  readonly onRestructurePath: (fqn: string, opener: HTMLElement) => void;
  readonly search: string;
}

const apiErrorMessage = (error: unknown, fallback: string): string => {
  if (isNetworkFailure(error)) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "object" &&
    error.error !== null &&
    "message" in error.error &&
    typeof error.error.message === "string"
  ) {
    return error.error.message;
  }
  return fallback;
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
  onEditCategory,
  onNotice,
  onRestructurePath,
  search,
}: CategoriesPageContentProps) => {
  const showQuickToggleError = (error: unknown, fallback: string) => {
    onNotice(apiErrorMessage(error, fallback), "error");
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
        },
        ...moveAction(row),
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
          onRowClick={(row, opener) => {
            if (row.leaf) {
              onEditCategory(row.leaf, opener);
            }
          }}
          renderActions={renderActions}
          renderBadge={renderCategoryBadge}
          rowActivationLabel={(row) => `Edit category ${row.fqn}`}
          rowTestId="categories-tree-row"
          search={search}
        />
      </div>
    </div>
  );
};
