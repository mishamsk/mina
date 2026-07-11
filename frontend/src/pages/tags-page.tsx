import { Plus } from "pixelarticons/react";
import { useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { apiErrorMessage, restructureLedgerTags, type Tag } from "@/api";
import { PageHelp } from "@/components/page-help";
import { Toast, toastDurationMs } from "@/components/toast";
import { focusWithoutTooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell";
import {
  RestructureDialog,
  type RestructureSubmitInput,
} from "@/features/hierarchy";
import { ReferenceToolbar } from "@/features/reference";
import {
  readTagsSearchState,
  refreshTagsAfterMutation,
  TagsPageContent,
  TagsSidePanel,
  useTagsResource,
} from "@/features/tags";

interface Notice {
  readonly id: number;
  readonly message: string;
  readonly tone: "error" | "success";
}

const movedTagMessage = (count: number): string =>
  `Moved ${count} ${count === 1 ? "tag" : "tags"}.`;

export const TagsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tagsPage = useTagsResource();
  const [panelMode, setPanelMode] = useState<"create" | "edit" | undefined>();
  const [selectedTagId, setSelectedTagId] = useState<number | undefined>();
  const [restructurePath, setRestructurePath] = useState<string | undefined>();
  const [restructureError, setRestructureError] = useState<
    string | undefined
  >();
  const [notice, setNotice] = useState<Notice | undefined>();
  const createTagButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelOpenerRef = useRef<HTMLElement | null>(null);
  const restructureOpenerRef = useRef<HTMLElement | null>(null);
  const { includeHidden, search } = readTagsSearchState(searchParams);
  const selectedTag = tagsPage.snapshot?.tags.find(
    (tag) => tag.tag_id === selectedTagId,
  );

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
    const target = opener?.isConnected ? opener : createTagButtonRef.current;
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
    setSelectedTagId(undefined);
    setPanelMode("create");
  };

  const openEditPanel = (tag: Tag, opener: HTMLElement) => {
    setRestructurePath(undefined);
    setRestructureError(undefined);
    restructureOpenerRef.current = null;
    panelOpenerRef.current = opener;
    setSelectedTagId(tag.tag_id);
    setPanelMode("edit");
  };

  const closePanel = () => {
    setPanelMode(undefined);
    setSelectedTagId(undefined);
    restorePanelOpenerFocus();
  };

  const openRestructureDialog = (fqn: string, opener: HTMLElement) => {
    setPanelMode(undefined);
    setSelectedTagId(undefined);
    panelOpenerRef.current = null;
    restructureOpenerRef.current = opener;
    setRestructureError(undefined);
    setRestructurePath(fqn);
  };

  const restoreRestructureOpenerFocus = () => {
    const opener = restructureOpenerRef.current;
    restructureOpenerRef.current = null;
    const target = opener?.isConnected ? opener : createTagButtonRef.current;
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
    const result = await restructureLedgerTags({
      from_fqn: fromFqn,
      to_fqn: toFqn,
    });

    if (result.data) {
      closeRestructureDialog({ restoreFocus: false });
      const refreshed = await refreshTagsAfterMutation({ restructure: true });
      if (refreshed) {
        showNotice(movedTagMessage(result.data.moved_count));
      }
      restoreRestructureOpenerFocus();
      return;
    }

    setRestructureError(
      apiErrorMessage(result.error, "Tag path could not be moved."),
    );
  };

  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6"
      aria-labelledby="tags-title"
    >
      <PageHeader
        title="Tags"
        titleId="tags-title"
        eyebrow="Reference data"
        help={
          <PageHelp label="Tags help">
            Tag paths group journal records for flexible slices like trips,
            projects, and tax markers.
          </PageHelp>
        }
        actions={
          <Button
            ref={createTagButtonRef}
            type="button"
            onClick={(event) => {
              openCreatePanel(event.currentTarget);
            }}
          >
            <Plus aria-hidden="true" />
            New tag
          </Button>
        }
        toolbar={
          <ReferenceToolbar
            includeHidden={includeHidden}
            search={search}
            searchInputId="tags-search"
            searchPlaceholder="Full tag path"
            setSearchParams={setSearchParams}
            toggleLabel="Include hidden"
            toggleOffTooltip="Include hidden tags"
            toggleOnTooltip="Hide hidden tags"
          />
        }
      />

      <div className="min-h-0 flex-1">
        <TagsPageContent
          includeHidden={includeHidden}
          onEditTag={openEditPanel}
          onNotice={showNotice}
          onRestructurePath={openRestructureDialog}
          search={search}
          tagsPage={tagsPage}
        />
      </div>
      <Toast
        key={notice?.id ?? "empty"}
        className={
          notice?.tone === "error"
            ? "text-destructive"
            : "text-[var(--color-money-in)]"
        }
        containerClassName="z-[70]"
        durationMs={toastDurationMs}
        message={notice?.message}
        onDismiss={() => {
          setNotice(undefined);
        }}
      />
      <TagsSidePanel
        mode={panelMode ?? "create"}
        onClose={closePanel}
        onNotice={showNotice}
        open={Boolean(panelMode)}
        tag={selectedTag}
      />
      {restructurePath ? (
        <RestructureDialog
          key={restructurePath}
          entityLabel="Tag path"
          errorMessage={restructureError}
          fromFqn={restructurePath}
          hint="The whole tag subtree moves with this path."
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
