import { Check, Close, Plus, Trash } from "pixelarticons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type Account,
  apiErrorMessage,
  type Category,
  createRecurringDefinition,
  pauseRecurringDefinition,
  type RecurringDefinition,
  type RecurringDefinitionRecordRequest,
  type RecurringDefinitionWriteRequest,
  replaceRecurringDefinition,
  resumeRecurringDefinition,
} from "@/api";
import { focusWithoutTooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  EntityMultiPicker,
  type EntityOption,
  EntityPicker,
  useLedgerLookupsResource,
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

interface DefinitionEditorPanelProps {
  readonly definition: RecurringDefinition | undefined;
  readonly onClose: () => void;
  readonly onNotice: (message: string, tone?: "error" | "success") => void;
  readonly onSaved: () => Promise<boolean>;
  readonly open: boolean;
  readonly returnFocusTo: HTMLElement | undefined;
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
    records: definition?.records.map((record) => ({
      accountId: record.account_id,
      amount: record.amount,
      categoryId: record.category_id,
      currency: record.currency,
      id: nextDraftRecordId++,
      memberId: record.member_id ?? undefined,
      memo: record.memo ?? "",
      tagIds: record.tag_ids,
    })) ?? [newRecord(), newRecord()],
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

const recordErrorKey = (row: number, field: string) =>
  `records.${row}.${field}`;

const accountTypesForIntent: Record<
  Category["economic_intent"],
  readonly Account["account_type"][]
> = {
  adjustment: ["balance", "flow", "system"],
  exchange: ["balance", "flow"],
  expense: ["balance", "flow"],
  fee: ["balance", "flow", "system"],
  fx_gain_loss: ["balance", "flow", "system"],
  income: ["balance", "flow"],
  refund: ["balance", "flow"],
  transfer: ["balance"],
};

const option = (
  entity: { readonly fqn?: string; readonly name?: string },
  id: number,
): EntityOption => ({
  id,
  label: entity.name ?? entity.fqn ?? "Unknown",
  searchLabel: entity.fqn ?? entity.name ?? "Unknown",
});

const FieldError = ({ message }: { readonly message: string | undefined }) =>
  message ? <p className="text-destructive mt-1 text-xs">{message}</p> : null;

export const DefinitionEditorPanel = ({
  definition,
  onClose,
  onNotice,
  onSaved,
  open,
  returnFocusTo,
}: DefinitionEditorPanelProps) => {
  const lookups = useLedgerLookupsResource();
  const panelRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<DefinitionDraft>(() =>
    definitionDraft(definition),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const closeEditor = useCallback(() => {
    onClose();
    window.requestAnimationFrame(() => {
      if (returnFocusTo?.isConnected) {
        focusWithoutTooltip(returnFocusTo, { preventScroll: true });
      }
    });
  }, [onClose, returnFocusTo]);

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
        "[role='alertdialog']",
      );
      if (openModal) {
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

  const options = useMemo(() => {
    const visible = <
      T extends {
        readonly is_hidden: boolean;
        readonly tombstoned_at?: string | null;
      },
    >(
      values: readonly T[],
    ) => values.filter((value) => !value.is_hidden && !value.tombstoned_at);
    return {
      accounts: visible(lookups.snapshot?.accounts ?? []).map((account) =>
        option(account, account.account_id),
      ),
      categories: visible(lookups.snapshot?.categories ?? []).map((category) =>
        option(category, category.category_id),
      ),
      members: visible(lookups.snapshot?.members ?? []).map((member) =>
        option(member, member.member_id),
      ),
      tags: visible(lookups.snapshot?.tags ?? []).map((tag) =>
        option(tag, tag.tag_id),
      ),
    };
  }, [lookups.snapshot]);

  const balances = useMemo(() => {
    const values = new Map<string, bigint>();
    for (const row of draft.records) {
      const mantissa = signedAmountMantissa(row.amount);
      const currency = row.currency.trim().toUpperCase();
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
      if (!row.categoryId)
        next[recordErrorKey(index, "category")] = "Category is required.";
      if (!normalizedAmount(row.amount))
        next[recordErrorKey(index, "amount")] =
          "Enter a signed non-zero amount with up to 8 decimals.";
      if (!/^([A-Z]{3}|C::.+)$/.test(row.currency.trim().toUpperCase()))
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

  const accountOptions = (
    categoryId: number | undefined,
  ): readonly EntityOption[] => {
    const category = lookups.snapshot?.categories.find(
      (item) => item.category_id === categoryId,
    );
    if (!category) return options.accounts;
    const allowed = accountTypesForIntent[category.economic_intent];
    return (lookups.snapshot?.accounts ?? [])
      .filter(
        (account) =>
          !account.is_hidden &&
          !account.tombstoned_at &&
          allowed.includes(account.account_type),
      )
      .map((account) => option(account, account.account_id));
  };

  const save = async () => {
    const nextErrors = validate(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || saving) return;
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
        category_id: row.categoryId!,
        currency: row.currency.trim().toUpperCase(),
        member_id: row.memberId ?? null,
        memo: row.memo.trim() || null,
        tag_ids: [...row.tagIds],
      }),
    );
    const body: RecurringDefinitionWriteRequest = {
      anchor_date: draft.anchorDate,
      fqn: draft.fqn.trim(),
      records,
      schedule_rule,
    };
    setSaving(true);
    setGeneralError(undefined);
    const result = definition
      ? await replaceRecurringDefinition({
          body,
          path: { recurring_definition_id: definition.recurring_definition_id },
        })
      : await createRecurringDefinition({ body });
    if (!result.data) {
      const message = apiErrorMessage(
        result.error,
        "Definition could not be saved.",
      );
      const rowMatch = message.match(
        /records?\[(\d+)\].*?(account|category|amount|currency|member|tag)/i,
      );
      setErrors(
        rowMatch
          ? {
              [recordErrorKey(
                Number(rowMatch[1]),
                (rowMatch[2] ?? "amount").toLowerCase(),
              )]: message,
            }
          : {},
      );
      setGeneralError(message);
      setSaving(false);
      return;
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
    closeEditor();
  };

  if (!open) return null;
  return (
    <aside
      ref={panelRef}
      className="bg-card fixed top-0 right-0 z-50 flex h-svh w-[min(44rem,calc(100vw-1rem))] flex-col border-l-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
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
          onClick={closeEditor}
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
                        options={accountOptions(row.categoryId)}
                        value={row.accountId}
                        onChange={(accountId) => {
                          const account = lookups.snapshot?.accounts.find(
                            (item) => item.account_id === accountId,
                          );
                          patchRow(index, {
                            accountId,
                            currency: account?.currency ?? row.currency,
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
                            currency: event.target.value.toUpperCase(),
                          })
                        }
                      />
                    </label>
                    <div className="col-span-full">
                      <EntityPicker
                        id={`recurring-record-${row.id}-category`}
                        label="Category"
                        options={options.categories}
                        value={row.categoryId}
                        onChange={(categoryId) =>
                          patchRow(index, {
                            accountId: accountOptions(categoryId).some(
                              (item) => item.id === row.accountId,
                            )
                              ? row.accountId
                              : undefined,
                            categoryId,
                          })
                        }
                      />
                      <FieldError
                        message={errors[recordErrorKey(index, "category")]}
                      />
                    </div>
                    <div className="col-span-full">
                      <EntityMultiPicker
                        id={`recurring-record-${row.id}-tags`}
                        label="Tags"
                        options={options.tags}
                        value={row.tagIds}
                        onChange={(tagIds) => patchRow(index, { tagIds })}
                      />
                    </div>
                    <EntityPicker
                      id={`recurring-record-${row.id}-member`}
                      label="Member"
                      options={options.members}
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
        <Button type="button" variant="outline" onClick={closeEditor}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={saving || lookups.loading}
          onClick={() => void save()}
        >
          <Check aria-hidden="true" />
          {saving ? "Saving" : "Save definition"}
        </Button>
      </footer>
    </aside>
  );
};
