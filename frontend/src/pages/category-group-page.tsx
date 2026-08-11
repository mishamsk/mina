import { useSearchParams } from "react-router";

import { EntityOverviewPage } from "@/features/entity-overviews";

export const CategoryGroupPage = () => {
  const [searchParams] = useSearchParams();
  const prefix = searchParams.get("prefix")?.trim();
  return (
    <EntityOverviewPage
      backHref="/categories"
      entityKindLabel="Category"
      request={
        prefix
          ? { entityKind: "category", fqn: prefix, scopeKind: "group" }
          : undefined
      }
    />
  );
};
