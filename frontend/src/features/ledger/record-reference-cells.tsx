import { Pencil } from "pixelarticons/react";
import { type ReactNode, useRef, useState } from "react";

import type { JournalRecord, Transaction } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import {
  EntityMultiPicker,
  type EntityOption,
  EntityPicker,
} from "./entity-picker";
import type { LookupMaps } from "./format";
import type { RecordReferenceUpdate } from "./record-editing";

export type { RecordReferenceUpdate } from "./record-editing";

type RecordReferenceField = RecordReferenceUpdate["kind"];

interface RecordReferenceCellsProps {
  readonly field: RecordReferenceField;
  readonly maps: LookupMaps;
  readonly onSave: (
    transaction: Transaction,
    record: JournalRecord,
    update: RecordReferenceUpdate,
  ) => Promise<boolean | void>;
  readonly record: JournalRecord;
  readonly testIdPrefix?: string;
  readonly transaction: Transaction;
  readonly value: ReactNode;
}

const categoryOptions = (
  maps: LookupMaps,
  selectedCategoryId: number,
  includeHidden: boolean,
): readonly EntityOption[] =>
  Array.from(maps.categoriesById.values())
    .filter(
      (category) =>
        !category.tombstoned_at &&
        (includeHidden ||
          !category.is_hidden ||
          category.category_id === selectedCategoryId),
    )
    .map((category) => ({
      hidden: category.is_hidden,
      id: category.category_id,
      label: category.name,
      searchLabel: category.fqn,
    }));

const tagOptions = (
  maps: LookupMaps,
  selectedTagIds: readonly number[],
  includeHidden: boolean,
): readonly EntityOption[] =>
  Array.from(maps.tagsById.values())
    .filter(
      (tag) =>
        !tag.tombstoned_at &&
        (includeHidden ||
          !tag.is_hidden ||
          selectedTagIds.includes(tag.tag_id)),
    )
    .map((tag) => ({
      hidden: tag.is_hidden,
      id: tag.tag_id,
      label: tag.name,
      searchLabel: tag.fqn,
    }));

const memberOptions = (
  maps: LookupMaps,
  selectedMemberId: number | null | undefined,
): readonly EntityOption[] =>
  Array.from(maps.membersById.values())
    .filter(
      (member) =>
        !member.tombstoned_at &&
        (!member.is_hidden || member.member_id === selectedMemberId),
    )
    .map((member) => ({
      hidden: member.is_hidden,
      id: member.member_id,
      label: member.name,
      searchLabel: member.name,
    }));

const fieldLabel: Record<RecordReferenceField, string> = {
  category: "Category",
  member: "Member",
  tags: "Tags",
};

interface ReferenceEditorProps {
  readonly maps: LookupMaps;
  readonly onCancel: () => void;
  readonly onSave: (update: RecordReferenceUpdate) => void;
  readonly record: JournalRecord;
  readonly saving: boolean;
}

const CategoryReferenceEditor = ({
  maps,
  onSave,
  record,
}: ReferenceEditorProps) => {
  const [includeHidden, setIncludeHidden] = useState(false);

  return (
    <>
      <label className="flex items-center gap-2">
        <Checkbox
          checked={includeHidden}
          onCheckedChange={(checked) => {
            setIncludeHidden(checked === true);
          }}
        />
        <span className="font-mono text-sm">Include hidden</span>
      </label>
      <EntityPicker
        autoFocus
        id={`record-${record.record_id}-category`}
        label="Category"
        options={categoryOptions(maps, record.category_id, includeHidden)}
        value={record.category_id}
        onChange={(categoryId) => {
          if (categoryId !== undefined) {
            onSave({ categoryId, kind: "category" });
          }
        }}
      />
    </>
  );
};

