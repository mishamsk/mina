import { Check, Close, Plus, Trash } from "pixelarticons/react";
import { Dialog } from "radix-ui";
import { useMemo, useRef, useState } from "react";

import {
  apiErrorMessage,
  createLedgerTransactionTemplate,
  replaceLedgerTransactionTemplate,
  type TransactionTemplate,
  type TransactionTemplateRecordRequest,
  type TransactionTemplateWriteRequest,
} from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  EntityMultiPicker,
  type EntityOption,
  EntityPicker,
} from "@/features/ledger";
import type { LedgerLookupsSnapshot, TemplateEditorLaunch } from "@/store";

interface TemplateRecordDraft {
  readonly accountId: number | undefined;
  readonly amount: string;
  readonly categoryId: number | undefined;
  readonly currency: string;
  readonly id: number;
  readonly memberId: number | undefined;
  readonly memo: string;
  readonly tagIds: readonly number[];
}

interface TemplateDraft {
  readonly fqn: string;
  readonly records: readonly TemplateRecordDraft[];
}

interface TemplateEditorModalProps {
  readonly launch: TemplateEditorLaunch;
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly lookupsErrorMessage: string | undefined;
  readonly loadingLookups: boolean;
  readonly onClose: () => void;
  readonly onLookupsRetry: () => Promise<void>;
  readonly onSaved: (message: string, template: TransactionTemplate) => void;
  readonly open: boolean;
}

let nextRecordDraftId = 0;

const inputAmount = (amount: string | null | undefined): string => {
  if (!amount?.includes(".")) {
    return amount ?? "";
  }
  const compact = amount.replace(/0+$/, "").replace(/\.$/, "");
  return compact === "-0" ? "0" : compact;
};

const newRecordDraft = (
  record: TransactionTemplateRecordRequest = {},
): TemplateRecordDraft => ({
  accountId: record.account_id ?? undefined,
  amount: inputAmount(record.amount),
  categoryId: record.category_id ?? undefined,
  currency: record.currency ?? "",
  id: nextRecordDraftId++,
  memberId: record.member_id ?? undefined,
  memo: record.memo ?? "",
  tagIds: record.tag_ids ?? [],
});

const draftForLaunch = (launch: TemplateEditorLaunch): TemplateDraft => {
  const sourceRecords = launch.template
    ? launch.template.records
        .filter((record) => !record.tombstoned_at)
        .map((record) => ({
          account_id: record.account_id,
          amount: record.amount,
          category_id: record.category_id,
          currency: record.currency,
          member_id: record.member_id,
          memo: record.memo,
          tag_ids: record.tag_ids,
        }))
    : launch.initialRecords;
  return {
    fqn: launch.template?.fqn ?? "",
    records:
      sourceRecords.length > 0
        ? sourceRecords.map(newRecordDraft)
        : [newRecordDraft()],
  };
};

const validFqn = (value: string): boolean =>
  value.length > 0 &&
  value.trim() === value &&
  !value.startsWith(":") &&
  !value.endsWith(":") &&
  !value.includes("::") &&
  value.split(":").every((segment) => segment.trim().length > 0);

const normalizedAmount = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!/^-?\d{1,10}(\.\d{1,8})?$/.test(trimmed)) {
    return undefined;
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const paddedFraction = fraction.padEnd(8, "0");
  if (BigInt(`${whole}${paddedFraction}`) === 0n) {
    return undefined;
  }
  return `${negative ? "-" : ""}${whole}.${paddedFraction}`;
};

const normalizedCurrency = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.slice(0, 3).toUpperCase() === "C::"
    ? `C::${trimmed.slice(3).toUpperCase()}`
    : trimmed.toUpperCase();
};

const recordErrorKey = (index: number, field: string): string =>
  `records.${index}.${field}`;

const removeRecordErrors = (
  errors: Readonly<Record<string, string>>,
  removedIndex: number,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(errors).flatMap(([key, message]) => {
      const match = key.match(/^records\.(\d+)\.(.+)$/);
      if (!match) {
        return [[key, message]];
      }
      const recordIndex = Number(match[1]);
      if (recordIndex === removedIndex) {
        return [];
      }
      return [
        [
          recordIndex > removedIndex
            ? recordErrorKey(recordIndex - 1, match[2]!)
            : key,
          message,
        ],
      ];
    }),
  );

