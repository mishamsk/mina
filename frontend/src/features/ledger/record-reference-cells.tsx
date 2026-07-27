import { Close, Pencil } from "pixelarticons/react";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { JournalRecord, Transaction } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";

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
  selectedCategoryId: number | null,
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

const editorViewportInset = 8;
const editorAnchorGap = 6;
const editorPreferredWidth = 352;
const editorPreferredHeight = 320;
const editorMinimumHeight = 256;

interface FloatingEditorPosition {
  readonly bottom?: number;
  readonly left: number;
  readonly maxHeight: number;
  readonly top?: number;
  readonly width: number;
}

const useFloatingEditorPosition = (
  anchorRef: RefObject<HTMLElement | null>,
  editorRef: RefObject<HTMLElement | null>,
  active: boolean,
): CSSProperties => {
  const [position, setPosition] = useState<FloatingEditorPosition>();

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }

    const anchorBounds = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(
      editorPreferredWidth,
      viewportWidth - editorViewportInset * 2,
    );
    const left = Math.min(
      Math.max(anchorBounds.left, editorViewportInset),
      viewportWidth - width - editorViewportInset,
    );
    const availableBelow = Math.max(
      0,
      viewportHeight -
        anchorBounds.bottom -
        editorAnchorGap -
        editorViewportInset,
    );
    const availableAbove = Math.max(
      0,
      anchorBounds.top - editorAnchorGap - editorViewportInset,
    );
    const placeBelow =
      availableBelow >= editorPreferredHeight ||
      availableBelow >= availableAbove;
    const anchorLeavesUsableSpace =
      availableBelow >= editorMinimumHeight ||
      availableAbove >= editorMinimumHeight;

    if (!anchorLeavesUsableSpace) {
      setPosition({
        left,
        maxHeight: viewportHeight - editorViewportInset * 2,
        top: editorViewportInset,
        width,
      });
      return;
    }

    setPosition({
      bottom: placeBelow
        ? undefined
        : viewportHeight - anchorBounds.top + editorAnchorGap,
      left,
      maxHeight: Math.max(0, placeBelow ? availableBelow : availableAbove),
      top: placeBelow ? anchorBounds.bottom + editorAnchorGap : undefined,
      width,
    });
  }, [anchorRef, editorRef]);

  useLayoutEffect(() => {
    if (!active) {
      return;
    }

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    const resizeObserver = new ResizeObserver(updatePosition);
    if (anchorRef.current) {
      resizeObserver.observe(anchorRef.current);
    }
    if (editorRef.current) {
      resizeObserver.observe(editorRef.current);
    }
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [active, anchorRef, editorRef, updatePosition]);

  return position
    ? {
        bottom: position.bottom,
        left: position.left,
        maxHeight: position.maxHeight,
        top: position.top,
        width: position.width,
      }
    : { visibility: "hidden" };
};

const CategoryReferenceEditor = ({
  maps,
  onCancel,
  onPickerOpenChange,
  onSave,
  record,
  saving,
}: ReferenceEditorProps) => {
  const [categoryId, setCategoryId] = useState<number | undefined>(
    record.category_id ?? undefined,
  );

  return (
    <>
      <EntityPicker
        id={`record-${record.record_id}-category`}
        inlineOptions
        label="Category"
        options={categoryReferenceOptions(maps, record.category_id, false)}
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
  const [tagIds, setTagIds] = useState<readonly number[]>(record.tag_ids);

  return (
    <>
      <EntityMultiPicker
        id={`record-${record.record_id}-tags`}
        inlineOptions
        label="Tags"
        options={tagReferenceOptions(maps, record.tag_ids, false)}
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
        hierarchical={false}
        key={pickerResetVersion}
        id={`record-${record.record_id}-member`}
        inlineOptions
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
  const editorRef = useRef<HTMLDivElement>(null);
  const restoreDisplayFocusRef = useRef(false);
  const { activeEditorId, finish, requestStart } = useInlineEdit();
  const instanceId = useId();
  const editorId = `${testIdPrefix}-${field}-${instanceId}`;
  const editing = activeEditorId === editorId;
  const editorStyle = useFloatingEditorPosition(
    displayCellRef,
    editorRef,
    editing,
  );
  const editorPositioned = editorStyle.visibility !== "hidden";

  useLayoutEffect(() => {
    if (!editing || !editorPositioned) {
      return;
    }

    editorRef.current
      ?.querySelector<HTMLInputElement>('[role="combobox"]')
      ?.focus();
  }, [editing, editorPositioned]);

  const restoreDisplayFocus = () => {
    restoreDisplayFocusRef.current = true;
  };

  useLayoutEffect(() => {
    if (editing || !restoreDisplayFocusRef.current) {
      return;
    }

    restoreDisplayFocusRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      displayCellRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [editing]);

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

  return (
    <div className="relative min-w-0">
      <div
        ref={displayCellRef}
        inert={editing ? true : undefined}
        tabIndex={editing ? -1 : 0}
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
        {editable && !editing ? (
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
      {editing ? (
        <div
          ref={editorRef}
          className="bg-card fixed z-80 flex min-h-0 flex-col gap-2 overflow-hidden border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)]"
          data-inline-editor-content={editorId}
          data-inline-editor-id={editorId}
          data-inline-editor-pending={saving ? "true" : undefined}
          data-testid={`${testIdPrefix}-${field}-editor`}
          style={editorStyle}
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
            <p className="text-destructive shrink-0 text-xs" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
