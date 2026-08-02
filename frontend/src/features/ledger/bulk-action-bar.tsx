import { Bookmark, Check, Clock, Close, User } from "pixelarticons/react";
import { type KeyboardEvent, useRef, useState } from "react";

import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import {
  type BulkEditSkipSummary,
  formatBulkEditSkipReasons,
} from "./bulk-edit-prediction";
import { EntityMultiPicker, EntityPicker } from "./entity-picker";
import type { LookupMaps } from "./format";
import type { RecordReferenceUpdate } from "./record-reference-cells";
import {
  categoryReferenceOptions,
  memberReferenceOptions,
  tagReferenceOptions,
} from "./record-reference-cells";

export type BulkReferenceAction = "category" | "member" | "tags";

export interface ActiveBulkEditor {
  readonly action: BulkReferenceAction;
  readonly source: "bar" | "row";
  readonly transactionId?: number;
}

interface BulkReferenceEditorProps {
  readonly action: BulkReferenceAction;
  readonly allowIncludeHidden: boolean;
  readonly initialCategoryId?: number;
  readonly initialMemberId?: number;
  readonly inlineOptions?: boolean;
  readonly maps: LookupMaps;
  readonly onApply: (update: RecordReferenceUpdate) => Promise<void>;
  readonly onCancel: () => void;
  readonly onSavingChange?: (saving: boolean) => void;
  readonly selectedCount: number;
  readonly skipSummary: BulkEditSkipSummary;
}

const actionTitle: Record<BulkReferenceAction, string> = {
  category: "Categorize selected transactions",
  member: "Set member for selected transactions",
  tags: "Add tags to selected transactions",
};

const applyLabel: Record<BulkReferenceAction, string> = {
  category: "Apply category",
  member: "Set member",
  tags: "Add tags",
};

const applyRemedy: Record<BulkReferenceAction, string> = {
  category: "Choose a category first",
  member: "Choose a member first",
  tags: "Choose at least one tag first",
};

