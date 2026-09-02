import { Bookmark, Check, Clock, Close, User } from "pixelarticons/react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import type { Transaction } from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { AccountDisplayLabel } from "./account-display-label";
import {
  type EditModeSkipSummary,
  formatEditModeSkipReasons,
} from "./edit-mode-prediction";
import {
  EntityMultiPicker,
  type EntityOption,
  EntityPicker,
} from "./entity-picker";
import {
  accountPickerLoader,
  accountPickerOption,
  categoryPickerLoader,
  memberPickerLoader,
  tagPickerLoader,
} from "./entity-picker-loaders";
import type { LookupMaps } from "./format";
import { focusTransactionRowFallback } from "./transaction-row-focus";

export type EditDockAction = "account" | "category" | "member" | "tags";

type ReferenceEditDockAction = Exclude<EditDockAction, "account">;

export type EditDockUpdate =
  | {
      readonly kind: "account";
      readonly replacementAccountId: number;
      readonly sourceAccountId: number;
    }
  | { readonly categoryId: number; readonly kind: "category" }
  | { readonly kind: "member"; readonly memberId: number | null }
  | {
      readonly kind: "tags";
      readonly operation: "add" | "remove";
      readonly tagIds: readonly number[];
    };

interface EditDockEditorProps {
  readonly action: ReferenceEditDockAction;
  readonly blocked: boolean;
  readonly onApply: (update: EditDockUpdate) => Promise<void>;
  readonly onCancel: () => void;
  readonly selectedCount: number;
  readonly skipSummary: EditModeSkipSummary;
}

const actionTitle: Record<EditDockAction, string> = {
  account: "Account Replace",
  category: "Category",
  member: "Member",
  tags: "Tags",
};

