import { Check, Close, Plus, Trash } from "pixelarticons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  apiErrorMessage,
  createRecurringDefinition,
  fetchAccountingHistoryRange,
  getRecurringDefinition,
  pauseRecurringDefinition,
  type RecurringDefinition,
  type RecurringDefinitionRecordRequest,
  type RecurringDefinitionReplaceRequest,
  type RecurringDefinitionWriteRequest,
  replaceRecurringDefinition,
  resumeRecurringDefinition,
} from "@/api";
import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  accountPickerLoader,
  accountPickerOption,
  categoryPickerLoader,
  categoryPickerOption,
  EntityMultiPicker,
  type EntityOption,
  EntityPicker,
  loadAccountOptionsByIds,
  loadCategoryOptionsByIds,
  loadMemberOptionsByIds,
  loadTagOptionsByIds,
  memberPickerLoader,
  memberPickerOption,
  tagPickerLoader,
  tagPickerOption,
  useLedgerLookupsResource,
  useResolvedEntityOptions,
} from "@/features/ledger";
import { cn } from "@/lib/utils";
import { localTodayISODate } from "@/utils/date";

type ScheduleKind = "day_of_month" | "interval" | "last_day_of_month";
type IntervalUnit = "DAY" | "WEEK" | "MONTH" | "YEAR";

interface DefinitionRecordDraft {
  readonly accountId: number | undefined;
  readonly amount: string;
  readonly categoryId: number | undefined;
  readonly currency: string;
  readonly id: number;
  readonly memberId: number | undefined;
  readonly memo: string;
  readonly tagIds: readonly number[];
}

interface DefinitionDraft {
  readonly anchorDate: string;
  readonly day: number;
  readonly every: number;
  readonly fqn: string;
  readonly paused: boolean;
  readonly records: readonly DefinitionRecordDraft[];
  readonly scheduleKind: ScheduleKind;
  readonly unit: IntervalUnit;
}

interface ReplacementBaseline {
  readonly anchorDate: string;
  readonly etag: string;
}

interface DefinitionEditorPanelProps {
  readonly definition: RecurringDefinition | undefined;
  readonly initialRecords?: readonly RecurringDefinitionRecordRequest[];
  readonly onClose: () => void;
  readonly onNotice: (message: string, tone?: "error" | "success") => void;
  readonly onSaved: () => unknown;
  readonly open: boolean;
  readonly resolveReturnFocusTo: () => HTMLElement | undefined;
}

let nextDraftRecordId = 0;

const newRecord = (): DefinitionRecordDraft => ({
  accountId: undefined,
  amount: "",
  categoryId: undefined,
  currency: "USD",
  id: nextDraftRecordId++,
  memberId: undefined,
  memo: "",
  tagIds: [],
});

const scheduleValue = (definition: RecurringDefinition, key: string): unknown =>
  definition.schedule_rule[key];

const intervalUnit = (value: unknown): IntervalUnit =>
  value === "DAY" || value === "WEEK" || value === "MONTH" || value === "YEAR"
    ? value
    : "MONTH";

const definitionDraft = (
  definition: RecurringDefinition | undefined,
  initialRecords: readonly RecurringDefinitionRecordRequest[] = [],
): DefinitionDraft => {
  const kind = definition ? scheduleValue(definition, "kind") : "interval";
  const day = definition ? scheduleValue(definition, "day") : undefined;
  const every = definition ? scheduleValue(definition, "every") : undefined;
  const scheduleKind: ScheduleKind =
    kind === "day_of_month" || kind === "last_day_of_month" ? kind : "interval";
  return {
    anchorDate: definition?.anchor_date ?? localTodayISODate(),
    day: typeof day === "number" ? day : 1,
    every: typeof every === "number" ? every : 1,
    fqn: definition?.fqn ?? "",
    paused: Boolean(definition?.paused_at),
    records:
      definition?.records.map((record) => ({
        accountId: record.account_id,
        amount: record.amount,
        categoryId: record.category_id ?? undefined,
        currency: record.currency,
        id: nextDraftRecordId++,
        memberId: record.member_id ?? undefined,
        memo: record.memo ?? "",
        tagIds: record.tag_ids,
      })) ??
      (initialRecords.length > 0
        ? initialRecords.map((record) => ({
            accountId: record.account_id ?? undefined,
            amount: record.amount ?? "",
            categoryId: record.category_id ?? undefined,
            currency: record.currency ?? "",
            id: nextDraftRecordId++,
            memberId: record.member_id ?? undefined,
            memo: record.memo ?? "",
            tagIds: record.tag_ids ?? [],
          }))
        : [newRecord(), newRecord()]),
    scheduleKind,
    unit: intervalUnit(
      definition ? scheduleValue(definition, "unit") : undefined,
    ),
  };
};

