import { Close, Pencil } from "pixelarticons/react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

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
import { useInlineEdit } from "./inline-editing";
import { InlineEditorActions } from "./inline-editor-actions";
import type { RecordReferenceUpdate } from "./record-editing";

export type { RecordReferenceUpdate } from "./record-editing";

type RecordReferenceField = RecordReferenceUpdate["kind"];

interface RecordReferenceCellsProps {
  readonly editable?: boolean;
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

export const categoryReferenceOptions = (
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

export const tagReferenceOptions = (
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

export const memberReferenceOptions = (
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
  readonly onPickerOpenChange: (open: boolean) => void;
  readonly onSave: (update: RecordReferenceUpdate) => void;
  readonly record: JournalRecord;
  readonly saving: boolean;
}

const CategoryReferenceEditor = ({
  maps,
  onCancel,
  onPickerOpenChange,
  onSave,
  record,
  saving,
}: ReferenceEditorProps) => {
  const [includeHidden, setIncludeHidden] = useState(false);
  const [categoryId, setCategoryId] = useState<number | undefined>(
    record.category_id,
  );

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
        options={categoryReferenceOptions(
          maps,
          record.category_id,
          includeHidden,
        )}
        value={categoryId}
        onChange={setCategoryId}
        onOpenChange={onPickerOpenChange}
      />
      <InlineEditorActions
        disabled={saving}
        fieldLabel="category"
        onCancel={onCancel}
        onSave={() => {
          if (categoryId !== undefined) {
            onSave({ categoryId, kind: "category" });
          }
        }}
        saveDisabled={categoryId === undefined}
      />
    </>
  );
};

const TagsReferenceEditor = ({
  maps,
  onCancel,
  onPickerOpenChange,
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
        options={tagReferenceOptions(maps, record.tag_ids, includeHidden)}
        value={tagIds}
        onChange={setTagIds}
        onOpenChange={onPickerOpenChange}
      />
      <InlineEditorActions
        disabled={saving}
        fieldLabel="tags"
        onCancel={onCancel}
        onSave={() => {
          onSave({ kind: "tags", tagIds });
        }}
      />
    </>
  );
};

const MemberReferenceEditor = ({
  maps,
  onCancel,
  onPickerOpenChange,
  onSave,
  record,
  saving,
}: ReferenceEditorProps) => {
  const [memberId, setMemberId] = useState<number | undefined>(
    record.member_id ?? undefined,
  );
  const [memberSelectionValid, setMemberSelectionValid] = useState(true);
  const [pickerResetVersion, setPickerResetVersion] = useState(0);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <EntityPicker
        key={pickerResetVersion}
        autoFocus={pickerResetVersion === 0}
        id={`record-${record.record_id}-member`}
        label="Member"
        options={memberReferenceOptions(maps, record.member_id)}
        value={memberId}
        onOpenChange={onPickerOpenChange}
        onChange={(nextMemberId) => {
          if (nextMemberId === undefined) {
            setMemberSelectionValid(false);
            return;
          }
          setMemberId(nextMemberId);
          setMemberSelectionValid(true);
        }}
      />
      {memberId !== undefined ? (
        <Tooltip label="Clear member" asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            className="relative z-40 self-start"
            aria-label="Clear member"
            disabled={saving}
            onClick={() => {
              setMemberId(undefined);
              setMemberSelectionValid(true);
              setPickerResetVersion((current) => current + 1);
              window.requestAnimationFrame(() => {
                saveButtonRef.current?.focus();
              });
            }}
          >
            <Close aria-hidden="true" className="size-4" />
          </Button>
        </Tooltip>
      ) : null}
      <InlineEditorActions
        disabled={saving}
        fieldLabel="member"
        onCancel={onCancel}
        onSave={() => {
          onSave({ kind: "member", memberId });
        }}
        saveButtonRef={saveButtonRef}
        saveDisabled={!memberSelectionValid}
      />
    </>
  );
};

export const RecordReferenceCells = ({
  editable = true,
  field,
  maps,
  onSave,
  record,
  testIdPrefix = "record",
  transaction,
  value,
}: RecordReferenceCellsProps) => {
  const [errorMessage, setErrorMessage] = useState<string>();
  const [entityPickerOpen, setEntityPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const displayCellRef = useRef<HTMLDivElement>(null);
  const { activeEditorId, finish, requestStart } = useInlineEdit();
  const instanceId = useId();
  const editorId = `${testIdPrefix}-${record.record_id}-${field}-${instanceId}`;
  const editing = activeEditorId === editorId;

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
    finish(editorId, true);
  };

  const startEditing = () => {
    setErrorMessage(undefined);
    requestStart(editorId, restoreDisplayFocus);
  };

  useEffect(
    () => () => {
      finish(editorId);
    },
    [editorId, finish],
  );

  const save = async (update: RecordReferenceUpdate) => {
    setSaving(true);
    setErrorMessage(undefined);
    try {
      const rowRemainsVisible = await onSave(transaction, record, update);
      finish(editorId, rowRemainsVisible !== false);
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
          if (editable && event.key === "F2") {
            event.preventDefault();
            startEditing();
          }
        }}
      >
        <span className="min-w-0 flex-1 break-words">{value}</span>
        {editable ? (
          <Tooltip label={`Edit ${fieldLabel[field]}`} asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="pointer-events-none absolute top-0 right-0 opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
              aria-label={`Edit ${fieldLabel[field]}`}
              onClick={() => {
                startEditing();
              }}
            >
              <Pencil aria-hidden="true" />
            </Button>
          </Tooltip>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-2"
      data-inline-editor-id={editorId}
      data-inline-editor-pending={saving ? "true" : undefined}
      data-testid={`${testIdPrefix}-${field}-editor`}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") {
          if (entityPickerOpen) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      {field === "category" ? (
        <CategoryReferenceEditor
          maps={maps}
          onCancel={cancel}
          onPickerOpenChange={setEntityPickerOpen}
          onSave={(update) => void save(update)}
          record={record}
          saving={saving}
        />
      ) : null}
      {field === "tags" ? (
        <TagsReferenceEditor
          maps={maps}
          onCancel={cancel}
          onPickerOpenChange={setEntityPickerOpen}
          onSave={(update) => void save(update)}
          record={record}
          saving={saving}
        />
      ) : null}
      {field === "member" ? (
        <MemberReferenceEditor
          maps={maps}
          onCancel={cancel}
          onPickerOpenChange={setEntityPickerOpen}
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
