import { Plus } from "pixelarticons/react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import {
  apiErrorMessage,
  type Category,
  type CategoryEconomicIntent,
  fetchCategoriesForManagement,
  restructureLedgerCategories,
} from "@/api";
import { PageHelp } from "@/components/page-help";
import { Toast, toastDurationMs } from "@/components/toast";
import { focusWithoutTooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/features/app-shell";
import {
  CategoriesPageContent,
  CategoriesSidePanel,
  readCategoriesSearchState,
  refreshCategoriesAfterMutation,
  useCategoriesResource,
} from "@/features/categories";
import {
  RestructureDialog,
  type RestructureSubmitInput,
} from "@/features/hierarchy";
import { ReferenceToolbar } from "@/features/reference";

interface Notice {
  readonly id: number;
  readonly message: string;
  readonly tone: "error" | "success";
}

const movedCategoryMessage = (count: number): string =>
  `Moved ${count} ${count === 1 ? "category" : "categories"}.`;

const readCategoryEconomicIntent = (
  searchParams: URLSearchParams,
): CategoryEconomicIntent | undefined => {
  const economicIntent = searchParams.get("economic_intent");
  return economicIntent === "income" || economicIntent === "expense"
    ? economicIntent
    : undefined;
};

export const CategoriesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const economicIntent = readCategoryEconomicIntent(searchParams);
  const categoriesPage = useCategoriesResource(economicIntent);
  const [panelMode, setPanelMode] = useState<"create" | "edit" | undefined>();
  const [selectedCategory, setSelectedCategory] = useState<
    Category | undefined
  >();
  const [restructurePath, setRestructurePath] = useState<string | undefined>();
  const [restructureError, setRestructureError] = useState<
    string | undefined
  >();
  const [notice, setNotice] = useState<Notice | undefined>();
  const createCategoryButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelOpenerRef = useRef<HTMLElement | null>(null);
  const restructureOpenerRef = useRef<HTMLElement | null>(null);
  const { includeHidden, search } = readCategoriesSearchState(searchParams);
  const categoriesSnapshot = categoriesPage.snapshot;
  const selectedCategoryId = selectedCategory?.category_id;
  const selectedCategoryEconomicIntent = selectedCategory?.economic_intent;
  const refreshedSelectedCategory = categoriesSnapshot?.categories.find(
    (category) => category.category_id === selectedCategoryId,
  );
  const selectedCategoryForEditor =
    selectedCategory && refreshedSelectedCategory
      ? {
          ...selectedCategory,
          deletable: refreshedSelectedCategory.deletable,
        }
      : selectedCategory;

  useEffect(() => {
    if (
      selectedCategoryId === undefined ||
      selectedCategoryEconomicIntent === undefined ||
      refreshedSelectedCategory ||
      !categoriesSnapshot
    ) {
      return;
    }

    let current = true;
    void fetchCategoriesForManagement(selectedCategoryEconomicIntent).then(
      (result) => {
        const refreshedCategory = result.data?.categories.find(
          (category) => category.category_id === selectedCategoryId,
        );
        if (!current || !refreshedCategory) {
          return;
        }
        setSelectedCategory((category) =>
          category?.category_id === refreshedCategory.category_id
            ? { ...category, deletable: refreshedCategory.deletable }
            : category,
        );
      },
    );

    return () => {
      current = false;
    };
  }, [
    categoriesSnapshot,
    refreshedSelectedCategory,
    selectedCategoryEconomicIntent,
    selectedCategoryId,
  ]);

  const setEconomicIntent = (value: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === "income" || value === "expense") {
        next.set("economic_intent", value);
      } else {
        next.delete("economic_intent");
      }
      return next;
    });
  };

  const showNotice = (message: string, tone: Notice["tone"] = "success") => {
    setNotice((current) => ({
      id: (current?.id ?? 0) + 1,
      message,
      tone,
    }));
  };

  const restorePanelOpenerFocus = () => {
    const opener = panelOpenerRef.current;
    panelOpenerRef.current = null;
    const target = opener?.isConnected
      ? opener
      : createCategoryButtonRef.current;
    if (target) {
      window.requestAnimationFrame(() => {
        target.focus({ preventScroll: true });
      });
    }
  };

  const openCreatePanel = (opener: HTMLElement) => {
    setRestructurePath(undefined);
    setRestructureError(undefined);
    restructureOpenerRef.current = null;
    panelOpenerRef.current = opener;
    setSelectedCategory(undefined);
    setPanelMode("create");
  };

  const openEditPanel = (category: Category, opener: HTMLElement) => {
    setRestructurePath(undefined);
    setRestructureError(undefined);
    restructureOpenerRef.current = null;
    panelOpenerRef.current = opener;
    setSelectedCategory(category);
    setPanelMode("edit");
  };

  const closePanel = () => {
    setPanelMode(undefined);
    setSelectedCategory(undefined);
    restorePanelOpenerFocus();
  };

  const closeDeletedCategoryEditor = (categoryId: number) => {
    if (panelMode === "edit" && selectedCategory?.category_id === categoryId) {
      closePanel();
    }
  };

  const openRestructureDialog = (fqn: string, opener: HTMLElement) => {
    setPanelMode(undefined);
    setSelectedCategory(undefined);
    panelOpenerRef.current = null;
    restructureOpenerRef.current = opener;
    setRestructureError(undefined);
    setRestructurePath(fqn);
  };

  const restoreRestructureOpenerFocus = () => {
    const opener = restructureOpenerRef.current;
    restructureOpenerRef.current = null;
    const target = opener?.isConnected
      ? opener
      : createCategoryButtonRef.current;
    if (target) {
      window.requestAnimationFrame(() => {
        focusWithoutTooltip(target, { preventScroll: true });
      });
    }
  };

  const closeRestructureDialog = ({
    restoreFocus = true,
  }: { readonly restoreFocus?: boolean } = {}) => {
    setRestructurePath(undefined);
    setRestructureError(undefined);
    if (restoreFocus) {
      restoreRestructureOpenerFocus();
    }
  };

  const submitRestructure = async ({
    fromFqn,
    toFqn,
  }: RestructureSubmitInput) => {
    setRestructureError(undefined);
    const result = await restructureLedgerCategories({
      from_fqn: fromFqn,
      to_fqn: toFqn,
    });

    if (result.data) {
      closeRestructureDialog({ restoreFocus: false });
      const refreshed = await refreshCategoriesAfterMutation({ bulk: true });
      if (refreshed) {
        showNotice(movedCategoryMessage(result.data.moved_count));
      }
      restoreRestructureOpenerFocus();
      return;
    }

    setRestructureError(
      apiErrorMessage(result.error, "Category path could not be moved."),
    );
  };

  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6"
      aria-labelledby="categories-title"
    >
      <PageHeader
        title="Categories"
        titleId="categories-title"
        eyebrow="Reference data"
        help={
          <PageHelp label="Categories help">
            Category paths classify journal records by economic intent for
            transaction display and reporting.
          </PageHelp>
        }
        actions={
          <Button
            ref={createCategoryButtonRef}
            type="button"
            onClick={(event) => {
              openCreatePanel(event.currentTarget);
            }}
          >
            <Plus aria-hidden="true" />
            New category
          </Button>
        }
        toolbar={
          <ReferenceToolbar
            extraControls={
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="categories-economic-intent"
                  className="font-heading text-xs font-semibold text-[var(--frame-muted)] uppercase"
                >
                  Economic intent
                </label>
                <Select
                  value={economicIntent ?? "all"}
                  onValueChange={setEconomicIntent}
                >
                  <SelectTrigger
                    id="categories-economic-intent"
                    className="min-w-32"
                    size="compact"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            }
            includeHidden={includeHidden}
            search={search}
            searchInputId="categories-search"
            searchPlaceholder="Full category path"
            setSearchParams={setSearchParams}
            toggleLabel="Include hidden"
            toggleOffTooltip="Include hidden categories"
            toggleOnTooltip="Hide hidden categories"
          />
        }
      />

      <div className="min-h-0 flex-1">
        <CategoriesPageContent
          categoriesPage={categoriesPage}
          economicIntent={economicIntent}
          includeHidden={includeHidden}
          onCategoryDeleted={closeDeletedCategoryEditor}
          onEditCategory={openEditPanel}
          onNotice={showNotice}
          onRestructurePath={openRestructureDialog}
          search={search}
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
      <CategoriesSidePanel
        category={selectedCategoryForEditor}
        initialEconomicIntent={economicIntent}
        mode={panelMode ?? "create"}
        open={Boolean(panelMode)}
        onClose={closePanel}
        onNotice={showNotice}
      />
      {restructurePath ? (
        <RestructureDialog
          key={restructurePath}
          entityLabel="Category path"
          errorMessage={restructureError}
          fromFqn={restructurePath}
          hint="The whole category subtree moves with this path."
          onClearError={() => {
            setRestructureError(undefined);
          }}
          onClose={closeRestructureDialog}
          onSubmit={submitRestructure}
        />
      ) : null}
    </section>
  );
};
