import { useParams } from "react-router";

import { EntityOverviewPage } from "@/features/entity-overviews";

const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const CategoryPage = () => {
  const { categoryId: categoryIdParam } = useParams();
  const categoryId = parsePositiveInteger(categoryIdParam);
  return (
    <EntityOverviewPage
      backHref="/categories"
      entityKindLabel="Category"
      request={
        categoryId
          ? { entityId: categoryId, entityKind: "category", scopeKind: "leaf" }
          : undefined
      }
    />
  );
};
