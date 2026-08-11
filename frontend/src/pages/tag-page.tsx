import { useParams } from "react-router";

import { EntityOverviewPage } from "@/features/entity-overviews";

const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const TagPage = () => {
  const { tagId: tagIdParam } = useParams();
  const tagId = parsePositiveInteger(tagIdParam);
  return (
    <EntityOverviewPage
      backHref="/tags"
      entityKindLabel="Tag"
      request={
        tagId
          ? { entityId: tagId, entityKind: "tag", scopeKind: "leaf" }
          : undefined
      }
    />
  );
};