const TagsReferenceEditor = ({
  maps,
  onCancel,
  onSave,
  record,
  saving,
}: ReferenceEditorProps) => {
  const [includeHidden, setIncludeHidden] = useState(false);
  const [tagIds, setTagIds] = useState<readonly number[]>(record.tag_ids);

  return (
    <>
      <label className="flex items-center gap-2">
        <Checkbox
          checked={includeHidden}
          onCheckedChange={(checked) => {
            setIncludeHidden(checked === true);
          }}
        />
        <span className="font-mono text-sm">Include hidden</span>
      </label>
      <EntityMultiPicker
        autoFocus
        id={`record-${record.record_id}-tags`}
        label="Tags"
        options={tagOptions(maps, record.tag_ids, includeHidden)}
        value={tagIds}
        onChange={setTagIds}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => {
            onSave({ kind: "tags", tagIds });
          }}
        >
          Save
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </>
  );
};

const MemberReferenceEditor = ({
  maps,
  onSave,
  record,
  saving,
}: ReferenceEditorProps) => (
  <>
    <EntityPicker
      autoFocus
      id={`record-${record.record_id}-member`}
      label="Member"
      options={memberOptions(maps, record.member_id)}
      value={record.member_id ?? undefined}
      onChange={(memberId) => {
        if (memberId !== undefined) {
          onSave({ kind: "member", memberId });
        }
      }}
    />
    {record.member_id !== null ? (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="relative z-40 self-start"
        disabled={saving}
        onClick={() => {
          onSave({ kind: "member", memberId: undefined });
        }}
      >
        Clear member
      </Button>
    ) : null}
  </>
);

export const RecordReferenceCells = ({
  field,
  maps,
  onSave,
  record,
  testIdPrefix = "record",
  transaction,
  value,
}: RecordReferenceCellsProps) => {
  const [editing, setEditing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [saving, setSaving] = useState(false);
  const displayCellRef = useRef<HTMLDivElement>(null);

  const restoreDisplayFocus = () => {
    window.requestAnimationFrame(() => {
      displayCellRef.current?.focus();
    });
  };

  const cancel = () => {
    if (saving) {
      return;
    }
    setErrorMessage(undefined);
    setEditing(false);
    restoreDisplayFocus();
  };

  const save = async (update: RecordReferenceUpdate) => {
    setSaving(true);
    setErrorMessage(undefined);
    try {
      const rowRemainsVisible = await onSave(transaction, record, update);
      setEditing(false);
      if (rowRemainsVisible !== false) {
        restoreDisplayFocus();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div
        ref={displayCellRef}
        tabIndex={0}
        className="group relative flex min-h-6 min-w-0 items-start"
        data-testid={`${testIdPrefix}-${field}-cell`}
        onKeyDown={(event) => {
          if (event.key === "F2") {
            event.preventDefault();
            setEditing(true);
          }
        }}
      >
        <span className="min-w-0 flex-1 break-words">{value}</span>
        <Tooltip label={`Edit ${fieldLabel[field]}`} asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="pointer-events-none absolute top-0 right-0 opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
            aria-label={`Edit ${fieldLabel[field]}`}
            onClick={() => {
              setEditing(true);
            }}
          >
            <Pencil aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-2"
      data-testid={`${testIdPrefix}-${field}-editor`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          cancel();
        }
      }}
    >
      {field === "category" ? (
        <CategoryReferenceEditor
          maps={maps}
          onCancel={cancel}
          onSave={(update) => void save(update)}
          record={record}
          saving={saving}
        />
      ) : null}
      {field === "tags" ? (
        <TagsReferenceEditor
          maps={maps}
          onCancel={cancel}
          onSave={(update) => void save(update)}
          record={record}
          saving={saving}
        />
      ) : null}
      {field === "member" ? (
        <MemberReferenceEditor
          maps={maps}
          onCancel={cancel}
          onSave={(update) => void save(update)}
          record={record}
          saving={saving}
        />
      ) : null}
      {errorMessage ? (
        <p className="text-destructive text-xs" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
};
