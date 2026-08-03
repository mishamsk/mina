import { Bookmark, Check, Clock, Close, User } from "pixelarticons/react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import {
  type EditModeSkipSummary,
  formatEditModeSkipReasons,
} from "./edit-mode-prediction";
import {
  EntityMultiPicker,
  type EntityOption,
  EntityPicker,
} from "./entity-picker";
import type { LookupMaps } from "./format";
import { focusTransactionRowFallback } from "./transaction-row-focus";

export type EditDockAction = "category" | "member" | "tags";

export type EditDockUpdate =
  | { readonly categoryId: number; readonly kind: "category" }
  | { readonly kind: "member"; readonly memberId: number | null }
  | {
      readonly kind: "tags";
      readonly operation: "add" | "remove";
      readonly tagIds: readonly number[];
    };

interface EditDockEditorProps {
  readonly action: EditDockAction;
  readonly blocked: boolean;
  readonly maps: LookupMaps;
  readonly onApply: (update: EditDockUpdate) => Promise<void>;
  readonly onCancel: () => void;
  readonly selectedCount: number;
  readonly skipSummary: EditModeSkipSummary;
}

const actionTitle: Record<EditDockAction, string> = {
  category: "Category",
  member: "Member",
  tags: "Tags",
};

const categoryOptions = (
  maps: LookupMaps,
  includeHidden: boolean,
): readonly EntityOption[] =>
  Array.from(maps.categoriesById.values())
    .filter(
      (category) =>
        !category.tombstoned_at && (includeHidden || !category.is_hidden),
    )
    .map((category) => ({
      hidden: category.is_hidden,
      id: category.category_id,
      label: category.name,
      searchLabel: category.fqn,
    }));

const tagOptions = (
  maps: LookupMaps,
  includeHidden: boolean,
): readonly EntityOption[] =>
  Array.from(maps.tagsById.values())
    .filter((tag) => !tag.tombstoned_at && (includeHidden || !tag.is_hidden))
    .map((tag) => ({
      hidden: tag.is_hidden,
      id: tag.tag_id,
      label: tag.name,
      searchLabel: tag.fqn,
    }));

const memberOptions = (
  maps: LookupMaps,
  selectedMemberId: number | undefined,
  includeHidden: boolean,
): readonly EntityOption[] =>
  Array.from(maps.membersById.values())
    .filter(
      (member) =>
        !member.tombstoned_at &&
        (includeHidden ||
          !member.is_hidden ||
          member.member_id === selectedMemberId),
    )
    .map((member) => ({
      hidden: member.is_hidden,
      id: member.member_id,
      label: member.name,
      searchLabel: member.name,
    }));

