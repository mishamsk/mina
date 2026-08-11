import { useSearchParams } from "react-router";

import { EntityOverviewPage } from "@/features/entity-overviews";

export const TagGroupPage = () => {
  const [searchParams] = useSearchParams();
  const prefix = searchParams.get("prefix")?.trim();
  return (
    <EntityOverviewPage
      backHref="/tags"
      entityKindLabel="Tag"
      request={
        prefix
          ? { entityKind: "tag", fqn: prefix, scopeKind: "group" }
          : undefined
      }
    />
  );
};