const errorControlId = (key: string): string => {
  const pickerMatch = key.match(
    /^records\.(\d+)\.(account|category|member|tags)$/,
  );
  return pickerMatch
    ? `template-record-${pickerMatch[1]}-${pickerMatch[2]}`
    : `template-${key.replaceAll(".", "-")}`;
};

const FieldError = ({ message }: { readonly message: string | undefined }) =>
  message ? (
    <p className="text-destructive mt-1 text-xs" role="alert">
      {message}
    </p>
  ) : null;

const entityOption = (
  entity: {
    readonly fqn?: string;
    readonly is_hidden: boolean;
    readonly name?: string;
  },
  id: number,
  metadata?: string,
): EntityOption => ({
  detail: entity.fqn,
  hidden: entity.is_hidden,
  id,
  label: entity.name ?? entity.fqn ?? "Unknown",
  metadata,
  searchLabel: entity.fqn ?? entity.name ?? "Unknown",
  selectedLabel: entity.fqn,
});

const optionsRetainingSelected = (
  options: readonly EntityOption[],
  selectedIds: readonly (number | undefined)[],
): readonly EntityOption[] => {
  const selected = new Set(selectedIds);
  return options.filter((option) => !option.hidden || selected.has(option.id));
};

export const TemplateEditorModal = ({
  launch,
  lookups,
  lookupsErrorMessage,
  loadingLookups,
  onClose,
  onLookupsRetry,
  onSaved,
  open,
}: TemplateEditorModalProps) => {
  const initialDraft = useMemo(() => draftForLaunch(launch), [launch]);
  const initialDraftSignature = useMemo(
    () => JSON.stringify(initialDraft),
    [initialDraft],
  );
  const addRecordButtonRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const discardRestoreTargetRef = useRef<HTMLElement | null>(null);
  const fqnRef = useRef<HTMLInputElement | null>(null);
  const lookupsRetryButtonRef = useRef<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [attentionFlash, setAttentionFlash] = useState(false);
  const [entranceFinished, setEntranceFinished] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string>();
  const [retainedLookupsErrorMessage, setRetainedLookupsErrorMessage] =
    useState<string>();
  const [retryingLookups, setRetryingLookups] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const editing = launch.template !== undefined;
  const dirty = JSON.stringify(draft) !== initialDraftSignature;
  const visibleLookupsErrorMessage =
    lookupsErrorMessage ?? retainedLookupsErrorMessage;
  const draftUsesReferences = draft.records.some(
    (record) =>
      record.accountId !== undefined ||
      record.categoryId !== undefined ||
      record.memberId !== undefined ||
      record.tagIds.length > 0,
  );
  const referencesRequired =
    loadingLookups ||
    (Boolean(visibleLookupsErrorMessage) && draftUsesReferences);
  const saveDisabled = saving || referencesRequired;
  const saveDisabledReason = saving
    ? "Wait for the template to finish saving."
    : loadingLookups
      ? "Wait for references to finish loading."
      : visibleLookupsErrorMessage && draftUsesReferences
        ? "Retry references before saving."
        : "";

  const flashAttention = () => {
    setEntranceFinished(true);
    setAttentionFlash(false);
    window.requestAnimationFrame(() => {
      setAttentionFlash(true);
    });
  };

  const retryLookups = async () => {
    if (retryingLookups) {
      return;
    }
    const editor = contentRef.current;
    let latestFocusedControl: HTMLElement | undefined;
    const rememberFocusedControl = (event: FocusEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target !== lookupsRetryButtonRef.current
      ) {
        latestFocusedControl = event.target;
      }
    };
    editor?.addEventListener("focusin", rememberFocusedControl);
    const focusAtRetryStart = document.activeElement;
    setRetainedLookupsErrorMessage(visibleLookupsErrorMessage);
    setRetryingLookups(true);
    window.requestAnimationFrame(() => {
      if (
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== focusAtRetryStart &&
        document.activeElement !== lookupsRetryButtonRef.current &&
        contentRef.current?.contains(document.activeElement)
      ) {
        return;
      }
      focusWithoutTooltip(lookupsRetryButtonRef.current, {
        preventScroll: true,
      });
    });
    try {
      await onLookupsRetry();
    } finally {
      editor?.removeEventListener("focusin", rememberFocusedControl);
      const retryButton = lookupsRetryButtonRef.current;
      const activeElement = document.activeElement;
      const focusTarget =
        activeElement instanceof HTMLElement &&
        editor?.contains(activeElement) &&
        activeElement !== retryButton
          ? activeElement
          : latestFocusedControl;
      setRetryingLookups(false);
      setRetainedLookupsErrorMessage(undefined);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (focusTarget?.isConnected) {
            focusWithoutTooltip(focusTarget, { preventScroll: true });
            return;
          }
          const currentRetryButton = lookupsRetryButtonRef.current;
          focusWithoutTooltip(
            currentRetryButton?.isConnected
              ? currentRetryButton
              : (fqnRef.current ?? contentRef.current),
            { preventScroll: true },
          );
        });
      });
    }
  };

  const options = useMemo(() => {
    const active = <
      T extends {
        readonly tombstoned_at?: string | null;
      },
    >(
      values: readonly T[],
    ): readonly T[] => values.filter((value) => !value.tombstoned_at);
    return {
      accounts: active(lookups?.accounts ?? []).map((account) =>
        entityOption(
          account,
          account.account_id,
          account.currency
            ? `${account.currency} · Single-currency`
            : "Multi-currency",
        ),
      ),
      categories: active(lookups?.categories ?? []).map((category) =>
        entityOption(category, category.category_id),
      ),
      members: active(lookups?.members ?? []).map((member) =>
        entityOption(member, member.member_id),
      ),
      tags: active(lookups?.tags ?? []).map((tag) =>
        entityOption(tag, tag.tag_id),
      ),
    };
  }, [lookups]);

  const patch = (value: Partial<TemplateDraft>) => {
    setDraft((current) => ({ ...current, ...value }));
    if ("fqn" in value) {
      setErrors((current) => {
        const next = { ...current };
        delete next.fqn;
        return next;
      });
    }
    setGeneralError(undefined);
  };

  const patchRecord = (index: number, value: Partial<TemplateRecordDraft>) => {
    setDraft((current) => ({
      ...current,
      records: current.records.map((record, recordIndex) =>
        recordIndex === index ? { ...record, ...value } : record,
      ),
    }));
    setErrors((current) => {
      const next = { ...current };
      if ("amount" in value) {
        delete next[recordErrorKey(index, "amount")];
      }
      if ("currency" in value) {
        delete next[recordErrorKey(index, "currency")];
      }
      if ("accountId" in value) {
        delete next[recordErrorKey(index, "account")];
      }
      if ("categoryId" in value) {
        delete next[recordErrorKey(index, "category")];
      }
      if ("memberId" in value) {
        delete next[recordErrorKey(index, "member")];
      }
      if ("tagIds" in value) {
        delete next[recordErrorKey(index, "tags")];
      }
      return next;
    });
    setGeneralError(undefined);
  };

  const removeRecord = (index: number) => {
    if (saving || draft.records.length === 1) {
      return;
    }
    const nearbyRecordIndex = Math.min(index, draft.records.length - 2);
    setDraft((current) => ({
      ...current,
      records: current.records.filter(
        (_candidate, candidateIndex) => candidateIndex !== index,
      ),
    }));
    setErrors((current) => removeRecordErrors(current, index));
    setGeneralError(undefined);
    window.requestAnimationFrame(() => {
      const nearbyAccount = document.getElementById(
        `template-record-${nearbyRecordIndex}-account`,
      );
      focusWithoutTooltip(
        nearbyAccount instanceof HTMLInputElement && !nearbyAccount.disabled
          ? nearbyAccount
          : addRecordButtonRef.current,
        { preventScroll: true },
      );
    });
  };

  const requestClose = (restoreTarget?: HTMLElement) => {
    if (saving) {
      return;
    }
    if (dirty) {
      discardRestoreTargetRef.current =
        restoreTarget ??
        (document.activeElement instanceof HTMLElement &&
        contentRef.current?.contains(document.activeElement)
          ? document.activeElement
          : contentRef.current);
      setDiscardOpen(true);
      return;
    }
    onClose();
  };

  const validate = (onlyKey?: string): Record<string, string> => {
    const next: Record<string, string> = {};
    const addError = (key: string, message: string) => {
      if (!onlyKey || onlyKey === key) {
        next[key] = message;
      }
    };
    const pickerQuery = (index: number, field: string): string => {
      const control = contentRef.current?.querySelector<HTMLInputElement>(
        `#template-record-${index}-${field}`,
      );
      return control?.value.trim() ?? "";
    };
    if (!validFqn(draft.fqn)) {
      addError(
        "fqn",
        "Enter a colon-separated template path with no empty segments.",
      );
    }
    draft.records.forEach((record, index) => {
      if (record.accountId === undefined && pickerQuery(index, "account")) {
        addError(
          recordErrorKey(index, "account"),
          "Select an account or clear the search text.",
        );
      }
      if (record.categoryId === undefined && pickerQuery(index, "category")) {
        addError(
          recordErrorKey(index, "category"),
          "Select a category or clear the search text.",
        );
      }
      const tagQuery = pickerQuery(index, "tags");
      if (tagQuery && (record.tagIds.length === 0 || !tagQuery.endsWith(":"))) {
        addError(
          recordErrorKey(index, "tags"),
          "Select a tag or clear the search text.",
        );
      }
      if (record.memberId === undefined && pickerQuery(index, "member")) {
        addError(
          recordErrorKey(index, "member"),
          "Select a member or clear the search text.",
        );
      }
      if (record.amount.trim() && !normalizedAmount(record.amount)) {
        addError(
          recordErrorKey(index, "amount"),
          "Enter a signed non-zero amount with up to 8 decimals, or leave it blank.",
        );
      }
      const currency = normalizedCurrency(record.currency);
      if (currency && !/^([A-Z]{3}|C::.+)$/.test(currency)) {
        addError(
          recordErrorKey(index, "currency"),
          "Use a 3-letter code or C:: crypto code, or leave it blank.",
        );
      }
    });
    return next;
  };

  const validateField = (key: string) => {
    const message = validate(key)[key];
    setErrors((current) => {
      const next = { ...current };
      if (message) {
        next[key] = message;
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const save = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || saving) {
      const firstErrorId = Object.keys(nextErrors)[0];
      window.requestAnimationFrame(() => {
        if (firstErrorId) {
          document.getElementById(errorControlId(firstErrorId))?.focus();
        }
      });
      return;
    }

    const body: TransactionTemplateWriteRequest = {
      fqn: draft.fqn.trim(),
      records: draft.records.map((record) => ({
        account_id: record.accountId ?? null,
        amount: record.amount.trim()
          ? (normalizedAmount(record.amount) ?? null)
          : null,
        category_id: record.categoryId ?? null,
        currency: normalizedCurrency(record.currency) || null,
        member_id: record.memberId ?? null,
        memo: record.memo.trim() || null,
        tag_ids: [...record.tagIds],
      })),
    };
    setSaving(true);
    setGeneralError(undefined);
    const result = launch.template
      ? await replaceLedgerTransactionTemplate(
          launch.template.transaction_template_id,
          body,
        )
      : await createLedgerTransactionTemplate(body);
    if (!result.data) {
      const message = apiErrorMessage(
        result.error,
        "Template could not be saved.",
      );
      const rowMatch = message.match(/records?\[(\d+)\].*?(amount|currency)/i);
      const apiErrors = rowMatch
        ? {
            [recordErrorKey(Number(rowMatch[1]), rowMatch[2]!.toLowerCase())]:
              message,
          }
        : message.toLocaleLowerCase().includes("fqn")
          ? { fqn: message }
          : {};
      setErrors(apiErrors);
      setGeneralError(Object.keys(apiErrors).length > 0 ? undefined : message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved(editing ? "Template updated." : "Template created.", result.data);
    onClose();
  };

  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !discardOpen) {
            requestClose();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            data-modal-overlay
            data-testid="template-editor-overlay"
            className="fixed inset-0 z-[70] bg-[color-mix(in_srgb,var(--frame),transparent_35%)]"
          />
          <Dialog.Content
            data-global-shortcut-blocking-overlay
            data-modal-overlay
            ref={contentRef}
            className={`bg-card fixed inset-0 z-[70] flex h-dvh w-screen flex-col overflow-hidden border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)] outline-none sm:top-1/2 sm:left-1/2 sm:h-[calc(100dvh-32px)] sm:w-[calc(100vw-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 lg:h-[calc(100dvh-48px)] lg:w-[calc(100vw-64px)] xl:h-[calc(100dvh-64px)] xl:w-[min(1200px,calc(100vw-96px))] ${
              attentionFlash
                ? "motion-safe:animate-[entry-attention-flash_120ms_steps(2)]"
                : entranceFinished
                  ? ""
                  : "motion-safe:animate-[entry-stage-in_120ms_steps(2)]"
            }`}
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              focusWithoutTooltip(
                launch.opener?.isConnected
                  ? launch.opener
                  : (document.querySelector<HTMLElement>(
                      "main [data-template-editor-restore-target]",
                    ) ??
                      document.querySelector<HTMLElement>(
                        "main [data-entry-modal-restore-target]",
                      ) ??
                      document.querySelector<HTMLElement>(
                        "a[href='/templates']",
                      )),
                { preventScroll: true },
              );
            }}
            onEscapeKeyDown={(event) => {
              if (
                event.target instanceof HTMLElement &&
                event.target.matches("[role='combobox'][aria-expanded='true']")
              ) {
                event.preventDefault();
              }
            }}
            onInteractOutside={(event) => {
              event.preventDefault();
              flashAttention();
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                if (!saveDisabled) {
                  void save();
                }
              }
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              window.requestAnimationFrame(() => {
                if (
                  document.activeElement instanceof HTMLElement &&
                  contentRef.current?.contains(document.activeElement)
                ) {
                  return;
                }
                focusWithoutTooltip(fqnRef.current ?? contentRef.current, {
                  preventScroll: true,
                });
              });
            }}
          >
            <header className="flex items-start justify-between gap-3 border-b-2 border-[var(--border-ink)] p-4">
              <div>
                <p className="text-muted-foreground font-heading text-xs font-semibold uppercase">
                  Transaction template
                </p>
                <Dialog.Title className="text-pixel text-base">
                  {editing ? "Edit template" : "New template"}
                </Dialog.Title>
                <p className="text-muted-foreground mt-1 text-sm">
                  Partial, date-free defaults. Records may be incomplete or
                  unbalanced.
                </p>
              </div>
              <Tooltip
                label={
                  saving ? "Template is being saved." : "Close template editor"
                }
                asChild
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Close template editor"
                  aria-disabled={saving ? "true" : undefined}
                  onClick={(event) => requestClose(event.currentTarget)}
                >
                  <Close aria-hidden="true" />
                </Button>
              </Tooltip>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {visibleLookupsErrorMessage ? (
                <div
                  className="border-destructive text-destructive mb-4 flex flex-wrap items-center justify-between gap-3 border-2 p-3 text-sm"
                  role="alert"
                >
                  <span>{visibleLookupsErrorMessage}</span>
                  <Tooltip
                    asChild
                    disabled={!retryingLookups}
                    label="References are being reloaded."
                  >
                    <Button
                      ref={lookupsRetryButtonRef}
                      type="button"
                      variant="outline"
                      aria-disabled={retryingLookups || undefined}
                      onClick={() => void retryLookups()}
                    >
                      Retry references
                    </Button>
                  </Tooltip>
                </div>
              ) : null}
              {generalError ? (
                <p
                  className="border-destructive text-destructive mb-4 border-2 p-3 text-sm"
                  role="alert"
                >
                  {generalError}
                </p>
              ) : null}
              <div className="mx-auto grid max-w-4xl gap-5">
                <div>
                  <label
                    className="grid gap-1 text-sm font-semibold"
                    htmlFor="template-fqn"
                  >
                    Template FQN
                    <input
                      ref={fqnRef}
                      id="template-fqn"
                      className="bg-card read-only:bg-muted h-9 border-2 border-[var(--border-ink)] px-2 font-mono font-normal shadow-[var(--shadow-pixel)]"
                      disabled={saving}
                      readOnly={editing}
                      value={draft.fqn}
                      onChange={(event) => patch({ fqn: event.target.value })}
                      onBlur={() => validateField("fqn")}
                    />
                  </label>
                  {editing ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Use Move or rename from the template tree to change this
                      path.
                    </p>
                  ) : null}
                  <FieldError message={errors.fqn} />
                </div>
                <section className="border-t-2 border-[var(--border-ink)] pt-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-heading text-sm font-bold uppercase">
                        Partial record defaults
                      </h2>
                      <p className="text-muted-foreground text-xs">
                        Every field is optional; each record can supply only the
                        defaults you want.
                      </p>
                    </div>
                    <Tooltip
                      disabled={!saving}
                      focusable={saving}
                      label="Template is being saved."
                    >
                      <Button
                        ref={addRecordButtonRef}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saving}
                        onClick={() =>
                          patch({
                            records: [...draft.records, newRecordDraft()],
                          })
                        }
                      >
                        <Plus aria-hidden="true" className="size-4" />
                        Add record
                      </Button>
                    </Tooltip>
                  </div>
                  <div className="grid gap-4" aria-label="Template records">
                    {draft.records.map((record, index) => (
                      <section
                        key={record.id}
                        className="border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)]"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="font-heading text-xs font-bold uppercase">
                            Record {index + 1}
                          </h3>
                          <Tooltip
                            label={
                              saving
                                ? "Template is being saved."
                                : draft.records.length === 1
                                  ? "Templates must retain at least one record."
                                  : `Remove record ${index + 1}`
                            }
                            asChild
                          >
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              aria-label={`Remove record ${index + 1}`}
                              aria-disabled={
                                saving || draft.records.length === 1
                                  ? "true"
                                  : undefined
                              }
                              onClick={() => {
                                removeRecord(index);
                              }}
                            >
                              <Trash aria-hidden="true" />
                            </Button>
                          </Tooltip>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div
                            onBlur={() =>
                              validateField(recordErrorKey(index, "account"))
                            }
                          >
                            <EntityPicker
                              key={`${record.id}-account-${lookups ? "ready" : "pending"}`}
                              id={`template-record-${index}-account`}
                              label="Account (optional)"
                              options={optionsRetainingSelected(
                                options.accounts,
                                [record.accountId],
                              )}
                              value={record.accountId}
                              disabled={saving || loadingLookups}
                              onChange={(accountId) =>
                                patchRecord(index, { accountId })
                              }
                            />
                            <FieldError
                              message={errors[recordErrorKey(index, "account")]}
                            />
                          </div>
                          <div
                            onBlur={() =>
                              validateField(recordErrorKey(index, "category"))
                            }
                          >
                            <EntityPicker
                              key={`${record.id}-category-${lookups ? "ready" : "pending"}`}
                              id={`template-record-${index}-category`}
                              label="Category (optional)"
                              options={optionsRetainingSelected(
                                options.categories,
                                [record.categoryId],
                              )}
                              value={record.categoryId}
                              disabled={saving || loadingLookups}
                              onChange={(categoryId) =>
                                patchRecord(index, { categoryId })
                              }
                            />
                            <FieldError
                              message={
                                errors[recordErrorKey(index, "category")]
                              }
                            />
                          </div>
                          <div>
                            <label
                              className="grid gap-1 text-sm font-semibold"
                              htmlFor={`template-records-${index}-amount`}
                            >
                              Amount (optional)
                              <input
                                id={`template-records-${index}-amount`}
                                className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono font-normal shadow-[var(--shadow-pixel)]"
                                placeholder="-12.34"
                                disabled={saving}
                                value={record.amount}
                                onChange={(event) =>
                                  patchRecord(index, {
                                    amount: event.target.value,
                                  })
                                }
                                onBlur={() =>
                                  validateField(recordErrorKey(index, "amount"))
                                }
                              />
                            </label>
                            <FieldError
                              message={errors[recordErrorKey(index, "amount")]}
                            />
                          </div>
                          <div>
                            <label
                              className="grid gap-1 text-sm font-semibold"
                              htmlFor={`template-records-${index}-currency`}
                            >
                              Currency (optional)
                              <input
                                id={`template-records-${index}-currency`}
                                className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono font-normal shadow-[var(--shadow-pixel)]"
                                placeholder="USD"
                                disabled={saving}
                                value={record.currency}
                                onChange={(event) =>
                                  patchRecord(index, {
                                    currency: event.target.value,
                                  })
                                }
                                onBlur={() =>
                                  validateField(
                                    recordErrorKey(index, "currency"),
                                  )
                                }
                              />
                            </label>
                            <FieldError
                              message={
                                errors[recordErrorKey(index, "currency")]
                              }
                            />
                          </div>
                          <div
                            onBlur={() =>
                              validateField(recordErrorKey(index, "tags"))
                            }
                          >
                            <EntityMultiPicker
                              id={`template-record-${index}-tags`}
                              label="Tags (optional)"
                              options={optionsRetainingSelected(
                                options.tags,
                                record.tagIds,
                              )}
                              value={record.tagIds}
                              disabled={saving || loadingLookups}
                              onChange={(tagIds) =>
                                patchRecord(index, { tagIds })
                              }
                            />
                            <FieldError
                              message={errors[recordErrorKey(index, "tags")]}
                            />
                          </div>
                          <div
                            onBlur={() =>
                              validateField(recordErrorKey(index, "member"))
                            }
                          >
                            <EntityPicker
                              key={`${record.id}-member-${lookups ? "ready" : "pending"}`}
                              hierarchical={false}
                              id={`template-record-${index}-member`}
                              label="Member (optional)"
                              options={optionsRetainingSelected(
                                options.members,
                                [record.memberId],
                              )}
                              placeholder="No member default"
                              value={record.memberId}
                              disabled={saving || loadingLookups}
                              onChange={(memberId) =>
                                patchRecord(index, { memberId })
                              }
                            />
                            <FieldError
                              message={errors[recordErrorKey(index, "member")]}
                            />
                          </div>
                          <label className="grid gap-1 text-sm font-semibold">
                            Memo (optional)
                            <input
                              className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-normal shadow-[var(--shadow-pixel)]"
                              disabled={saving}
                              value={record.memo}
                              onChange={(event) =>
                                patchRecord(index, { memo: event.target.value })
                              }
                            />
                          </label>
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              </div>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t-2 border-[var(--border-ink)] p-4">
              <Tooltip
                disabled={!saving}
                focusable={saving}
                label="Template is being saved."
              >
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={(event) => requestClose(event.currentTarget)}
                >
                  Cancel
                </Button>
              </Tooltip>
              <Tooltip
                disabled={!saveDisabled}
                focusable={saveDisabled}
                label={saveDisabledReason}
              >
                <Button
                  type="button"
                  disabled={saveDisabled}
                  onClick={() => void save()}
                >
                  <Check aria-hidden="true" />
                  {saving
                    ? "Saving"
                    : editing
                      ? "Save template"
                      : "Create template"}
                </Button>
              </Tooltip>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ConfirmationDialog
        confirmIcon={<Trash aria-hidden="true" />}
        confirmLabel="Discard changes"
        errorMessage={undefined}
        open={discardOpen}
        pending={false}
        pendingLabel="Discarding"
        title="Discard template changes?"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
        onOpenChange={(nextOpen) => {
          setDiscardOpen(nextOpen);
          if (!nextOpen) {
            const restoreTarget = discardRestoreTargetRef.current;
            discardRestoreTargetRef.current = null;
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                focusWithoutTooltip(
                  restoreTarget?.isConnected
                    ? restoreTarget
                    : contentRef.current,
                  { preventScroll: true },
                );
              });
            });
          }
        }}
      >
        <p>Your unsaved template changes will be lost.</p>
      </ConfirmationDialog>
    </>
  );
};