const signedAmountMantissa = (value: string): bigint | undefined => {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d{1,8})?$/.test(trimmed)) return undefined;
  const negative = trimmed.startsWith("-");
  const [whole, fraction = ""] = (negative ? trimmed.slice(1) : trimmed).split(
    ".",
  );
  const mantissa = BigInt(
    `${whole}.${fraction.padEnd(8, "0")}`.replace(".", ""),
  );
  return mantissa === 0n ? undefined : negative ? -mantissa : mantissa;
};

const normalizedAmount = (value: string): string | undefined => {
  const mantissa = signedAmountMantissa(value);
  if (mantissa === undefined) return undefined;
  const negative = mantissa < 0n;
  const absolute = negative ? -mantissa : mantissa;
  const whole = absolute / 100000000n;
  const fraction = (absolute % 100000000n).toString().padStart(8, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
};

const normalizedCurrency = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.slice(0, 3).toUpperCase() === "C::"
    ? `C::${trimmed.slice(3)}`
    : trimmed.toUpperCase();
};

const normalizedCurrencyInput = (value: string): string =>
  value.slice(0, 3).toUpperCase() === "C::"
    ? `C::${value.slice(3)}`
    : value.toUpperCase();

const recordErrorKey = (row: number, field: string) =>
  `records.${row}.${field}`;

const FieldError = ({ message }: { readonly message: string | undefined }) =>
  message ? <p className="text-destructive mt-1 text-xs">{message}</p> : null;