const EditDockEditor = ({
  action,
  blocked,
  maps,
  onApply,
  onCancel,
  selectedCount,
  skipSummary,
}: EditDockEditorProps) => {
  const [categoryId, setCategoryId] = useState<number>();
  const [includeHidden, setIncludeHidden] = useState(false);
  const [memberId, setMemberId] = useState<number>();
  const [memberOperation, setMemberOperation] = useState<"clear" | "set">(
    "set",
  );
  const [tagIds, setTagIds] = useState<readonly number[]>([]);
  const [tagOperation, setTagOperation] = useState<"add" | "remove">("add");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const applyButtonRef = useRef<HTMLButtonElement>(null);
  const restoreApplyFocusRef = useRef(false);
  const eligibleCount = Math.max(0, selectedCount - skipSummary.count);
  const update: EditDockUpdate | undefined =
    action === "category"
      ? categoryId === undefined
        ? undefined
        : { categoryId, kind: "category" }
      : action === "member"
        ? memberOperation === "clear"
          ? { kind: "member", memberId: null }
          : memberId === undefined
            ? undefined
            : { kind: "member", memberId }
        : tagIds.length === 0
          ? undefined
          : { kind: "tags", operation: tagOperation, tagIds };

  const apply = async () => {
    if (!update || saving || blocked) {
      return;
    }
    restoreApplyFocusRef.current =
      document.activeElement === applyButtonRef.current;
    setSaving(true);
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
    }
  };

  useEffect(() => {
    if (saving || !errorMessage || !restoreApplyFocusRef.current) {
      return;
    }
    restoreApplyFocusRef.current = false;
    window.requestAnimationFrame(() =>
      focusWithoutTooltip(applyButtonRef.current, { preventScroll: true }),
    );
  }, [errorMessage, saving]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) {
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
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!saving) {
        onCancel();
      }
    }
  };

  return (
    <section
      aria-label={`${actionTitle[action]} editor`}
      className="border-t-2 border-[var(--border-ink)] bg-[var(--band)] p-3"
      data-testid="edit-dock-editor"
      onKeyDown={handleKeyDown}
    >
      <div className="mb-3">
        <div>
          <h3 className="font-heading text-sm font-semibold uppercase">
            {actionTitle[action]}
          </h3>
          <p className="font-mono text-xs">
            {eligibleCount} will update · {skipSummary.count} require full edit
          </p>
          {skipSummary.count > 0 ? (
            <p className="font-mono text-xs text-[var(--color-class-adjustment-ink)]">
              {formatEditModeSkipReasons(skipSummary)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={includeHidden}
              disabled={saving || blocked}
              onCheckedChange={(checked) => setIncludeHidden(checked === true)}
            />
            <span className="font-mono text-sm">Include hidden</span>
          </label>
          {action === "category" ? (
            <EntityPicker
              autoFocus
              disabled={saving || blocked}
              id="edit-dock-category"
              label="Category"
              options={categoryOptions(maps, includeHidden)}
              value={categoryId}
              onChange={setCategoryId}
            />
          ) : null}
          {action === "tags" ? (
            <>
              <div
                className="flex gap-2"
                role="group"
                aria-label="Tag operation"
              >
                {(["add", "remove"] as const).map((operation) => (
                  <Button
                    key={operation}
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-pressed={tagOperation === operation}
                    className={
                      tagOperation === operation
                        ? "bg-[var(--table-header)]"
                        : undefined
                    }
                    disabled={saving || blocked}
                    onClick={() => setTagOperation(operation)}
                  >
                    {operation === "add" ? "Add" : "Remove"}
                  </Button>
                ))}
              </div>
              <EntityMultiPicker
                autoFocus
                disabled={saving || blocked}
                id="edit-dock-tags"
                label={`Tags to ${tagOperation}`}
                options={tagOptions(maps, includeHidden)}
                value={tagIds}
                onChange={setTagIds}
              />
            </>
          ) : null}
          {action === "member" ? (
            <>
              <div
                className="flex gap-2"
                role="group"
                aria-label="Member operation"
              >
                {(["set", "clear"] as const).map((operation) => (
                  <Button
                    key={operation}
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-pressed={memberOperation === operation}
                    className={
                      memberOperation === operation
                        ? "bg-[var(--table-header)]"
                        : undefined
                    }
                    disabled={saving || blocked}
                    onClick={() => setMemberOperation(operation)}
                  >
                    {operation === "set" ? "Set" : "Clear"}
                  </Button>
                ))}
              </div>
              {memberOperation === "set" ? (
                <EntityPicker
                  autoFocus
                  disabled={saving || blocked}
                  hierarchical={false}
                  id="edit-dock-member"
                  label="Member"
                  options={memberOptions(maps, memberId, includeHidden)}
                  value={memberId}
                  onChange={setMemberId}
                />
              ) : (
                <p className="font-body text-sm">
                  Clear member attribution from eligible records.
                </p>
              )}
            </>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Tooltip
            label={
              saving || blocked
                ? "Wait for the update to finish"
                : "Complete the editor first"
            }
            disabled={!saving && !blocked && Boolean(update)}
            focusable={saving || blocked || !update}
          >
            <Button
              ref={applyButtonRef}
              type="button"
              size="sm"
              disabled={saving || blocked || !update}
              onClick={() => void apply()}
            >
              Apply
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
      </div>
      {errorMessage ? (
        <p className="text-destructive mt-3 text-xs" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
};

interface TransactionEditDockProps {
  readonly activeEditor: EditDockAction | undefined;
  readonly blocked: boolean;
  readonly maps: LookupMaps;
  readonly onApply: (update: EditDockUpdate) => Promise<void>;
  readonly onEditorChange: (editor: EditDockAction | undefined) => void;
  readonly onSetReconciliation: (
    value: "reconciled" | "unreconciled",
  ) => Promise<void>;
  readonly onSetSettlement: (value: "pending" | "posted") => Promise<void>;
  readonly selectedCount: number;
  readonly selectedRowIndex: number;
  readonly restoreFocusToRow: boolean;
  readonly skipSummary: Readonly<Record<EditDockAction, EditModeSkipSummary>>;
}

export const TransactionEditDock = ({
  activeEditor,
  blocked,
  maps,
  onApply,
  onEditorChange,
  onSetReconciliation,
  onSetSettlement,
  selectedCount,
  selectedRowIndex,
  restoreFocusToRow,
  skipSummary,
}: TransactionEditDockProps) => {
  const categoryButtonRef = useRef<HTMLButtonElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const memberButtonRef = useRef<HTMLButtonElement>(null);
  const tagsButtonRef = useRef<HTMLButtonElement>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string>();
  const disabledReason =
    selectedCount === 0
      ? "Select one or more transactions"
      : blocked || statusSaving
        ? "Wait for the update to finish"
        : undefined;

  const openEditor = (action: EditDockAction) => onEditorChange(action);
  const closeEditor = () => {
    const closing = activeEditor;
    onEditorChange(undefined);
    window.setTimeout(() => {
      const browser = dockRef.current?.parentElement ?? null;
      const target =
        closing === "category"
          ? categoryButtonRef.current
          : closing === "tags"
            ? tagsButtonRef.current
            : memberButtonRef.current;
      if (
        !restoreFocusToRow &&
        target?.isConnected &&
        !target.disabled &&
        browser?.querySelector("[data-transaction-row][aria-selected='true']")
      ) {
        focusWithoutTooltip(target, { preventScroll: true });
        return;
      }
      focusTransactionRowFallback(
        browser,
        selectedRowIndex,
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
      );
    });
  };
  const applyStatus = async (
    action: () => Promise<void>,
    trigger: HTMLButtonElement,
  ) => {
    setStatusSaving(true);
    setStatusError(undefined);
    try {
      await action();
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "The API request failed.",
      );
    } finally {
      setStatusSaving(false);
      window.requestAnimationFrame(() =>
        focusWithoutTooltip(trigger, { preventScroll: true }),
      );
    }
  };

  return (
    <section
      ref={dockRef}
      aria-label="Transaction edit dock"
      className="bg-card h-full min-h-0 overflow-y-auto border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
      data-transaction-browser-edit-controls
      data-testid="transaction-edit-dock"
    >
      <div className="grid gap-3 p-3">
        {(["category", "tags", "member"] as const).map((action) => {
          const ref =
            action === "category"
              ? categoryButtonRef
              : action === "tags"
                ? tagsButtonRef
                : memberButtonRef;
          return (
            <div key={action} className="flex flex-col gap-1">
              <span className="font-heading text-xs font-semibold uppercase">
                {actionTitle[action]}
              </span>
              <Tooltip
                label={disabledReason ?? ""}
                disabled={!disabledReason}
                focusable={Boolean(disabledReason)}
              >
                <Button
                  ref={ref}
                  type="button"
                  variant="outline"
                  aria-expanded={activeEditor === action}
                  disabled={Boolean(disabledReason)}
                  onClick={() => openEditor(action)}
                >
                  {action === "member" ? (
                    <User aria-hidden="true" />
                  ) : (
                    <Bookmark aria-hidden="true" />
                  )}
                  {action === "category"
                    ? "Choose category"
                    : action === "tags"
                      ? "Add / remove"
                      : "Set / clear"}
                </Button>
              </Tooltip>
            </div>
          );
        })}
        <div className="flex flex-col gap-1">
          <span className="font-heading text-xs font-semibold uppercase">
            Status
          </span>
          <div className="grid grid-cols-1 gap-2">
            {[
              {
                action: () => onSetSettlement("pending"),
                icon: <Clock aria-hidden="true" />,
                label: "Pending",
              },
              {
                action: () => onSetSettlement("posted"),
                icon: <Check aria-hidden="true" />,
                label: "Posted",
              },
              {
                action: () => onSetReconciliation("reconciled"),
                icon: <Check aria-hidden="true" />,
                label: "Reconcile",
              },
              {
                action: () => onSetReconciliation("unreconciled"),
                icon: <Close aria-hidden="true" />,
                label: "Unreconcile",
              },
            ].map(({ action, icon, label }) => (
              <Tooltip
                key={label}
                label={disabledReason ?? ""}
                disabled={!disabledReason}
                focusable={Boolean(disabledReason)}
              >
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={Boolean(disabledReason)}
                  onClick={(event) =>
                    void applyStatus(action, event.currentTarget)
                  }
                >
                  {icon}
                  {label}
                </Button>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>
      {activeEditor ? (
        <EditDockEditor
          key={activeEditor}
          action={activeEditor}
          blocked={blocked}
          maps={maps}
          onApply={onApply}
          onCancel={closeEditor}
          selectedCount={selectedCount}
          skipSummary={skipSummary[activeEditor]}
        />
      ) : null}
      {statusError ? (
        <p
          className="text-destructive border-t-2 border-[var(--border-ink)] p-3 text-xs"
          role="alert"
        >
          {statusError}
        </p>
      ) : null}
    </section>
  );
};
