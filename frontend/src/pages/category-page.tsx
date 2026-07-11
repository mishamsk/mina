import { Plus } from "pixelarticons/react";
import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { PageHelp } from "@/components/page-help";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell";
import {
  IntentBadge,
  refreshCategoriesPage,
  useCategoriesResource,
} from "@/features/categories";
import { FqnPath } from "@/features/ledger";
import {
  ReferenceDrilldownError,
  ReferenceDrilldownNotFound,
  ReferenceDrilldownPage,
  ReferenceDrilldownSkeleton,
  referenceTransactionHref,
} from "@/features/reference";

const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const exactOnlyParam = "scope";

const categoryDescendantIds = (
  categories: readonly {
    category_id: number;
    fqn: string;
    is_hidden: boolean;
  }[],
  fqn: string,
): readonly number[] =>
  categories
    .filter(
      (category) =>
        category.fqn === fqn ||
        (!category.is_hidden && category.fqn.startsWith(`${fqn}:`)),
    )
    .map((category) => category.category_id);

export const CategoryPage = () => {
  const navigate = useNavigate();
  const { categoryId: categoryIdParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoriesPage = useCategoriesResource();
  const categoryId = parsePositiveInteger(categoryIdParam);
  const exactOnly = searchParams.get(exactOnlyParam) === "exact";
  const category = categoriesPage.snapshot?.categories.find(
    (candidate) => candidate.category_id === categoryId,
  );
  const filterIds = useMemo(() => {
    if (!category || !categoriesPage.snapshot) {
      return [];
    }
    return exactOnly
      ? [category.category_id]
      : categoryDescendantIds(categoriesPage.snapshot.categories, category.fqn);
  }, [category, categoriesPage.snapshot, exactOnly]);
  const viewAllHref = referenceTransactionHref("category", filterIds);

  const setExactOnly = (nextExactOnly: boolean) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextExactOnly) {
        next.set(exactOnlyParam, "exact");
      } else {
        next.delete(exactOnlyParam);
      }
      next.set("page", "1");
      next.delete("transaction");
      return next;
    });
  };

  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6"
      aria-labelledby="category-title"
    >
      <PageHeader
        title={
          category ? (
            <FqnPath
              value={category.fqn}
              ancestorClassName="text-[var(--frame-muted)]"
              className="text-2xl"
              leafClassName="text-[var(--frame-foreground)]"
            />
          ) : (
            "Category"
          )
        }
        titleId="category-title"
        titleClassName="normal-case"
        eyebrow="Reference drill-down"
        help={
          <PageHelp label="Category help">
            Category pages show matching transactions and include descendant
            category paths unless limited to this level.
          </PageHelp>
        }
        actions={
          <Button
            type="button"
            onClick={() => {
              void navigate("/transactions");
            }}
          >
            <Plus aria-hidden="true" />
            New transaction
          </Button>
        }
      />

      {categoriesPage.loading && !categoriesPage.snapshot ? (
        <ReferenceDrilldownSkeleton />
      ) : null}
      {categoriesPage.errorMessage && !categoriesPage.snapshot ? (
        <ReferenceDrilldownError
          message={categoriesPage.errorMessage}
          title="Category could not be loaded."
          onRetry={() => {
            void refreshCategoriesPage();
          }}
        />
      ) : null}
      {categoriesPage.snapshot && !category ? (
        <ReferenceDrilldownNotFound
          backHref="/categories"
          backLabel="Back to categories"
          entityKindLabel="Category"
        />
      ) : null}
      {category ? (
        <ReferenceDrilldownPage
          actionLabel="View all transactions"
          badges={<IntentBadge economicIntent={category.economic_intent} />}
          entityKindLabel="Category"
          exactOnly={exactOnly}
          filterIds={filterIds}
          filterKind="category"
          fqn={category.fqn}
          hidden={category.is_hidden}
          onExactOnlyChange={setExactOnly}
          showExactOnlyToggle
          title={category.name}
          viewAllHref={viewAllHref}
        />
      ) : null}
    </section>
  );
};
