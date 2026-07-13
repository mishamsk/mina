import { Bookmark, Close, User } from "pixelarticons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { EntityMultiPicker, EntityPicker } from "./entity-picker";
import type { LookupMaps } from "./format";
import {
  categoryReferenceOptions,
  memberReferenceOptions,
  tagReferenceOptions,
} from "./record-reference-cells";

type BulkAction = "category" | "member" | "tags";

interface BulkActionBarProps {
  readonly maps: LookupMaps;
  readonly onCategorize: (categoryId: number) => Promise<void>;
  readonly onClear: () => void;
  readonly onMember: (memberId: number) => Promise<void>;
  readonly onTags: (tagIds: readonly number[]) => Promise<void>;
  readonly selectedCount: number;
}

const actionTitle: Record<BulkAction, string> = {
  category: "Categorize selected transactions",
  member: "Set member for selected transactions",
  tags: "Add tags to selected transactions",
};

export const BulkActionBar = ({
  maps,
  onCategorize,
  onClear,
  onMember,
  onTags,
  selectedCount,
}: BulkActionBarProps) => {
  const [activeAction, setActiveAction] = useState<BulkAction>();
  const [includeHidden, setIncludeHidden] = useState(false);
  const [tagIds, setTagIds] = useState<readonly number[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const closePicker = () => {
    if (saving) {
      return;
    }
    setActiveAction(undefined);
    setErrorMessage(undefined);
  };
  const apply = async (action: () => Promise<void>) => {
    setSaving(true);
    setErrorMessage(undefined);
    try {
      await action();
      setActiveAction(undefined);
      setTagIds([]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
    } finally {
      setSaving(false);
    }
  };
  const openPicker = (action: BulkAction) => {
    setActiveAction(action);
    setErrorMessage(undefined);
  };

  return (
    <section
      aria-label="Bulk actions"
      className="bg-card fixed inset-x-4 bottom-4 z-[60] mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-2 border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)]"
      data-testid="bulk-action-bar"
      onKeyDown={(event) => {
        if (event.key === "Escape" && activeAction && !saving) {
          event.preventDefault();
          closePicker();
        }
      }}
    >
      {activeAction ? (
        <section
          aria-label={actionTitle[activeAction]}
          className="bg-card absolute bottom-full left-0 z-[61] mb-3 flex min-w-72 flex-col gap-3 border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)]"
          data-testid="bulk-action-picker"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-sm font-semibold uppercase">
              {actionTitle[activeAction]}
            </h2>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Close bulk action picker"
              disabled={saving}
              onClick={closePicker}
            >
              <Close aria-hidden="true" />
            </Button>
          </div>
          {activeAction === "category" || activeAction === "tags" ? (
            <label className="flex items-center gap-2">
              <Checkbox
                checked={includeHidden}
                disabled={saving}
                onCheckedChange={(checked) => {
                  setIncludeHidden(checked === true);
                }}
              />
              <span className="font-mono text-sm">Include hidden</span>
            </label>
          ) : null}
          {activeAction === "category" ? (
            <EntityPicker
              autoFocus
              disabled={saving}
              id="bulk-category"
              label="Category"
              options={categoryReferenceOptions(maps, 0, includeHidden)}
              value={undefined}
              onChange={(categoryId) => {
                if (categoryId !== undefined) {
                  void apply(() => onCategorize(categoryId));
                }
              }}
            />
          ) : null}
          {activeAction === "tags" ? (
            <>
              <EntityMultiPicker
                autoFocus
                id="bulk-tags"
                label="Tags to add"
                options={tagReferenceOptions(maps, [], includeHidden)}
                value={tagIds}
                onChange={setTagIds}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || tagIds.length === 0}
                  onClick={() => {
                    void apply(() => onTags(tagIds));
                  }}
                >
                  Add tags
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={closePicker}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : null}
          {activeAction === "member" ? (
            <EntityPicker
              autoFocus
              disabled={saving}
              id="bulk-member"
              label="Member"
              options={memberReferenceOptions(maps, undefined)}
              value={undefined}
              onChange={(memberId) => {
                if (memberId !== undefined) {
                  void apply(() => onMember(memberId));
                }
              }}
            />
          ) : null}
          {errorMessage ? (
            <p className="text-destructive text-xs" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </section>
      ) : null}
      <span className="font-heading px-2 text-sm font-semibold uppercase">
        {selectedCount} selected
      </span>
      <Button type="button" size="sm" onClick={() => openPicker("category")}>
        <Bookmark aria-hidden="true" />
        Categorize
      </Button>
      <Button type="button" size="sm" onClick={() => openPicker("tags")}>
        <Bookmark aria-hidden="true" />
        Tag
      </Button>
      <Button type="button" size="sm" onClick={() => openPicker("member")}>
        <User aria-hidden="true" />
        Member
      </Button>
      <Button type="button" size="icon" variant="outline" onClick={onClear}>
        <Close aria-hidden="true" />
        <span className="sr-only">Clear selection</span>
      </Button>
    </section>
  );
};
