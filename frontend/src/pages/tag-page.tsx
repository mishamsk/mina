import { Plus } from "pixelarticons/react";
import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { PageHelp } from "@/components/page-help";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell";
import { FqnPath } from "@/features/ledger";
import {
  ReferenceDrilldownError,
  ReferenceDrilldownNotFound,
  ReferenceDrilldownPage,
  ReferenceDrilldownSkeleton,
  referenceTransactionHref,
} from "@/features/reference";
import { refreshTagsPage, useTagsResource } from "@/features/tags";

const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const exactOnlyParam = "scope";

const tagDescendantIds = (
  tags: readonly { fqn: string; is_hidden: boolean; tag_id: number }[],
  fqn: string,
): readonly number[] =>
  tags
    .filter(
      (tag) =>
        tag.fqn === fqn || (!tag.is_hidden && tag.fqn.startsWith(`${fqn}:`)),
    )
    .map((tag) => tag.tag_id);

export const TagPage = () => {
  const navigate = useNavigate();
  const { tagId: tagIdParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tagsPage = useTagsResource();
  const tagId = parsePositiveInteger(tagIdParam);
  const exactOnly = searchParams.get(exactOnlyParam) === "exact";
  const tag = tagsPage.snapshot?.tags.find(
    (candidate) => candidate.tag_id === tagId,
  );
  const filterIds = useMemo(() => {
    if (!tag || !tagsPage.snapshot) {
      return [];
    }
    return exactOnly
      ? [tag.tag_id]
      : tagDescendantIds(tagsPage.snapshot.tags, tag.fqn);
  }, [exactOnly, tag, tagsPage.snapshot]);
  const viewAllHref = referenceTransactionHref("tag", filterIds);

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
      aria-labelledby="tag-title"
    >
      <PageHeader
        title={
          tag ? (
            <FqnPath
              value={tag.fqn}
              ancestorClassName="text-[var(--frame-muted)]"
              className="text-2xl"
              leafClassName="text-[var(--frame-foreground)]"
            />
          ) : (
            "Tag"
          )
        }
        titleId="tag-title"
        titleClassName="normal-case"
        eyebrow="Reference drill-down"
        help={
          <PageHelp label="Tag help">
            Tag pages show matching transactions and include descendant tag
            paths unless limited to this level.
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

      {tagsPage.loading && !tagsPage.snapshot ? (
        <ReferenceDrilldownSkeleton />
      ) : null}
      {tagsPage.errorMessage && !tagsPage.snapshot ? (
        <ReferenceDrilldownError
          message={tagsPage.errorMessage}
          title="Tag could not be loaded."
          onRetry={() => {
            void refreshTagsPage();
          }}
        />
      ) : null}
      {tagsPage.snapshot && !tag ? (
        <ReferenceDrilldownNotFound
          backHref="/tags"
          backLabel="Back to tags"
          entityKindLabel="Tag"
        />
      ) : null}
      {tag ? (
        <ReferenceDrilldownPage
          actionLabel="View all transactions"
          entityKindLabel="Tag"
          exactOnly={exactOnly}
          filterIds={filterIds}
          filterKind="tag"
          fqn={tag.fqn}
          hidden={tag.is_hidden}
          onExactOnlyChange={setExactOnly}
          showExactOnlyToggle
          title={tag.name}
          viewAllHref={viewAllHref}
        />
      ) : null}
    </section>
  );
};