const EditDockEditor = ({
  action,
  blocked,
  onApply,
  onCancel,
  selectedCount,
  skipSummary,
}: EditDockEditorProps) => {
  const [categoryId, setCategoryId] = useState<number>();
  const [categoryOption, setCategoryOption] = useState<EntityOption>();
  const [includeHidden, setIncludeHidden] = useState(false);
  const [memberId, setMemberId] = useState<number>();
  const [memberOption, setMemberOption] = useState<EntityOption>();
  const [memberOperation, setMemberOperation] = useState<"clear" | "set">(
    "set",
  );
  const [tagIds, setTagIds] = useState<readonly number[]>([]);
  const [tagOptions, setTagOptions] = useState<readonly EntityOption[]>([]);
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
              loadKey={`record_assignment:${includeHidden}`}
              loadOptions={categoryPickerLoader({
                context: "record_assignment",
                include_hidden: includeHidden,
              })}
              options={categoryOption ? [categoryOption] : []}
              value={categoryId}
              onChange={(id, option) => {
                setCategoryId(id);
                setCategoryOption(option);
              }}
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
                loadKey={`record_assignment:${includeHidden}`}
                loadOptions={tagPickerLoader({
                  context: "record_assignment",
                  include_hidden: includeHidden,
                })}
                options={tagOptions}
                value={tagIds}
                onChange={(ids, options) => {
                  setTagIds(ids);
                  setTagOptions(options);
                }}
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
                  loadKey={`record_assignment:${includeHidden}`}
                  loadOptions={memberPickerLoader({
                    context: "record_assignment",
                    include_hidden: includeHidden,
                  })}
                  options={memberOption ? [memberOption] : []}
                  value={memberId}
                  onChange={(id, option) => {
                    setMemberId(id);
                    setMemberOption(option);
                  }}
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

interface AccountReplaceEditorProps {
  readonly blocked: boolean;
  readonly maps: LookupMaps;
  readonly onApply: (update: EditDockUpdate) => Promise<void>;
  readonly onCancel: () => void;
  readonly selectedTransactions: readonly Transaction[];
}

const AccountReplaceEditor = ({
  blocked,
  maps,
  onApply,
  onCancel,
  selectedTransactions,
}: AccountReplaceEditorProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [includeHidden, setIncludeHidden] = useState(false);
  const [replacementAccountId, setReplacementAccountId] = useState<number>();
  const [saving, setSaving] = useState(false);
  const [sourceAccountId, setSourceAccountId] = useState<number>();
  const [sourcePickerOption, setSourcePickerOption] = useState<EntityOption>();
  const [replacementPickerOption, setReplacementPickerOption] =
    useState<EntityOption>();
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const transactionIds = selectedTransactions.map(
    (transaction) => transaction.transaction_id,
  );
  const transactionIDsKey = transactionIds.join(",");
  const sourceLoadKey = `bulk_source:${includeHidden}:${transactionIDsKey}`;
  const replacementLoadKey = `bulk_replacement:${includeHidden}:${transactionIDsKey}:${sourceAccountId ?? ""}`;
  const sourceAccount =
    sourceAccountId === undefined
      ? undefined
      : maps.accountsById.get(sourceAccountId);
  const replacementAccount =
    replacementAccountId === undefined
      ? undefined
      : maps.accountsById.get(replacementAccountId);
  const affectedRecordCount =
    sourceAccountId === undefined
      ? 0
      : selectedTransactions.reduce(
          (count, transaction) =>
            count +
            transaction.records.filter(
              (record) => record.account_id === sourceAccountId,
            ).length,
          0,
        );
  const canReview =
    !blocked &&
    !saving &&
    sourceAccountId !== undefined &&
    replacementAccountId !== undefined;

  const confirm = async () => {
    if (
      !canReview ||
      sourceAccountId === undefined ||
      replacementAccountId === undefined
    ) {
      return;
    }
    setSaving(true);
    setErrorMessage(undefined);
    try {
      await onApply({
        kind: "account",
        replacementAccountId,
        sourceAccountId,
      });
      setConfirmOpen(false);
      onCancel();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-label="Account Replace editor"
      className="border-t-2 border-[var(--border-ink)] bg-[var(--band)] p-3"
      data-testid="edit-dock-editor"
      onKeyDown={(event) => {
        if (event.defaultPrevented) {
          return;
        }
        if (
          event.key === "Enter" &&
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          !confirmOpen
        ) {
          event.preventDefault();
          if (canReview) {
            setErrorMessage(undefined);
            setConfirmOpen(true);
          }
          return;
        }
        if (event.key === "Escape" && !saving && !confirmOpen) {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <h3 className="font-heading text-sm font-semibold uppercase">
        Account Replace
      </h3>
      <p className="font-body mt-1 text-sm">
        Choose an account present on every selected transaction, then a
        compatible replacement.
      </p>
      <div className="mt-3 space-y-3">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={includeHidden}
            disabled={saving || blocked}
            onCheckedChange={(checked) => setIncludeHidden(checked === true)}
          />
          <span className="font-mono text-sm">Include hidden</span>
        </label>
        <EntityPicker
          autoFocus
          disabled={saving || blocked}
          id="edit-dock-account-source"
          label="Common source account"
          loadKey={sourceLoadKey}
          loadOptions={accountPickerLoader({
            context: "bulk_source",
            include_hidden: includeHidden,
            transaction_ids: transactionIds,
          })}
          options={[
            ...[...maps.accountsById.values()].map(accountPickerOption),
            ...(sourcePickerOption ? [sourcePickerOption] : []),
          ]}
          value={sourceAccountId}
          onChange={(accountId, option) => {
            setSourceAccountId(accountId);
            setSourcePickerOption(option);
            setReplacementAccountId(undefined);
            setReplacementPickerOption(undefined);
          }}
        />
        <EntityPicker
          key={`replacement-${sourceAccountId ?? ""}`}
          disabled={saving || blocked || sourceAccountId === undefined}
          id="edit-dock-account-replacement"
          label="Compatible replacement account"
          loadKey={replacementLoadKey}
          loadOptions={
            sourceAccountId === undefined
              ? undefined
              : accountPickerLoader({
                  context: "bulk_replacement",
                  include_hidden: includeHidden,
                  source_account_id: sourceAccountId,
                  transaction_ids: transactionIds,
                })
          }
          options={[
            ...[...maps.accountsById.values()].map(accountPickerOption),
            ...(replacementPickerOption ? [replacementPickerOption] : []),
          ]}
          value={replacementAccountId}
          onChange={(accountId, option) => {
            setReplacementAccountId(accountId);
            setReplacementPickerOption(option);
          }}
        />
        <p className="font-mono text-xs">
          Search shows up to 6 common non-system accounts. Type to narrow.
        </p>
        {sourceAccountId === undefined ? null : (
          <p
            className="font-mono text-xs"
            data-testid="account-replace-prediction"
          >
            {affectedRecordCount} record{affectedRecordCount === 1 ? "" : "s"}
            {" across "}
            {selectedTransactions.length} transaction
            {selectedTransactions.length === 1 ? "" : "s"} will change.
          </p>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Tooltip
          label={
            blocked || saving
              ? "Wait for the update to finish"
              : sourceAccountId === undefined
                ? "Choose an account common to every selected transaction"
                : "Choose a replacement compatible with every affected record"
          }
          disabled={canReview}
          focusable={!canReview}
        >
          <Button
            ref={reviewButtonRef}
            type="button"
            size="sm"
            disabled={!canReview}
            onClick={() => {
              setErrorMessage(undefined);
              setConfirmOpen(true);
            }}
          >
            <Check aria-hidden="true" />
            Review replacement
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
      <ConfirmationDialog
        cancelPendingTooltip="Wait for account replacement to finish"
        confirmIcon={<Check aria-hidden="true" />}
        confirmLabel="Replace account"
        confirmPendingTooltip="Wait for account replacement to finish"
        confirmVariant="default"
        errorMessage={errorMessage}
        onConfirm={() => void confirm()}
        onOpenChange={(open) => {
          if (!saving) {
            setConfirmOpen(open);
            if (!open) {
              window.requestAnimationFrame(() =>
                focusWithoutTooltip(reviewButtonRef.current, {
                  preventScroll: true,
                }),
              );
            }
          }
        }}
        open={confirmOpen}
        pending={saving}
        pendingLabel="Replacing"
        title="Replace account?"
      >
        <p>
          Replace{" "}
          {sourceAccount ? (
            <AccountDisplayLabel
              account={sourceAccount}
              className="max-w-full align-bottom font-bold"
            />
          ) : sourcePickerOption ? (
            <strong>
              {sourcePickerOption.selectedLabel ?? sourcePickerOption.label}
            </strong>
          ) : null}{" "}
          with{" "}
          {replacementAccount ? (
            <AccountDisplayLabel
              account={replacementAccount}
              className="max-w-full align-bottom font-bold"
            />
          ) : replacementPickerOption ? (
            <strong>
              {replacementPickerOption.selectedLabel ??
                replacementPickerOption.label}
            </strong>
          ) : null}{" "}
          on every matching active record.
        </p>
        <p>
          {affectedRecordCount} record{affectedRecordCount === 1 ? "" : "s"}
          {" across "}
          {selectedTransactions.length} transaction
          {selectedTransactions.length === 1 ? "" : "s"} will change.
        </p>
      </ConfirmationDialog>
    </section>
  );
};

interface TransactionEditDockProps {
  readonly accountReplaceBlocked: boolean;
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
  readonly selectedTransactions: readonly Transaction[];
  readonly selectedRowIndex: number;
  readonly restoreFocusToRow: boolean;
  readonly skipSummary: Readonly<
    Record<ReferenceEditDockAction, EditModeSkipSummary>
  >;
}

export const TransactionEditDock = ({
  accountReplaceBlocked,
  activeEditor,
  blocked,
  maps,
  onApply,
  onEditorChange,
  onSetReconciliation,
  onSetSettlement,
  selectedCount,
  selectedTransactions,
  selectedRowIndex,
  restoreFocusToRow,
  skipSummary,
}: TransactionEditDockProps) => {
  const accountButtonRef = useRef<HTMLButtonElement>(null);
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
      const compactSheet = dockRef.current?.closest(
        "[data-mobile-parent-sheet]",
      );
      const browser =
        dockRef.current?.closest<HTMLElement>(
          "[data-transaction-browser='true']",
        ) ??
        dockRef.current?.parentElement ??
        null;
      const target =
        closing === "account"
          ? accountButtonRef.current
          : closing === "category"
            ? categoryButtonRef.current
            : closing === "tags"
              ? tagsButtonRef.current
              : memberButtonRef.current;
      if (
        target?.isConnected &&
        !target.disabled &&
        (compactSheet ||
          (!restoreFocusToRow &&
            browser?.querySelector(
              "[data-transaction-row][aria-selected='true']",
            )))
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
      className="bg-card roomy-shell:h-full roomy-shell:overflow-y-auto h-auto min-h-0 overflow-y-visible border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
      data-transaction-browser-edit-controls
      data-testid="transaction-edit-dock"
    >
      <div className="grid gap-3 p-3">
        {(["account", "category", "tags", "member"] as const).map((action) => {
          const actionDisabledReason =
            action === "account" && accountReplaceBlocked
              ? "Resolve or discard the inline amount conflict before replacing accounts"
              : disabledReason;
          const ref =
            action === "account"
              ? accountButtonRef
              : action === "category"
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
                label={actionDisabledReason ?? ""}
                disabled={!actionDisabledReason}
                focusable={Boolean(actionDisabledReason)}
              >
                <Button
                  ref={ref}
                  type="button"
                  variant="outline"
                  aria-expanded={activeEditor === action}
                  disabled={Boolean(actionDisabledReason)}
                  onClick={() => openEditor(action)}
                >
                  {action === "member" ? (
                    <User aria-hidden="true" />
                  ) : (
                    <Bookmark aria-hidden="true" />
                  )}
                  {action === "account"
                    ? "Replace account"
                    : action === "category"
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
      {activeEditor === "account" ? (
        <AccountReplaceEditor
          blocked={blocked || accountReplaceBlocked}
          maps={maps}
          onApply={onApply}
          onCancel={closeEditor}
          selectedTransactions={selectedTransactions}
        />
      ) : activeEditor ? (
        <EditDockEditor
          key={activeEditor}
          action={activeEditor}
          blocked={blocked}
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