export const DefinitionEditorPanel = ({
  definition,
  initialRecords = [],
  onClose,
  onNotice,
  onSaved,
  open,
  resolveReturnFocusTo,
}: DefinitionEditorPanelProps) => {
  const lookups = useLedgerLookupsResource();
  const panelRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<DefinitionDraft>(() =>
    definitionDraft(definition, initialRecords),
  );
  const [replacementBaseline, setReplacementBaseline] = useState<
    ReplacementBaseline | undefined
  >(() =>
    definition
      ? { anchorDate: definition.anchor_date, etag: definition.etag }
      : undefined,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [serverToday, setServerToday] = useState<string>();
  const [serverTodayLoading, setServerTodayLoading] = useState(
    Boolean(definition),
  );

  useEffect(() => {
    if (!definition) {
      return;
    }
    let active = true;
    void fetchAccountingHistoryRange().then((result) => {
      if (!active) {
        return;
      }
      setServerToday(result.data?.end_date);
      setServerTodayLoading(false);
    });
    return () => {
      active = false;
    };
  }, [definition]);

  const closeEditor = useCallback(
    (monitorSavedTransaction = false) => {
      const closingPanel = panelRef.current;
      onClose();
      window.requestAnimationFrame(() => {
        let restoredTarget: HTMLElement | undefined;
        function stopMonitoring() {
          observer.disconnect();
          window.removeEventListener("focusin", stopAfterFocusMoves, true);
        }
        function stopAfterFocusMoves() {
          if (
            document.activeElement !== document.body &&
            document.activeElement !== restoredTarget
          ) {
            stopMonitoring();
          }
        }
        const restoreFocus = (): boolean => {
          if (
            document.activeElement !== document.body &&
            document.activeElement !== restoredTarget &&
            !closingPanel?.contains(document.activeElement)
          ) {
            return false;
          }
          if (restoredTarget?.isConnected) {
            return true;
          }
          const target = resolveReturnFocusTo();
          if (!target?.isConnected) {
            return true;
          }
          restoredTarget = target;
          focusWithoutTooltip(target, { preventScroll: true });
          return true;
        };
        const initialTarget = resolveReturnFocusTo();
        if (!initialTarget) {
          return;
        }
        const monitorTransactionTarget = Boolean(
          initialTarget.closest(
            "[data-transaction-row='true'], [data-testid='transaction-detail-panel']",
          ),
        );
        if (initialTarget.isConnected && !monitorTransactionTarget) {
          restoreFocus();
          return;
        }
        const observer = new MutationObserver(() => {
          const transactionRefreshPending = Boolean(
            document.querySelector("[data-transaction-refresh-pending='true']"),
          );
          if (
            !restoreFocus() ||
            (restoredTarget?.isConnected &&
              document.activeElement === restoredTarget &&
              (!monitorSavedTransaction || !transactionRefreshPending))
          ) {
            stopMonitoring();
          }
        });
        observer.observe(document.body, {
          attributeFilter: ["data-transaction-refresh-pending"],
          attributes: true,
          childList: true,
          subtree: true,
        });
        window.addEventListener("focusin", stopAfterFocusMoves, true);
        const transactionRefreshPending = Boolean(
          document.querySelector("[data-transaction-refresh-pending='true']"),
        );
        if (
          !restoreFocus() ||
          (restoredTarget?.isConnected &&
            document.activeElement === restoredTarget &&
            (!monitorSavedTransaction || !transactionRefreshPending))
        ) {
          stopMonitoring();
        }
      });
    },
    [onClose, resolveReturnFocusTo],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      const openModal = document.querySelector<HTMLElement>(
        "[role='alertdialog'], [role='dialog'][aria-modal='true']",
      );
      const openCompactToolbarLayer = document.querySelector<HTMLElement>(
        "[data-mobile-parent-sheet][data-state='open'], [data-mobile-controls-layer][data-state='open']",
      );
      if (openModal || openCompactToolbarLayer) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!saving) {
        closeEditor();
      }
    };

    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [closeEditor, open, saving]);

  const categoryFqnById = useMemo(
    () =>
      new Map(
        (lookups.snapshot?.categories ?? []).map((category) => [
          category.category_id,
          category.fqn,
        ]),
      ),
    [lookups.snapshot],
  );
  const [accountPickerOptionsById, setAccountPickerOptionsById] = useState(
    new Map<number, EntityOption>(),
  );
  const fallbackAccountOptions = useMemo(
    () => (lookups.snapshot?.accounts ?? []).map(accountPickerOption),
    [lookups.snapshot],
  );
  const fallbackCategoryOptions = useMemo(
    () => (lookups.snapshot?.categories ?? []).map(categoryPickerOption),
    [lookups.snapshot],
  );
  const fallbackMemberOptions = useMemo(
    () => (lookups.snapshot?.members ?? []).map(memberPickerOption),
    [lookups.snapshot],
  );
  const fallbackTagOptions = useMemo(
    () => (lookups.snapshot?.tags ?? []).map(tagPickerOption),
    [lookups.snapshot],
  );
  const accountOptions = useResolvedEntityOptions(
    draft.records.flatMap((row) =>
      row.accountId === undefined ? [] : [row.accountId],
    ),
    useMemo(
      () => [...fallbackAccountOptions, ...accountPickerOptionsById.values()],
      [accountPickerOptionsById, fallbackAccountOptions],
    ),
    loadAccountOptionsByIds,
    !lookups.snapshot && !lookups.errorMessage,
  );
  const categoryOptions = useResolvedEntityOptions(
    draft.records.flatMap((row) =>
      row.categoryId === undefined ? [] : [row.categoryId],
    ),
    fallbackCategoryOptions,
    loadCategoryOptionsByIds,
    !lookups.snapshot && !lookups.errorMessage,
  );
  const memberOptions = useResolvedEntityOptions(
    draft.records.flatMap((row) =>
      row.memberId === undefined ? [] : [row.memberId],
    ),
    fallbackMemberOptions,
    loadMemberOptionsByIds,
    !lookups.snapshot && !lookups.errorMessage,
  );
  const tagOptions = useResolvedEntityOptions(
    draft.records.flatMap((row) => row.tagIds),
    fallbackTagOptions,
    loadTagOptionsByIds,
    !lookups.snapshot && !lookups.errorMessage,
  );

  const balances = useMemo(() => {
    const values = new Map<string, bigint>();
    for (const row of draft.records) {
      const mantissa = signedAmountMantissa(row.amount);
      const currency = normalizedCurrency(row.currency);
      if (mantissa !== undefined && /^([A-Z]{3}|C::.+)$/.test(currency)) {
        values.set(currency, (values.get(currency) ?? 0n) + mantissa);
      }
    }
    return [...values.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [draft.records]);

  const validate = (candidate: DefinitionDraft): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!candidate.fqn.trim()) next.fqn = "Definition name is required.";
    if (!candidate.anchorDate) next.anchorDate = "Anchor date is required.";
    if (
      definition &&
      replacementBaseline &&
      serverToday &&
      candidate.anchorDate !== replacementBaseline.anchorDate &&
      candidate.anchorDate < serverToday
    )
      next.anchorDate = "A changed anchor date cannot be in the past.";
    if (
      candidate.scheduleKind === "interval" &&
      (!Number.isInteger(candidate.every) || candidate.every < 1)
    )
      next.every = "Interval must be at least 1.";
    if (
      candidate.scheduleKind === "day_of_month" &&
      (!Number.isInteger(candidate.day) ||
        candidate.day < 1 ||
        candidate.day > 31)
    )
      next.day = "Day must be between 1 and 31.";
    if (candidate.records.length < 2)
      next.records = "At least two records are required.";
    candidate.records.forEach((row, index) => {
      if (!row.accountId)
        next[recordErrorKey(index, "account")] = "Account is required.";
      const accountType =
        lookups.snapshot?.accounts.find(
          (account) => account.account_id === row.accountId,
        )?.account_type ??
        accountOptions.find((option) => option.id === row.accountId)
          ?.accountType;
      if (accountType === "flow" && !row.categoryId)
        next[recordErrorKey(index, "category")] = "Category is required.";
      if (accountType && accountType !== "flow" && row.categoryId)
        next[recordErrorKey(index, "category")] =
          "Only flow records can have a category.";
      if (!normalizedAmount(row.amount))
        next[recordErrorKey(index, "amount")] =
          "Enter a signed non-zero amount with up to 8 decimals.";
      if (!/^([A-Z]{3}|C::.+)$/.test(normalizedCurrency(row.currency)))
        next[recordErrorKey(index, "currency")] =
          "Use a 3-letter code or C:: crypto code.";
    });
    if (balances.length === 0 || balances.some(([, amount]) => amount !== 0n))
      next.balance = "Every currency must balance to zero.";
    return next;
  };

  const patch = (value: Partial<DefinitionDraft>) => {
    setDraft((current) => ({ ...current, ...value }));
    setGeneralError(undefined);
  };
  const patchRow = (index: number, value: Partial<DefinitionRecordDraft>) => {
    setDraft((current) => ({
      ...current,
      records: current.records.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...value } : row,
      ),
    }));
    setGeneralError(undefined);
  };

  const save = async () => {
    const nextErrors = validate(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || saving) return;
    setSaving(true);
    setGeneralError(undefined);
    const schedule_rule =
      draft.scheduleKind === "interval"
        ? { every: draft.every, kind: "interval", unit: draft.unit, version: 1 }
        : draft.scheduleKind === "day_of_month"
          ? { day: draft.day, kind: "day_of_month", version: 1 }
          : { kind: "last_day_of_month", version: 1 };
    const records: RecurringDefinitionRecordRequest[] = draft.records.map(
      (row) => ({
        account_id: row.accountId!,
        amount: normalizedAmount(row.amount)!,
        category_id: row.categoryId ?? null,
        currency: normalizedCurrency(row.currency),
        member_id: row.memberId ?? null,
        memo: row.memo.trim() || null,
        tag_ids: [...row.tagIds],
      }),
    );
    const body = {
      fqn: draft.fqn.trim(),
      records,
      schedule_rule,
    };
    const result =
      definition && replacementBaseline
        ? await replaceRecurringDefinition({
            body: {
              ...body,
              anchor_date:
                draft.anchorDate === replacementBaseline.anchorDate
                  ? null
                  : draft.anchorDate,
            } satisfies RecurringDefinitionReplaceRequest,
            headers: { "If-Match": replacementBaseline.etag },
            path: {
              recurring_definition_id: definition.recurring_definition_id,
            },
          })
        : await createRecurringDefinition({
            body: {
              ...body,
              anchor_date: draft.anchorDate,
            } satisfies RecurringDefinitionWriteRequest,
          });
    if (!result.data) {
      if (
        definition &&
        replacementBaseline &&
        result.response?.status === 412
      ) {
        const anchorWasChanged =
          draft.anchorDate !== replacementBaseline.anchorDate;
        const latest = await getRecurringDefinition({
          path: {
            recurring_definition_id: definition.recurring_definition_id,
          },
        });
        if (latest.data) {
          setReplacementBaseline({
            anchorDate: latest.data.anchor_date,
            etag: latest.data.etag,
          });
          if (!anchorWasChanged) {
            setDraft((current) => ({
              ...current,
              anchorDate: latest.data.anchor_date,
            }));
          }
          setErrors({});
          setGeneralError(
            "This recurring definition changed elsewhere. Your draft is preserved against the latest version; review it and save again.",
          );
        } else {
          setGeneralError(
            `This recurring definition changed elsewhere, but the latest version could not be loaded. Your draft is preserved; try again. ${apiErrorMessage(latest.error)}`,
          );
        }
        setSaving(false);
        return;
      }
      const message = apiErrorMessage(
        result.error,
        "Definition could not be saved.",
      );
      const rowMatch = message.match(
        /records?\[(\d+)\].*?(account|category|amount|currency|member|tag)/i,
      );
      const anchorError = /anchor[_ ]date|anchor/i.test(message);
      setErrors(
        rowMatch
          ? {
              [recordErrorKey(
                Number(rowMatch[1]),
                (rowMatch[2] ?? "amount").toLowerCase(),
              )]: message,
            }
          : anchorError
            ? { anchorDate: message }
            : {},
      );
      setGeneralError(message);
      setSaving(false);
      return;
    }
    if (definition) {
      setReplacementBaseline({
        anchorDate: result.data.anchor_date,
        etag: result.data.etag,
      });
    }
    const shouldPause = draft.paused;
    const isPaused = Boolean(result.data.paused_at);
    if (shouldPause !== isPaused) {
      const lifecycle = shouldPause
        ? await pauseRecurringDefinition({
            path: {
              recurring_definition_id: result.data.recurring_definition_id,
            },
          })
        : await resumeRecurringDefinition({
            path: {
              recurring_definition_id: result.data.recurring_definition_id,
            },
          });
      if (!lifecycle.data) {
        setGeneralError(
          apiErrorMessage(
            lifecycle.error,
            "Definition saved, but its paused state could not be updated.",
          ),
        );
        setSaving(false);
        return;
      }
    }
    await onSaved();
    onNotice(definition ? "Definition updated." : "Definition created.");
    setSaving(false);
    closeEditor(true);
  };

  if (!open) return null;
  return (
    <aside
      ref={panelRef}
      className="bg-card compact-shell:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] compact-shell:h-auto fixed top-0 right-0 z-50 flex h-svh w-[min(44rem,calc(100vw-1rem))] flex-col border-l-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
      data-recurring-definition-editor
      aria-label={
        definition ? "Edit recurring definition" : "New recurring definition"
      }
      tabIndex={-1}
    >
      <header className="flex items-center justify-between border-b-2 border-[var(--border-ink)] p-4">
        <div>
          <p className="font-heading text-base font-bold uppercase">
            {definition ? "Edit definition" : "New definition"}
          </p>
          <p className="text-muted-foreground text-sm">
            A complete balanced transaction schedule.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Close definition editor"
          onClick={() => closeEditor()}
        >
          <Close aria-hidden="true" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {lookups.errorMessage ? (
          <p className="text-destructive mb-3 text-sm">
            {lookups.errorMessage}
          </p>
        ) : null}
        {generalError ? (
          <p
            className="border-destructive text-destructive mb-3 border-2 p-2 text-sm"
            role="alert"
          >
            {generalError}
          </p>
        ) : null}
        <div className="grid gap-4">
          <label className="grid gap-1 font-mono text-sm">
            Definition FQN
            <input
              className="border-input bg-card h-9 border px-2"
              value={draft.fqn}
              onChange={(event) => patch({ fqn: event.target.value })}
            />
          </label>
          <FieldError message={errors.fqn} />
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 font-mono text-sm">
              Schedule
              <select
                className="border-input bg-card h-9 border px-2"
                value={draft.scheduleKind}
                onChange={(event) =>
                  patch({ scheduleKind: event.target.value as ScheduleKind })
                }
              >
                <option value="interval">Interval</option>
                <option value="day_of_month">Day of month</option>
                <option value="last_day_of_month">Last day of month</option>
              </select>
            </label>
            <label className="grid gap-1 font-mono text-sm">
              Anchor date
              <input
                className="border-input bg-card h-9 border px-2"
                type="date"
                value={draft.anchorDate}
                onChange={(event) => patch({ anchorDate: event.target.value })}
              />
            </label>
          </div>
          <FieldError message={errors.anchorDate} />
          {draft.scheduleKind === "interval" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 font-mono text-sm">
                Every
                <input
                  className="border-input bg-card h-9 border px-2"
                  min={1}
                  type="number"
                  value={draft.every}
                  onChange={(event) =>
                    patch({ every: Number(event.target.value) })
                  }
                />
              </label>
              <label className="grid gap-1 font-mono text-sm">
                Unit
                <select
                  className="border-input bg-card h-9 border px-2"
                  value={draft.unit}
                  onChange={(event) =>
                    patch({ unit: event.target.value as IntervalUnit })
                  }
                >
                  <option value="DAY">Days</option>
                  <option value="WEEK">Weeks</option>
                  <option value="MONTH">Months</option>
                  <option value="YEAR">Years</option>
                </select>
              </label>
            </div>
          ) : null}
          {draft.scheduleKind === "day_of_month" ? (
            <label className="grid gap-1 font-mono text-sm">
              Day of month
              <input
                className="border-input bg-card h-9 border px-2"
                min={1}
                max={31}
                type="number"
                value={draft.day}
                onChange={(event) => patch({ day: Number(event.target.value) })}
              />
            </label>
          ) : null}
          <FieldError message={errors.every ?? errors.day} />
          <label className="flex items-center gap-2 font-mono text-sm">
            <input
              type="checkbox"
              checked={draft.paused}
              onChange={(event) => patch({ paused: event.target.checked })}
            />
            Create paused
          </label>
          <div className="border-t-2 border-[var(--border-ink)] pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-heading text-sm font-bold uppercase">
                Balanced records
              </h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  patch({ records: [...draft.records, newRecord()] })
                }
              >
                <Plus aria-hidden="true" />
                Add record
              </Button>
            </div>
            <FieldError message={errors.records ?? errors.balance} />
            <div className="grid gap-3" aria-label="Definition records">
              {draft.records.map((row, index) => (
                <section
                  key={row.id}
                  className="border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-chip)]"
                >
                  <div className="mb-2 flex justify-between">
                    <h3 className="font-heading text-xs font-bold uppercase">
                      Record {index + 1}
                    </h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={`Remove record ${index + 1}`}
                      onClick={() =>
                        patch({
                          records: draft.records.filter(
                            (_row, rowIndex) => rowIndex !== index,
                          ),
                        })
                      }
                    >
                      <Trash aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-full">
                      <EntityPicker
                        id={`recurring-record-${row.id}-account`}
                        label="Account"
                        loadOptions={accountPickerLoader({
                          context: "record_assignment",
                        })}
                        options={accountOptions}
                        onLoadedOptions={(options) => {
                          setAccountPickerOptionsById((current) => {
                            const next = new Map(current);
                            for (const option of options) {
                              next.set(option.id, option);
                            }
                            return next;
                          });
                        }}
                        value={row.accountId}
                        onChange={(accountId, selectedOption) => {
                          if (selectedOption) {
                            setAccountPickerOptionsById((current) => {
                              const next = new Map(current);
                              next.set(selectedOption.id, selectedOption);
                              return next;
                            });
                          }
                          const account = lookups.snapshot?.accounts.find(
                            (item) => item.account_id === accountId,
                          );
                          const pickerOption =
                            selectedOption ??
                            (accountId === undefined
                              ? undefined
                              : accountPickerOptionsById.get(accountId));
                          const accountType =
                            account?.account_type ?? pickerOption?.accountType;
                          patchRow(index, {
                            accountId,
                            categoryId:
                              accountType && accountType !== "flow"
                                ? undefined
                                : row.categoryId,
                            currency:
                              account?.currency ??
                              pickerOption?.currency ??
                              row.currency,
                          });
                        }}
                      />
                      <FieldError
                        message={errors[recordErrorKey(index, "account")]}
                      />
                    </div>
                    <label className="grid gap-1 font-mono text-xs">
                      Amount
                      <input
                        className="border-input bg-card h-9 border px-2"
                        placeholder="-12.34"
                        value={row.amount}
                        onChange={(event) =>
                          patchRow(index, { amount: event.target.value })
                        }
                      />
                    </label>
                    <label className="grid gap-1 font-mono text-xs">
                      Currency
                      <input
                        className="border-input bg-card h-9 border px-2"
                        value={row.currency}
                        onChange={(event) =>
                          patchRow(index, {
                            currency: normalizedCurrencyInput(
                              event.target.value,
                            ),
                          })
                        }
                      />
                    </label>
                    <div className="col-span-full">
                      {(lookups.snapshot?.accounts.find(
                        (account) => account.account_id === row.accountId,
                      )?.account_type ??
                        accountOptions.find(
                          (option) => option.id === row.accountId,
                        )?.accountType) === "flow" ? (
                        <EntityPicker
                          id={`recurring-record-${row.id}-category`}
                          label="Category"
                          loadOptions={categoryPickerLoader({
                            context: "record_assignment",
                          })}
                          options={categoryOptions}
                          value={row.categoryId}
                          onChange={(categoryId) =>
                            patchRow(index, { categoryId })
                          }
                        />
                      ) : row.categoryId !== undefined ? (
                        <div className="grid gap-1 font-mono text-xs">
                          <span>Category</span>
                          <div className="border-input flex min-h-9 items-center justify-between gap-2 border px-2">
                            <Tooltip
                              className="min-w-0"
                              label={
                                categoryFqnById.get(row.categoryId) ??
                                `Category ${row.categoryId}`
                              }
                              triggerLabel="Show full category path"
                            >
                              <span className="block min-w-0 truncate">
                                {categoryFqnById.get(row.categoryId) ??
                                  `Category ${row.categoryId}`}
                              </span>
                            </Tooltip>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                patchRow(index, { categoryId: undefined })
                              }
                            >
                              <Close aria-hidden="true" />
                              Clear category
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex h-9" aria-hidden />
                      )}
                      <FieldError
                        message={errors[recordErrorKey(index, "category")]}
                      />
                    </div>
                    <div className="col-span-full">
                      <EntityMultiPicker
                        id={`recurring-record-${row.id}-tags`}
                        label="Tags"
                        loadOptions={tagPickerLoader({
                          context: "record_assignment",
                        })}
                        options={tagOptions}
                        value={row.tagIds}
                        onChange={(tagIds) => patchRow(index, { tagIds })}
                      />
                    </div>
                    <EntityPicker
                      hierarchical={false}
                      id={`recurring-record-${row.id}-member`}
                      label="Member"
                      loadOptions={memberPickerLoader({
                        context: "record_assignment",
                      })}
                      options={memberOptions}
                      placeholder="Whole household"
                      value={row.memberId}
                      onChange={(memberId) => patchRow(index, { memberId })}
                    />
                    <label className="grid gap-1 font-mono text-xs">
                      Memo
                      <input
                        className="border-input bg-card h-9 border px-2"
                        value={row.memo}
                        onChange={(event) =>
                          patchRow(index, { memo: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <FieldError
                    message={
                      errors[recordErrorKey(index, "amount")] ??
                      errors[recordErrorKey(index, "currency")]
                    }
                  />
                </section>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {balances.map(([currency, amount]) => (
              <div
                key={currency}
                className={cn(
                  "border-2 p-2 font-mono text-xs",
                  amount === 0n
                    ? "text-[var(--color-money-in)]"
                    : "text-[var(--color-class-adjustment-ink)]",
                )}
              >
                <span>{currency}</span>
                <span className="float-right">
                  {amount === 0n ? "Balanced" : "Unbalanced"}
                </span>
                <div className="mt-2 grid grid-cols-8 gap-1">
                  {Array.from({ length: 8 }, (_, index) => (
                    <span
                      key={index}
                      className={cn(
                        "h-2 border border-[var(--border-ink)]",
                        amount === 0n
                          ? "bg-[var(--color-money-in)]"
                          : "bg-[var(--color-class-adjustment-bright)]",
                      )}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <footer className="flex justify-end gap-2 border-t-2 border-[var(--border-ink)] p-4">
        <Button type="button" variant="outline" onClick={() => closeEditor()}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={saving || lookups.loading || serverTodayLoading}
          onClick={() => void save()}
        >
          <Check aria-hidden="true" />
          {saving
            ? "Saving"
            : serverTodayLoading
              ? "Checking date"
              : "Save definition"}
        </Button>
      </footer>
    </aside>
  );
};