export const BulkReferenceEditor = ({
  action,
  allowIncludeHidden,
  initialCategoryId,
  initialMemberId,
  inlineOptions = false,
  maps,
  onApply,
  onCancel,
  onSavingChange,
  selectedCount,
  skipSummary,
}: BulkReferenceEditorProps) => {
  const [categoryId, setCategoryId] = useState<number | undefined>(
    initialCategoryId,
  );
  const [includeHidden, setIncludeHidden] = useState(false);
  const [memberId, setMemberId] = useState<number | undefined>(initialMemberId);
  const [tagIds, setTagIds] = useState<readonly number[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const update: RecordReferenceUpdate | undefined =
    action === "category"
      ? categoryId === undefined
        ? undefined
        : { categoryId, kind: "category" }
      : action === "member"
        ? memberId === undefined
          ? undefined
          : { kind: "member", memberId }
        : tagIds.length === 0
          ? undefined
          : { kind: "tags", tagIds };

  const apply = async () => {
    if (!update || saving) {
      return;
    }
    setSaving(true);
    onSavingChange?.(true);
    setErrorMessage(undefined);
    try {
      await onApply(update);
      onCancel();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) {
      event.stopPropagation();
      return;
    }
    if (
      event.key.toLowerCase() === "n" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      event.target instanceof HTMLElement &&
      !event.target.matches("input, textarea, select, [contenteditable='true']")
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey
    ) {
      event.preventDefault();
      void apply();
      return;
    }
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!saving) {
      onCancel();
    }
  };

  return (
    <section
      aria-label={actionTitle[action]}
      className="flex min-h-0 flex-col gap-3"
      data-testid="bulk-action-picker"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between gap-3 bg-[var(--table-header)] px-2 py-1">
        <h2 className="font-heading text-sm font-semibold uppercase">
          Apply to {selectedCount} selected
        </h2>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Close bulk action picker"
          disabled={saving}
          onClick={onCancel}
        >
          <Close aria-hidden="true" />
        </Button>
      </div>
      {skipSummary.count > 0 ? (
        <p className="font-mono text-xs text-[var(--color-class-adjustment-ink)]">
          {skipSummary.count} of {selectedCount} selected will be skipped:{" "}
          {formatBulkEditSkipReasons(skipSummary)}
        </p>
      ) : null}
      {allowIncludeHidden && (action === "category" || action === "tags") ? (
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
      {action === "category" ? (
        <EntityPicker
          autoFocus
          disabled={saving}
          id="bulk-category"
          inlineOptions={inlineOptions}
          label="Category"
          options={categoryReferenceOptions(
            maps,
            initialCategoryId ?? 0,
            allowIncludeHidden && includeHidden,
          )}
          value={categoryId}
          onChange={setCategoryId}
        />
      ) : null}
      {action === "tags" ? (
        <EntityMultiPicker
          autoFocus
          disabled={saving}
          id="bulk-tags"
          inlineOptions={inlineOptions}
          label="Tags to add"
          options={tagReferenceOptions(
            maps,
            [],
            allowIncludeHidden && includeHidden,
          )}
          value={tagIds}
          onChange={setTagIds}
        />
      ) : null}
      {action === "member" ? (
        <EntityPicker
          autoFocus
          disabled={saving}
          hierarchical={false}
          id="bulk-member"
          inlineOptions={inlineOptions}
          label="Member"
          options={memberReferenceOptions(maps, initialMemberId)}
          value={memberId}
          onChange={setMemberId}
        />
      ) : null}
      <div className="flex gap-2">
        <Tooltip
          label={saving ? "Wait for the update to finish" : applyRemedy[action]}
          disabled={!saving && Boolean(update)}
          focusable={saving || !update}
        >
          <Button
            type="button"
            size="sm"
            disabled={saving || !update}
            onClick={() => void apply()}
          >
            {applyLabel[action]}
          </Button>
        </Tooltip>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      {errorMessage ? (
        <p className="text-destructive text-xs" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
};

interface BulkActionBarProps {
  readonly activeEditor: ActiveBulkEditor | undefined;
  readonly maps: LookupMaps;
  readonly onApply: (update: RecordReferenceUpdate) => Promise<void>;
  readonly onEditorChange: (editor: ActiveBulkEditor | undefined) => void;
  readonly onSetReconciliation: (
    value: "reconciled" | "unreconciled",
  ) => Promise<void>;
  readonly onSetSettlement: (value: "pending" | "posted") => Promise<void>;
  readonly selectedCount: number;
  readonly skipSummary: BulkEditSkipSummary;
}

export const BulkActionBar = ({
  activeEditor,
  maps,
  onApply,
  onEditorChange,
  onSetReconciliation,
  onSetSettlement,
  selectedCount,
  skipSummary,
}: BulkActionBarProps) => {
  const categoryButtonRef = useRef<HTMLButtonElement>(null);
  const memberButtonRef = useRef<HTMLButtonElement>(null);
  const tagsButtonRef = useRef<HTMLButtonElement>(null);
  const [recordStateSaving, setRecordStateSaving] = useState(false);
  const [recordStateError, setRecordStateError] = useState<string>();
  const activeAction =
    activeEditor?.source === "bar" ? activeEditor.action : undefined;
  const openEditor = (action: BulkReferenceAction) => {
    onEditorChange({ action, source: "bar" });
  };
  const closeEditor = () => {
    const closingAction = activeAction;
    onEditorChange(undefined);
    window.requestAnimationFrame(() => {
      const target =
        closingAction === "category"
          ? categoryButtonRef.current
          : closingAction === "tags"
            ? tagsButtonRef.current
            : memberButtonRef.current;
      focusWithoutTooltip(target, { preventScroll: true });
    });
  };
  const applyRecordState = async (
    action: () => Promise<void>,
    focusKey: string,
  ) => {
    setRecordStateSaving(true);
    setRecordStateError(undefined);
    try {
      await action();
    } catch (error) {
      setRecordStateError(
        error instanceof Error ? error.message : "The API request failed.",
      );
    } finally {
      setRecordStateSaving(false);
      let attemptsRemaining = 8;
      let focusedOnce = false;
      const restoreFocus = () => {
        window.requestAnimationFrame(() => {
          attemptsRemaining -= 1;
          const focusTarget = document.querySelector<HTMLButtonElement>(
            `[data-bulk-record-state="${focusKey}"]`,
          );
          const alreadyFocused = document.activeElement === focusTarget;
          if (focusTarget && !focusTarget.disabled && !alreadyFocused) {
            focusWithoutTooltip(focusTarget, { preventScroll: true });
          }
          if (attemptsRemaining > 0 && (!alreadyFocused || !focusedOnce)) {
            focusedOnce = true;
            restoreFocus();
          }
        });
      };
      restoreFocus();
    }
  };
  const recordStateDisabledReason =
    selectedCount === 0
      ? "Select transactions first"
      : recordStateSaving
        ? "Record state update in progress."
        : undefined;

  return (
    <section
      aria-label="Bulk actions"
      className="bg-card fixed inset-x-2 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-2 border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)] sm:inset-x-4 sm:max-w-[calc(100vw-2rem)]"
      data-testid="bulk-action-bar"
    >
      {activeAction ? (
        <div className="bg-card absolute bottom-full left-0 z-[41] mb-3 min-w-72 border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)]">
          <BulkReferenceEditor
            key={activeAction}
            action={activeAction}
            allowIncludeHidden
            maps={maps}
            onApply={onApply}
            onCancel={closeEditor}
            selectedCount={selectedCount}
            skipSummary={skipSummary}
          />
        </div>
      ) : null}
      <Tooltip
        label="Select transactions first"
        className={selectedCount === 0 ? "cursor-not-allowed" : undefined}
        disabled={selectedCount > 0}
        focusable={selectedCount === 0}
      >
        <Button
          ref={categoryButtonRef}
          type="button"
          size="sm"
          data-bulk-action="category"
          disabled={selectedCount === 0}
          onClick={() => openEditor("category")}
        >
          <Bookmark aria-hidden="true" />
          Categorize
        </Button>
      </Tooltip>
      <Tooltip
        label={recordStateDisabledReason ?? ""}
        className={recordStateDisabledReason ? "cursor-not-allowed" : undefined}
        disabled={!recordStateDisabledReason}
        focusable={Boolean(recordStateDisabledReason)}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-bulk-record-state="settlement-pending"
          disabled={Boolean(recordStateDisabledReason)}
          onClick={() =>
            void applyRecordState(
              () => onSetSettlement("pending"),
              "settlement-pending",
            )
          }
        >
          <Clock aria-hidden="true" />
          Pending
        </Button>
      </Tooltip>
      <Tooltip
        label={recordStateDisabledReason ?? ""}
        className={recordStateDisabledReason ? "cursor-not-allowed" : undefined}
        disabled={!recordStateDisabledReason}
        focusable={Boolean(recordStateDisabledReason)}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-bulk-record-state="settlement-posted"
          disabled={Boolean(recordStateDisabledReason)}
          onClick={() =>
            void applyRecordState(
              () => onSetSettlement("posted"),
              "settlement-posted",
            )
          }
        >
          <Check aria-hidden="true" />
          Posted
        </Button>
      </Tooltip>
      <Tooltip
        label={recordStateDisabledReason ?? ""}
        className={recordStateDisabledReason ? "cursor-not-allowed" : undefined}
        disabled={!recordStateDisabledReason}
        focusable={Boolean(recordStateDisabledReason)}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-bulk-record-state="reconciliation-reconciled"
          disabled={Boolean(recordStateDisabledReason)}
          onClick={() =>
            void applyRecordState(
              () => onSetReconciliation("reconciled"),
              "reconciliation-reconciled",
            )
          }
        >
          <Check aria-hidden="true" />
          Reconcile
        </Button>
      </Tooltip>
      <Tooltip
        label={recordStateDisabledReason ?? ""}
        className={recordStateDisabledReason ? "cursor-not-allowed" : undefined}
        disabled={!recordStateDisabledReason}
        focusable={Boolean(recordStateDisabledReason)}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-bulk-record-state="reconciliation-unreconciled"
          disabled={Boolean(recordStateDisabledReason)}
          onClick={() =>
            void applyRecordState(
              () => onSetReconciliation("unreconciled"),
              "reconciliation-unreconciled",
            )
          }
        >
          <Close aria-hidden="true" />
          Unreconcile
        </Button>
      </Tooltip>
      {recordStateError ? (
        <p className="text-destructive basis-full text-xs" role="alert">
          {recordStateError}
        </p>
      ) : null}
      <Tooltip
        label="Select transactions first"
        className={selectedCount === 0 ? "cursor-not-allowed" : undefined}
        disabled={selectedCount > 0}
        focusable={selectedCount === 0}
      >
        <Button
          ref={tagsButtonRef}
          type="button"
          size="sm"
          data-bulk-action="tags"
          disabled={selectedCount === 0}
          onClick={() => openEditor("tags")}
        >
          <Bookmark aria-hidden="true" />
          Tag
        </Button>
      </Tooltip>
      <Tooltip
        label="Select transactions first"
        className={selectedCount === 0 ? "cursor-not-allowed" : undefined}
        disabled={selectedCount > 0}
        focusable={selectedCount === 0}
      >
        <Button
          ref={memberButtonRef}
          type="button"
          size="sm"
          data-bulk-action="member"
          disabled={selectedCount === 0}
          onClick={() => openEditor("member")}
        >
          <User aria-hidden="true" />
          Member
        </Button>
      </Tooltip>
    </section>
  );
};
