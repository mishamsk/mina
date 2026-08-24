import { Close, EyeOff, Filter, Plus, Trash } from "pixelarticons/react";
import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  Account,
  Category,
  Member,
  RecordRole,
  Tag,
  TransactionClass,
  TransactionSettlement,
  TransactionShapeType,
} from "@/api";
import {
  focusWithoutTooltip,
  Tooltip as AppTooltip,
} from "@/components/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  normalizeTransactionFilterCurrency,
  recordRoles,
  transactionClasses,
  type TransactionFilterChip,
  transactionFilterCurrencyPattern,
  transactionFilterDatePattern,
  transactionFilterDecimalPattern,
  type TransactionFilterMembershipField,
  type TransactionFilterMembershipMode,
  type TransactionFilterRow,
  transactionFilterRows,
  type TransactionFilters,
  transactionLifecycleStatuses,
  transactionSettlements,
  transactionShapes,
  withTransactionFilterExpression,
  withTransactionFilterRows,
} from "@/models/transaction-filters";
import type { LedgerLookupsSnapshot } from "@/store";

import { EntityMultiPicker, type EntityOption } from "./entity-picker";
import {
  lifecycleStatusLabel,
  settlementStatusLabel,
  transactionClassLabel,
} from "./format";

type EntityDimension = "account" | "category" | "tag" | "member";
type RangeDimension = "amount" | "amountUsd" | "initiated";
type MembershipDimension =
  | EntityDimension
  | "class"
  | "currency"
  | "lifecycle"
  | "role"
  | "settlement"
  | "shape";
export type TransactionFilterDimension = MembershipDimension | RangeDimension;

const entityDimensionLabels: Record<EntityDimension, string> = {
  account: "Accounts",
  category: "Categories",
  member: "Members",
  tag: "Tags",
};

interface TransactionFilterControlsProps {
  readonly filters: TransactionFilters;
  readonly hiddenDimensions?: readonly TransactionFilterDimension[];
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly onChange: (filters: TransactionFilters) => void;
}

interface DimensionDefinition {
  readonly field:
    TransactionFilterMembershipField | "amount_usd" | "amount" | "initiated";
  readonly id: TransactionFilterDimension;
  readonly label: string;
  readonly modes?: readonly TransactionFilterMembershipMode[];
}

const multiValueModes = ["any", "all", "none"] as const;
const singleValueModes = ["any", "none"] as const;
const dimensions: readonly DimensionDefinition[] = [
  {
    field: "account",
    id: "account",
    label: "Account",
    modes: multiValueModes,
  },
  {
    field: "currency",
    id: "currency",
    label: "Currency",
    modes: multiValueModes,
  },
  {
    field: "category",
    id: "category",
    label: "Category",
    modes: multiValueModes,
  },
  { field: "tag", id: "tag", label: "Tag", modes: multiValueModes },
  {
    field: "member",
    id: "member",
    label: "Member",
    modes: multiValueModes,
  },
  {
    field: "lifecycle",
    id: "lifecycle",
    label: "Lifecycle",
    modes: singleValueModes,
  },
  {
    field: "settlement",
    id: "settlement",
    label: "Settlement",
    modes: singleValueModes,
  },
  {
    field: "class",
    id: "class",
    label: "Transaction class",
    modes: singleValueModes,
  },
  {
    field: "shape",
    id: "shape",
    label: "Transaction shape",
    modes: multiValueModes,
  },
  {
    field: "role",
    id: "role",
    label: "Record role",
    modes: multiValueModes,
  },
  { field: "amount", id: "amount", label: "Amount" },
  { field: "amount_usd", id: "amountUsd", label: "Amount USD" },
  { field: "initiated", id: "initiated", label: "Initiated date" },
];

const dimensionById = new Map(
  dimensions.map((dimension) => [dimension.id, dimension] as const),
);

const dimensionForChip = (
  chip: TransactionFilterChip,
): TransactionFilterDimension =>
  chip.field === "amount_usd" ? "amountUsd" : chip.field;

const modeLabel = (mode: TransactionFilterMembershipMode): string =>
  mode === "any" ? "Any of" : mode === "all" ? "All of" : "None of";

const settlementChipValueLabel = (settlement: TransactionSettlement): string =>
  settlement === "mixed"
    ? "Mixed"
    : settlement === "not_applicable"
      ? "Not applicable"
      : settlementStatusLabel(settlement);

const accountingLabel = (value: RecordRole | TransactionShapeType): string =>
  `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

const editorFocusableSelector = [
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

const matchingDatalistOptions = (
  input: HTMLInputElement,
): readonly HTMLOptionElement[] => {
  const query = input.value.trim().toLocaleLowerCase();
  return Array.from(input.list?.options ?? []).filter((option) =>
    option.value.toLocaleLowerCase().includes(query),
  );
};

const hasMatchingDatalistOption = (input: HTMLInputElement): boolean =>
  matchingDatalistOptions(input).length > 0;

const activeRecord = <T extends { readonly tombstoned_at?: string | null }>(
  value: T,
): boolean => !value.tombstoned_at;

const entityIDFromLiteral = (value: string): number | undefined => {
  const match = /^#0*([1-9]\d*)$/.exec(value);
  if (!match) return undefined;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : undefined;
};

const accountOption = (account: Account): EntityOption => ({
  detail: `${account.fqn} · ${account.currency ? `${account.currency} · Single-currency` : "Multi-currency"}`,
  hidden: account.is_hidden,
  id: account.account_id,
  label: account.name,
  searchLabel: account.fqn,
});

const categoryOption = (category: Category): EntityOption => ({
  detail: category.fqn,
  hidden: category.is_hidden,
  id: category.category_id,
  label: category.name,
  searchLabel: category.fqn,
});

const tagOption = (tag: Tag): EntityOption => ({
  detail: tag.fqn,
  hidden: tag.is_hidden,
  id: tag.tag_id,
  label: tag.name,
  searchLabel: tag.fqn,
});

const memberOption = (member: Member): EntityOption => ({
  hidden: member.is_hidden,
  id: member.member_id,
  label: member.name,
  searchLabel: member.name,
});

const mapById = <T,>(
  values: readonly T[] | undefined,
  getId: (value: T) => number,
): Map<number, T> =>
  new Map(values?.map((value) => [getId(value), value] as const));

const selectedOrVisible = (
  selected: boolean,
  hidden: boolean,
  includeHidden: boolean,
): boolean => selected || !hidden || includeHidden;

const rangeLabel = (
  label: string,
  from: string | undefined,
  to: string | undefined,
): string | undefined => {
  if (from && to) return `${label} ${from}-${to}`;
  if (from) return `${label} >= ${from}`;
  if (to) return `${label} <= ${to}`;
  return undefined;
};

const valuesForField = (
  rows: readonly TransactionFilterRow[],
  field: TransactionFilterMembershipField,
): readonly string[] =>
  rows.flatMap((row) =>
    row.chips.flatMap((chip) =>
      chip.kind === "membership" && chip.field === field ? chip.values : [],
    ),
  );

const filterChipCount = (
  rows: readonly TransactionFilterRow[],
  hiddenDimensions: ReadonlySet<TransactionFilterDimension>,
): number =>
  rows.reduce(
    (count, row) =>
      count +
      row.chips.filter((chip) => !hiddenDimensions.has(dimensionForChip(chip)))
        .length,
    0,
  );

export const hasActiveTransactionFilterChips = (
  filters: TransactionFilters,
  hiddenDimensions: readonly TransactionFilterDimension[] = [],
): boolean => {
  if (filters.filterText === "") return true;
  const rows = transactionFilterRows(filters);
  return rows
    ? filterChipCount(rows, new Set(hiddenDimensions)) > 0
    : Boolean(filters.filterText);
};

interface FilterChipProps {
  readonly editKey: string;
  readonly hidden?: boolean;
  readonly label: string;
  readonly labelSuffix?: string;
  readonly onEdit: (opener: HTMLButtonElement) => void;
  readonly onRemove: () => void;
  readonly tooltip?: string;
  readonly truncateLabel?: boolean;
}

const FilterChip = ({
  editKey,
  hidden,
  label,
  labelSuffix,
  onEdit,
  onRemove,
  tooltip = `${label}${labelSuffix ?? ""}`,
  truncateLabel = true,
}: FilterChipProps) => {
  const accessibleLabel = `${label}${labelSuffix ?? ""}`;
  return (
    <AppTooltip asChild label={tooltip}>
      <Badge
        variant="secondary"
        className={cn(
          "h-auto max-w-full min-w-0 justify-start gap-1 py-1 normal-case",
          !truncateLabel && "min-h-5 overflow-visible whitespace-normal",
        )}
      >
        {hidden ? (
          <EyeOff aria-label="Hidden" className="size-3 shrink-0" />
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={cn(
            "h-auto max-w-full min-w-0! shrink! px-0 py-0 normal-case shadow-none",
            !truncateLabel && "whitespace-normal",
          )}
          aria-label={`Edit ${accessibleLabel}`}
          data-filter-chip-edit={editKey}
          onClick={(event) => onEdit(event.currentTarget)}
        >
          <span
            data-filter-chip-label
            className={
              truncateLabel
                ? "max-w-72 min-w-8 shrink-0 truncate max-sm:max-w-20"
                : "break-all whitespace-normal"
            }
          >
            {label}
          </span>
          {labelSuffix ? (
            <span
              data-filter-chip-operator
              className="shrink-0 whitespace-nowrap"
            >
              {labelSuffix}
            </span>
          ) : null}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${accessibleLabel}`}
          onClick={onRemove}
        >
          <Close aria-hidden="true" />
        </Button>
      </Badge>
    </AppTooltip>
  );
};

interface CheckboxListProps<T extends string> {
  readonly idPrefix: string;
  readonly labelFor: (value: T) => string;
  readonly onChange: (values: readonly T[]) => void;
  readonly values: readonly T[];
  readonly selectedValues: readonly T[];
}

const CheckboxList = <T extends string>({
  idPrefix,
  labelFor,
  onChange,
  selectedValues,
  values,
}: CheckboxListProps<T>) => (
  <div className="flex flex-col gap-2">
    {values.map((value) => {
      const checked = selectedValues.includes(value);
      const id = `${idPrefix}-${value}`;
      return (
        <label
          key={value}
          htmlFor={id}
          className="flex min-w-0 items-center gap-2"
        >
          <Checkbox
            id={id}
            checked={checked}
            onCheckedChange={(nextChecked) => {
              onChange(
                nextChecked === true
                  ? [...selectedValues, value]
                  : selectedValues.filter(
                      (selectedValue) => selectedValue !== value,
                    ),
              );
            }}
          />
          <span className="min-w-0 font-mono text-sm break-all">
            {labelFor(value)}
          </span>
        </label>
      );
    })}
  </div>
);

interface CurrencyFilterEditorProps {
  readonly idPrefix: string;
  readonly onChange: (values: readonly string[]) => void;
  readonly options: readonly string[];
  readonly selectedValues: readonly string[];
}

const CurrencyFilterEditor = ({
  idPrefix,
  onChange,
  options,
  selectedValues,
}: CurrencyFilterEditorProps) => {
  const datalistKeyboardSelectionRef = useRef(false);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const removedCheckboxIdRef = useRef<string | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  useLayoutEffect(() => {
    const removedCheckboxId = removedCheckboxIdRef.current;
    if (!removedCheckboxId) return;
    removedCheckboxIdRef.current = undefined;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const removedCheckbox = document.getElementById(removedCheckboxId);
        if (removedCheckbox) removedCheckbox.focus();
        else draftInputRef.current?.focus();
      });
    });
  }, [options, selectedValues]);

  const addDraft = (value = draft): void => {
    const currency = normalizeTransactionFilterCurrency(value);
    if (!transactionFilterCurrencyPattern.test(currency)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft("");
    if (!selectedValues.includes(currency)) {
      onChange([...selectedValues, currency]);
    }
  };

  const datalistId = `${idPrefix}-currency-options`;
  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-[min(16rem,40svh)] overflow-y-auto pr-1">
        <CheckboxList
          idPrefix={`${idPrefix}-currency`}
          values={options}
          selectedValues={selectedValues}
          labelFor={(currency) => currency}
          onChange={(values) => {
            if (values.length < selectedValues.length) {
              const removedCurrency = selectedValues.find(
                (currency) => !values.includes(currency),
              );
              removedCheckboxIdRef.current = removedCurrency
                ? `${idPrefix}-currency-${removedCurrency}`
                : undefined;
            }
            onChange(values);
          }}
        />
      </div>
      <div className="flex items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 font-mono text-xs">
          Currency code
          <input
            ref={draftInputRef}
            list={datalistId}
            aria-invalid={invalid}
            aria-describedby={
              invalid ? `${idPrefix}-currency-error` : undefined
            }
            className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]"
            value={draft}
            onChange={(event) => {
              setDraft(normalizeTransactionFilterCurrency(event.target.value));
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                datalistKeyboardSelectionRef.current =
                  hasMatchingDatalistOption(event.currentTarget);
              } else if (event.key !== "Enter") {
                datalistKeyboardSelectionRef.current = false;
              }
            }}
            onKeyUp={(event) => {
              if (event.key !== "Enter") return;
              const matches = matchingDatalistOptions(event.currentTarget);
              const value =
                datalistKeyboardSelectionRef.current && matches.length === 1
                  ? matches[0]!.value
                  : event.currentTarget.value;
              datalistKeyboardSelectionRef.current = false;
              addDraft(value);
            }}
          />
        </label>
        <Button type="button" variant="outline" onClick={() => addDraft()}>
          Add
        </Button>
      </div>
      <datalist id={datalistId}>
        {options.map((currency) => (
          <option key={currency} value={currency} />
        ))}
      </datalist>
      {invalid ? (
        <p
          id={`${idPrefix}-currency-error`}
          role="alert"
          className="text-destructive font-body text-xs"
        >
          Use three uppercase letters or C:: followed by a token.
        </p>
      ) : null}
    </div>
  );
};

interface RangeEditorProps {
  readonly formatHint?: string;
  readonly fromLabel: string;
  readonly fromValue: string | undefined;
  readonly inputMode: "decimal" | "text";
  readonly onChange: (from: string | undefined, to: string | undefined) => void;
  readonly pattern: RegExp;
  readonly toLabel: string;
  readonly toValue: string | undefined;
}

const RangeEditor = ({
  formatHint,
  fromLabel,
  fromValue,
  inputMode,
  onChange,
  pattern,
  toLabel,
  toValue,
}: RangeEditorProps) => {
  const formatHintId = useId();
  const [draftState, setDraftState] = useState({
    fromDraft: fromValue ?? "",
    fromValue,
    toDraft: toValue ?? "",
    toValue,
  });
  const fromDraftMatchesValue = draftState.fromValue === fromValue;
  const toDraftMatchesValue = draftState.toValue === toValue;
  const fromDraft = fromDraftMatchesValue
    ? draftState.fromDraft
    : (fromValue ?? "");
  const toDraft = toDraftMatchesValue ? draftState.toDraft : (toValue ?? "");
  const fromInvalid = Boolean(
    fromDraft.trim() && !pattern.test(fromDraft.trim()),
  );
  const toInvalid = Boolean(toDraft.trim() && !pattern.test(toDraft.trim()));

  const update = (side: "from" | "to", rawValue: string): void => {
    const value = rawValue.trim();
    const nextFromDraft = side === "from" ? rawValue : fromDraft;
    const nextToDraft = side === "to" ? rawValue : toDraft;
    setDraftState({
      fromDraft: nextFromDraft,
      fromValue,
      toDraft: nextToDraft,
      toValue,
    });
    if (value && !pattern.test(value)) return;
    const normalizeDraft = (
      draft: string,
      previousValue: string | undefined,
    ): string | undefined => {
      const nextValue = draft.trim();
      if (!nextValue) return undefined;
      return !pattern.test(nextValue) ? previousValue : nextValue;
    };
    onChange(
      normalizeDraft(nextFromDraft, fromValue),
      normalizeDraft(nextToDraft, toValue),
    );
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 font-mono text-xs">
          {fromLabel}
          <input
            type="text"
            inputMode={inputMode}
            className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]"
            value={fromDraft}
            aria-describedby={formatHint ? formatHintId : undefined}
            aria-invalid={fromInvalid || undefined}
            onChange={(event) => update("from", event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs">
          {toLabel}
          <input
            type="text"
            inputMode={inputMode}
            className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]"
            value={toDraft}
            aria-describedby={formatHint ? formatHintId : undefined}
            aria-invalid={toInvalid || undefined}
            onChange={(event) => update("to", event.target.value)}
          />
        </label>
      </div>
      {formatHint ? (
        <p
          id={formatHintId}
          role={fromInvalid || toInvalid ? "alert" : undefined}
          className={cn(
            "font-body text-xs",
            fromInvalid || toInvalid
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {formatHint}
        </p>
      ) : null}
    </div>
  );
};

interface RowState {
  readonly rows: readonly TransactionFilterRow[];
  readonly source: string;
}

interface EditorState {
  readonly dimension?: TransactionFilterDimension;
  readonly mode: TransactionFilterMembershipMode;
  readonly rowIndex: number;
}

interface EditorSession extends EditorState {
  readonly currentSource: string;
  readonly pendingPreviousSource?: string;
  readonly previousMode?: TransactionFilterMembershipMode;
}

interface EditedChipFocusTarget {
  readonly editKey: string;
  readonly source: string;
}

const filterSourceKey = (filterText: string | undefined): string =>
  filterText === undefined ? "absent" : `present:${filterText}`;

export const TransactionFilterControls = ({
  filters,
  hiddenDimensions = [],
  lookups,
  onChange,
}: TransactionFilterControlsProps) => {
  const parsedRows = transactionFilterRows(filters);
  const source = filterSourceKey(filters.filterText);
  const sourceRef = useRef(source);
  const historySourceRef = useRef<string | undefined>(undefined);
  const [rowState, setRowState] = useState<RowState>({
    rows: parsedRows ?? [{ chips: [] }],
    source,
  });
  const externalRows = parsedRows ?? [{ chips: [] }];
  const rows = rowState.source === source ? rowState.rows : externalRows;
  const advanced = parsedRows === undefined;
  const [editor, setEditor] = useState<EditorSession>();
  const editorSourceIsCurrent =
    source === editor?.currentSource ||
    source === editor?.pendingPreviousSource;
  const activeEditor = editorSourceIsCurrent ? editor : undefined;
  const [includeHidden, setIncludeHidden] = useState<
    Partial<Record<EntityDimension, boolean>>
  >({});
  const [entityPickerOpen, setEntityPickerOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorAutoFocusKeyRef = useRef<string | undefined>(undefined);
  const addFilterTriggerRefs = useRef(new Map<number, HTMLButtonElement>());
  const advancedClearButtonRef = useRef<HTMLButtonElement>(null);
  const restoreAdvancedSourceFocusRef = useRef(false);
  const restoreAdvancedClearFocusRef = useRef(false);
  const restoreAddFilterTriggerFocusRef = useRef<number | undefined>(undefined);
  const restoreEditedChipOnCloseRef = useRef<EditedChipFocusTarget | undefined>(
    undefined,
  );
  const restoreEditedChipAfterCloseRef = useRef(false);
  const restoreDimensionMenuFocusRef = useRef<
    TransactionFilterDimension | undefined
  >(undefined);
  const restoreRemovedRowFocusRef = useRef<number | undefined>(undefined);
  const restoreEntityIDLiteralFocusRef = useRef<number | undefined>(undefined);
  const datalistKeyboardCommitTargetRef = useRef<HTMLInputElement | null>(null);
  const datalistPointerTargetRef = useRef<HTMLInputElement | null>(null);
  const datalistEscapePendingRef = useRef(false);
  const hiddenDimensionSet = useMemo(
    () => new Set<TransactionFilterDimension>(hiddenDimensions),
    [hiddenDimensions],
  );
  const visibleDimensions = useMemo(
    () =>
      dimensions.filter((dimension) => !hiddenDimensionSet.has(dimension.id)),
    [hiddenDimensionSet],
  );

  useLayoutEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    const recordHistorySource = () => {
      const searchParams = new URL(window.location.href).searchParams;
      historySourceRef.current = filterSourceKey(
        searchParams.has("filter")
          ? (searchParams.get("filter") ?? "")
          : undefined,
      );
    };
    window.addEventListener("popstate", recordHistorySource);
    return () => window.removeEventListener("popstate", recordHistorySource);
  }, []);

  useLayoutEffect(() => {
    if (!editor) return;
    const historyRestoredDifferentSource =
      historySourceRef.current === source && source !== editor.currentSource;
    if (editorSourceIsCurrent && !historyRestoredDifferentSource) return;
    historySourceRef.current = undefined;
    if (parsedRows === undefined) {
      restoreAdvancedSourceFocusRef.current = true;
    } else if (editor.dimension) {
      const candidates =
        parsedRows?.[editor.rowIndex]?.chips.filter(
          (chip) => dimensionForChip(chip) === editor.dimension,
        ) ?? [];
      const restoredChip =
        candidates.find(
          (chip) =>
            chip.kind === "membership" && chip.mode === editor.previousMode,
        ) ??
        candidates.find(
          (chip) => chip.kind === "membership" && chip.mode === editor.mode,
        ) ??
        candidates[0];
      if (restoredChip) {
        restoreEditedChipAfterCloseRef.current = true;
        restoreEditedChipOnCloseRef.current = {
          editKey: `${editor.rowIndex}:${editor.dimension}:${restoredChip.kind === "membership" ? restoredChip.mode : "range"}`,
          source,
        };
      } else if (parsedRows?.length) {
        const restoreRowIndex = Math.min(
          editor.rowIndex,
          parsedRows.length - 1,
        );
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            focusWithoutTooltip(
              addFilterTriggerRefs.current.get(restoreRowIndex),
            );
          });
        });
      }
    }
    setEntityPickerOpen(false);
    setEditor(undefined);
  }, [editor, editorSourceIsCurrent, parsedRows, source]);

  useLayoutEffect(() => {
    if (!advanced || !restoreAdvancedSourceFocusRef.current) return;
    restoreAdvancedSourceFocusRef.current = false;
    focusWithoutTooltip(advancedClearButtonRef.current);
  }, [advanced]);

  useLayoutEffect(() => {
    if (!activeEditor) {
      editorAutoFocusKeyRef.current = undefined;
      return;
    }
    if (activeEditor.dimension) {
      const focusKey = `${activeEditor.rowIndex}:${activeEditor.dimension}`;
      if (editorAutoFocusKeyRef.current === focusKey) return;
      editorAutoFocusKeyRef.current = focusKey;
      editorRef.current
        ?.querySelector<HTMLElement>(editorFocusableSelector)
        ?.focus();
      return;
    }
    editorAutoFocusKeyRef.current = undefined;
    const dimension = restoreDimensionMenuFocusRef.current;
    if (!dimension) return;
    restoreDimensionMenuFocusRef.current = undefined;
    editorRef.current
      ?.querySelector<HTMLElement>(`[data-filter-dimension="${dimension}"]`)
      ?.focus();
  }, [activeEditor]);

  useLayoutEffect(() => {
    const rowIndex = restoreRemovedRowFocusRef.current;
    if (rowIndex === undefined) return;
    restoreRemovedRowFocusRef.current = undefined;
    focusWithoutTooltip(addFilterTriggerRefs.current.get(rowIndex));
  }, [rows.length]);

  useLayoutEffect(() => {
    const removedIndex = restoreEntityIDLiteralFocusRef.current;
    if (removedIndex === undefined) return;
    restoreEntityIDLiteralFocusRef.current = undefined;
    const remainingButtons = Array.from(
      editorRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-filter-entity-id-remove]",
      ) ?? [],
    );
    const fallback =
      remainingButtons[Math.min(removedIndex, remainingButtons.length - 1)] ??
      editorRef.current?.querySelector<HTMLElement>(editorFocusableSelector);
    fallback?.focus();
  }, [rows]);

  useLayoutEffect(() => {
    if (advanced || !restoreAdvancedClearFocusRef.current) return;
    restoreAdvancedClearFocusRef.current = false;
    focusWithoutTooltip(addFilterTriggerRefs.current.get(0));
  }, [advanced]);

  useLayoutEffect(() => {
    const target = restoreEditedChipOnCloseRef.current;
    if (
      !restoreEditedChipAfterCloseRef.current ||
      !target ||
      source !== target.source
    )
      return;
    const liveTrigger = controlsRef.current?.querySelector<HTMLButtonElement>(
      `[data-filter-chip-edit="${target.editKey}"]`,
    );
    if (!liveTrigger) return;
    focusWithoutTooltip(liveTrigger);
  }, [activeEditor, rows, source]);

  const commitRows = (nextRows: readonly TransactionFilterRow[]): void => {
    const normalizedRows = nextRows.length > 0 ? nextRows : [{ chips: [] }];
    const nextFilters = withTransactionFilterRows(filters, normalizedRows);
    const nextSource = filterSourceKey(nextFilters.filterText);
    setRowState({
      rows: normalizedRows,
      source: nextSource,
    });
    setEditor((current) =>
      current
        ? {
            ...current,
            currentSource: nextSource,
            pendingPreviousSource: source,
          }
        : current,
    );
    onChange(nextFilters);
    const settleEditorSource = (attempts: number): void => {
      window.requestAnimationFrame(() => {
        if (sourceRef.current !== nextSource && attempts > 1) {
          settleEditorSource(attempts - 1);
          return;
        }
        if (sourceRef.current !== nextSource) return;
        setEditor((current) => {
          if (
            !current ||
            current.currentSource !== nextSource ||
            current.pendingPreviousSource === undefined
          ) {
            return current;
          }
          const { pendingPreviousSource: _, ...settled } = current;
          return settled;
        });
      });
    };
    settleEditorSource(60);
  };

  const openEditor = (nextEditor: EditorState): void => {
    setEditor({ ...nextEditor, currentSource: source });
  };

  const updateRow = (
    rowIndex: number,
    chips: readonly TransactionFilterChip[],
  ) => {
    const nextRows = [...rows];
    nextRows[rowIndex] = { chips };
    commitRows(nextRows);
  };

  const removeRow = (rowIndex: number): void => {
    restoreRemovedRowFocusRef.current = Math.min(rowIndex, rows.length - 2);
    commitRows(rows.filter((_, index) => index !== rowIndex));
  };

  const updateMembership = (
    rowIndex: number,
    field: TransactionFilterMembershipField,
    mode: TransactionFilterMembershipMode,
    values: readonly string[],
    entityProvenance?: {
      readonly entityIdValues: readonly string[];
      readonly humanEntityValues: readonly string[];
    },
  ): void => {
    const chips = [...(rows[rowIndex]?.chips ?? [])];
    const chipIndex = chips.findIndex(
      (chip) =>
        chip.kind === "membership" &&
        chip.field === field &&
        chip.mode === mode,
    );
    if (values.length === 0) {
      if (chipIndex >= 0) chips.splice(chipIndex, 1);
    } else {
      const entityIdValues =
        entityProvenance?.entityIdValues ??
        (chipIndex >= 0 && chips[chipIndex]?.kind === "membership"
          ? chips[chipIndex].entityIdValues
          : undefined);
      const humanEntityValues =
        entityProvenance?.humanEntityValues ??
        (chipIndex >= 0 && chips[chipIndex]?.kind === "membership"
          ? chips[chipIndex].humanEntityValues
          : undefined);
      const scopedValues =
        chipIndex >= 0 && chips[chipIndex]?.kind === "membership"
          ? chips[chipIndex].scopedValues
          : undefined;
      const chip = {
        field,
        ...(entityIdValues ? { entityIdValues } : {}),
        ...(humanEntityValues ? { humanEntityValues } : {}),
        kind: "membership",
        mode,
        ...(scopedValues ? { scopedValues } : {}),
        values,
      } as const;
      if (chipIndex >= 0) chips[chipIndex] = chip;
      else chips.push(chip);
    }
    updateRow(rowIndex, chips);
  };

  const changeMembershipMode = (
    rowIndex: number,
    field: TransactionFilterMembershipField,
    previousMode: TransactionFilterMembershipMode,
    nextMode: TransactionFilterMembershipMode,
  ): boolean => {
    if (previousMode === nextMode) return true;
    const chips = [...(rows[rowIndex]?.chips ?? [])];
    const sourceIndex = chips.findIndex(
      (chip) =>
        chip.kind === "membership" &&
        chip.field === field &&
        chip.mode === previousMode,
    );
    if (sourceIndex < 0) return true;
    const source = chips[sourceIndex]! as Extract<
      TransactionFilterChip,
      { readonly kind: "membership" }
    >;
    const remaining = chips.filter((_, index) => index !== sourceIndex);
    const targetIndex = remaining.findIndex(
      (chip) =>
        chip.kind === "membership" &&
        chip.field === field &&
        chip.mode === nextMode,
    );
    if (targetIndex >= 0) {
      const target = remaining[targetIndex]! as Extract<
        TransactionFilterChip,
        { readonly kind: "membership" }
      >;
      const sourceScopes = new Set(source.scopedValues ?? []);
      const targetScopes = new Set(target.scopedValues ?? []);
      const sourceEntityIds = new Set(source.entityIdValues ?? []);
      const targetEntityIds = new Set(target.entityIdValues ?? []);
      const sourceHumanValues = new Set(
        source.values.filter(
          (value) =>
            !sourceEntityIds.has(value) ||
            source.humanEntityValues?.includes(value),
        ),
      );
      const targetHumanValues = new Set(
        target.values.filter(
          (value) =>
            !targetEntityIds.has(value) ||
            target.humanEntityValues?.includes(value),
        ),
      );
      const scopeCollision = source.values.some(
        (value) =>
          target.values.includes(value) &&
          sourceHumanValues.has(value) &&
          targetHumanValues.has(value) &&
          sourceScopes.has(value) !== targetScopes.has(value),
      );
      if (scopeCollision) return false;
      const entityIdValues = [
        ...new Set([
          ...(target.entityIdValues ?? []),
          ...(source.entityIdValues ?? []),
        ]),
      ];
      const humanValues = new Set([...targetHumanValues, ...sourceHumanValues]);
      remaining[targetIndex] = {
        ...target,
        entityIdValues,
        humanEntityValues: entityIdValues.filter((value) =>
          humanValues.has(value),
        ),
        scopedValues: [
          ...new Set([
            ...(target.scopedValues ?? []),
            ...(source.scopedValues ?? []),
          ]),
        ],
        values: [...new Set([...target.values, ...source.values])],
      };
    } else {
      remaining.push({ ...source, mode: nextMode });
    }
    updateRow(rowIndex, remaining);
    return true;
  };

  const updateRange = (
    rowIndex: number,
    field: "amount" | "amount_usd" | "initiated",
    from: string | undefined,
    to: string | undefined,
  ): void => {
    const chips = [...(rows[rowIndex]?.chips ?? [])];
    const chipIndex = chips.findIndex(
      (chip) => chip.kind === "range" && chip.field === field,
    );
    if (!from && !to) {
      if (chipIndex >= 0) chips.splice(chipIndex, 1);
    } else {
      const chip = { field, from, kind: "range", to } as const;
      if (chipIndex >= 0) chips[chipIndex] = chip;
      else chips.push(chip);
    }
    updateRow(rowIndex, chips);
  };

  const accountById = useMemo(
    () => mapById(lookups?.accounts, (account) => account.account_id),
    [lookups?.accounts],
  );
  const categoryById = useMemo(
    () => mapById(lookups?.categories, (category) => category.category_id),
    [lookups?.categories],
  );
  const tagById = useMemo(
    () => mapById(lookups?.tags, (tag) => tag.tag_id),
    [lookups?.tags],
  );
  const memberById = useMemo(
    () => mapById(lookups?.members, (member) => member.member_id),
    [lookups?.members],
  );

  const currencyOptions = useMemo(() => {
    const currencies = new Set(valuesForField(rows, "currency"));
    for (const account of lookups?.accounts ?? []) {
      if (activeRecord(account) && account.currency) {
        currencies.add(account.currency);
      }
    }
    return [...currencies].sort((left, right) => left.localeCompare(right));
  }, [lookups?.accounts, rows]);

  const membershipChip = (
    rowIndex: number,
    field: TransactionFilterMembershipField,
    mode: TransactionFilterMembershipMode,
  ) =>
    rows[rowIndex]?.chips.find(
      (chip) =>
        chip.kind === "membership" &&
        chip.field === field &&
        chip.mode === mode,
    ) as
      | Extract<TransactionFilterChip, { readonly kind: "membership" }>
      | undefined;

  const renderEntityEditor = (
    rowIndex: number,
    dimension: EntityDimension,
    mode: TransactionFilterMembershipMode,
  ): ReactNode => {
    const chip = membershipChip(rowIndex, dimension, mode);
    const entityIdValues = new Set(chip?.entityIdValues ?? []);
    const humanEntityValues = new Set(chip?.humanEntityValues ?? []);
    const exactValues =
      chip?.values.filter(
        (value) =>
          !chip.scopedValues?.includes(value) &&
          (!entityIdValues.has(value) || humanEntityValues.has(value)),
      ) ?? [];
    const selectedEntityValue = (
      humanValue: string,
      active: boolean,
    ): boolean => active && exactValues.includes(humanValue);
    const options = {
      account:
        lookups?.accounts
          .filter(activeRecord)
          .filter((account) =>
            selectedOrVisible(
              selectedEntityValue(account.fqn, activeRecord(account)),
              account.is_hidden,
              includeHidden.account ?? false,
            ),
          )
          .map(accountOption) ?? [],
      category:
        lookups?.categories
          .filter(activeRecord)
          .filter((category) =>
            selectedOrVisible(
              selectedEntityValue(category.fqn, activeRecord(category)),
              category.is_hidden,
              includeHidden.category ?? false,
            ),
          )
          .map(categoryOption) ?? [],
      member:
        lookups?.members
          .filter(activeRecord)
          .filter((member) =>
            selectedOrVisible(
              selectedEntityValue(member.name, activeRecord(member)),
              member.is_hidden,
              includeHidden.member ?? false,
            ),
          )
          .map(memberOption) ?? [],
      tag:
        lookups?.tags
          .filter(activeRecord)
          .filter((tag) =>
            selectedOrVisible(
              selectedEntityValue(tag.fqn, activeRecord(tag)),
              tag.is_hidden,
              includeHidden.tag ?? false,
            ),
          )
          .map(tagOption) ?? [],
    };
    const configs = {
      account: {
        humanValue: (id: number) => accountById.get(id)?.fqn,
        options: options.account,
        selectedIds:
          lookups?.accounts
            .filter((account) =>
              selectedEntityValue(account.fqn, activeRecord(account)),
            )
            .map((account) => account.account_id) ?? [],
      },
      category: {
        humanValue: (id: number) => categoryById.get(id)?.fqn,
        options: options.category,
        selectedIds:
          lookups?.categories
            .filter((category) =>
              selectedEntityValue(category.fqn, activeRecord(category)),
            )
            .map((category) => category.category_id) ?? [],
      },
      member: {
        humanValue: (id: number) => memberById.get(id)?.name,
        options: options.member,
        selectedIds:
          lookups?.members
            .filter((member) =>
              selectedEntityValue(member.name, activeRecord(member)),
            )
            .map((member) => member.member_id) ?? [],
      },
      tag: {
        humanValue: (id: number) => tagById.get(id)?.fqn,
        options: options.tag,
        selectedIds:
          lookups?.tags
            .filter((tag) => selectedEntityValue(tag.fqn, activeRecord(tag)))
            .map((tag) => tag.tag_id) ?? [],
      },
    };
    const config = configs[dimension];
    const resolvedHumanValues = new Set(
      config.selectedIds.flatMap((id) => {
        const value = config.humanValue(id);
        return value ? [value] : [];
      }),
    );
    const unresolvedHumanValues = exactValues.filter(
      (value) => !resolvedHumanValues.has(value),
    );
    const editorId =
      rowIndex === 0 && mode === "any"
        ? `transactions-filter-${dimension}`
        : `transactions-filter-row-${rowIndex}-${dimension}-${mode}`;
    return (
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={includeHidden[dimension] ?? false}
            onCheckedChange={(checked) => {
              setIncludeHidden((current) => ({
                ...current,
                [dimension]: checked === true,
              }));
            }}
          />
          <span className="font-mono text-sm">Include hidden</span>
        </label>
        <EntityMultiPicker
          hierarchical={dimension !== "member"}
          id={editorId}
          label={entityDimensionLabels[dimension]}
          onOpenChange={setEntityPickerOpen}
          options={config.options}
          value={config.selectedIds}
          onChange={(ids) => {
            const nextEntityIdValues = new Set(chip?.entityIdValues);
            const nextHumanValues = new Set(unresolvedHumanValues);
            for (const id of ids) {
              const humanValue = config.humanValue(id);
              if (humanValue) nextHumanValues.add(humanValue);
            }
            const nextValues = [
              ...new Set([...nextEntityIdValues, ...nextHumanValues]),
            ];
            updateMembership(rowIndex, dimension, mode, nextValues, {
              entityIdValues: [...nextEntityIdValues],
              humanEntityValues: [...nextEntityIdValues].filter((value) =>
                nextHumanValues.has(value),
              ),
            });
          }}
        />
        {entityIdValues.size > 0 ? (
          <div className="relative z-40 flex w-full min-w-0 flex-wrap gap-1 overflow-x-hidden p-0.5">
            {[...entityIdValues].map((value, valueIndex) => {
              const presentation = valuePresentation(
                dimension,
                value,
                false,
                true,
              );
              return (
                <span
                  key={value}
                  className="bg-muted inline-flex h-7 max-w-full min-w-0 items-center gap-1 border border-[var(--border-ink)] px-2 font-mono text-xs shadow-[var(--shadow-chip)]"
                >
                  {presentation.hidden ? (
                    <EyeOff aria-label="Hidden" className="size-3 shrink-0" />
                  ) : null}
                  <AppTooltip
                    className="min-w-0 flex-1"
                    focusable={false}
                    label={presentation.tooltip}
                  >
                    <span className="block truncate">{presentation.label}</span>
                  </AppTooltip>
                  <AppTooltip asChild label={`Remove ${presentation.tooltip}`}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0"
                      aria-label={`Remove ${presentation.label}`}
                      data-filter-entity-id-remove
                      onClick={() => {
                        restoreEntityIDLiteralFocusRef.current = valueIndex;
                        const nextEntityIdValues = [...entityIdValues].filter(
                          (candidate) => candidate !== value,
                        );
                        const nextValues =
                          humanEntityValues.has(value) && chip
                            ? chip.values
                            : (chip?.values.filter(
                                (candidate) => candidate !== value,
                              ) ?? []);
                        updateMembership(
                          rowIndex,
                          dimension,
                          mode,
                          nextValues,
                          {
                            entityIdValues: nextEntityIdValues,
                            humanEntityValues: nextEntityIdValues.filter(
                              (candidate) => humanEntityValues.has(candidate),
                            ),
                          },
                        );
                      }}
                    >
                      <Close aria-hidden="true" />
                    </Button>
                  </AppTooltip>
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  const renderMembershipEditor = (
    rowIndex: number,
    dimension: MembershipDimension,
    mode: TransactionFilterMembershipMode,
  ): ReactNode => {
    if (
      dimension === "account" ||
      dimension === "category" ||
      dimension === "tag" ||
      dimension === "member"
    ) {
      return renderEntityEditor(rowIndex, dimension, mode);
    }
    const field = dimension as TransactionFilterMembershipField;
    const selectedValues = membershipChip(rowIndex, field, mode)?.values ?? [];
    const update = (values: readonly string[]) =>
      updateMembership(rowIndex, field, mode, values);
    const idPrefix =
      rowIndex === 0 && mode === "any"
        ? "transactions-filter"
        : `transactions-filter-row-${rowIndex}-${dimension}-${mode}`;
    if (dimension === "currency") {
      return (
        <CurrencyFilterEditor
          idPrefix={idPrefix}
          options={currencyOptions}
          selectedValues={selectedValues}
          onChange={update}
        />
      );
    }
    if (dimension === "lifecycle") {
      return (
        <CheckboxList
          idPrefix={idPrefix}
          values={transactionLifecycleStatuses}
          selectedValues={
            selectedValues as readonly (typeof transactionLifecycleStatuses)[number][]
          }
          labelFor={lifecycleStatusLabel}
          onChange={update}
        />
      );
    }
    if (dimension === "settlement") {
      return (
        <CheckboxList
          idPrefix={idPrefix}
          values={transactionSettlements}
          selectedValues={selectedValues as readonly TransactionSettlement[]}
          labelFor={settlementStatusLabel}
          onChange={update}
        />
      );
    }
    if (dimension === "class") {
      return (
        <CheckboxList
          idPrefix={idPrefix}
          values={transactionClasses}
          selectedValues={selectedValues as readonly TransactionClass[]}
          labelFor={transactionClassLabel}
          onChange={update}
        />
      );
    }
    if (dimension === "shape") {
      return (
        <CheckboxList
          idPrefix={idPrefix}
          values={transactionShapes}
          selectedValues={selectedValues as readonly TransactionShapeType[]}
          labelFor={accountingLabel}
          onChange={update}
        />
      );
    }
    return (
      <CheckboxList
        idPrefix={idPrefix}
        values={recordRoles}
        selectedValues={selectedValues as readonly RecordRole[]}
        labelFor={accountingLabel}
        onChange={update}
      />
    );
  };

  const renderEditor = (rowIndex: number): ReactNode => {
    if (!activeEditor?.dimension) {
      return (
        <div className="grid max-h-[min(28rem,70svh)] grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
          {visibleDimensions.map((dimension) => (
            <Button
              key={dimension.id}
              type="button"
              variant="ghost"
              className="justify-start"
              data-filter-dimension={dimension.id}
              onClick={() => {
                const existing = rows[rowIndex]?.chips.find(
                  (chip) => dimensionForChip(chip) === dimension.id,
                );
                const availableMode = dimension.modes?.find(
                  (mode) =>
                    !rows[rowIndex]?.chips.some(
                      (chip) =>
                        chip.kind === "membership" &&
                        chip.field === dimension.field &&
                        chip.mode === mode,
                    ),
                );
                openEditor({
                  dimension: dimension.id,
                  mode:
                    availableMode ??
                    (existing?.kind === "membership" ? existing.mode : "any"),
                  rowIndex,
                });
              }}
            >
              {dimension.label}
            </Button>
          ))}
        </div>
      );
    }

    const definition = dimensionById.get(activeEditor.dimension)!;
    if (definition.modes) {
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 font-mono text-xs">
            <span>Match</span>
            <Select
              value={activeEditor.mode}
              onValueChange={(value) => {
                const nextMode = value as TransactionFilterMembershipMode;
                if (
                  !changeMembershipMode(
                    rowIndex,
                    activeEditor.dimension as TransactionFilterMembershipField,
                    activeEditor.mode,
                    nextMode,
                  )
                ) {
                  return;
                }
                setEditor((current) =>
                  current
                    ? {
                        ...current,
                        mode: nextMode,
                        previousMode: current.mode,
                      }
                    : current,
                );
              }}
            >
              <SelectTrigger
                aria-label="Filter operator"
                className="w-full"
                onKeyDown={(event) => {
                  if (
                    event.key.toLowerCase() === "n" &&
                    !event.altKey &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.shiftKey
                  ) {
                    event.stopPropagation();
                  }
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {definition.modes.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {modeLabel(mode)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {renderMembershipEditor(
            rowIndex,
            activeEditor.dimension as MembershipDimension,
            activeEditor.mode,
          )}
        </div>
      );
    }

    const rangeChip = rows[rowIndex]?.chips.find(
      (chip) =>
        chip.kind === "range" &&
        dimensionForChip(chip) === activeEditor.dimension,
    ) as Extract<TransactionFilterChip, { readonly kind: "range" }> | undefined;
    return (
      <RangeEditor
        formatHint={
          activeEditor.dimension === "initiated"
            ? "Use YYYY-MM-DD, RFC3339, or a signed offset such as -30d."
            : undefined
        }
        inputMode={activeEditor.dimension === "initiated" ? "text" : "decimal"}
        fromLabel={activeEditor.dimension === "initiated" ? "From" : "Min"}
        toLabel={activeEditor.dimension === "initiated" ? "To" : "Max"}
        fromValue={rangeChip?.from}
        toValue={rangeChip?.to}
        pattern={
          activeEditor.dimension === "initiated"
            ? transactionFilterDatePattern
            : transactionFilterDecimalPattern
        }
        onChange={(from, to) => {
          updateRange(
            rowIndex,
            definition.field as "amount" | "amount_usd" | "initiated",
            from,
            to,
          );
        }}
      />
    );
  };

  const valuePresentation = (
    field: TransactionFilterMembershipField,
    value: string,
    scoped = false,
    entityId = false,
  ): { hidden?: boolean; label: string; tooltip: string } => {
    if (entityId) {
      const id = entityIDFromLiteral(value);
      const entity =
        id === undefined
          ? undefined
          : field === "account"
            ? accountById.get(id)
            : field === "category"
              ? categoryById.get(id)
              : field === "tag"
                ? tagById.get(id)
                : memberById.get(id);
      return {
        hidden: entity?.is_hidden,
        label: entity ? `${entity.name} (${value})` : value,
        tooltip: entity
          ? `${"fqn" in entity ? entity.fqn : entity.name} (${value})`
          : value,
      };
    }
    if (field === "account") {
      const fqn = scoped && value !== "*" ? value.slice(0, -2) : value;
      const account = lookups?.accounts.find(
        (candidate) => candidate.fqn === fqn,
      );
      return {
        hidden: account?.is_hidden,
        label: scoped ? `group ${fqn}` : (account?.name ?? fqn),
        tooltip: value,
      };
    }
    if (field === "category" || field === "tag") {
      const fqn = scoped && value !== "*" ? value.slice(0, -2) : value;
      const candidate =
        field === "category"
          ? lookups?.categories.find((item) => item.fqn === fqn)
          : lookups?.tags.find((item) => item.fqn === fqn);
      return {
        hidden: candidate?.is_hidden,
        label: scoped ? `group ${fqn}` : (candidate?.name ?? fqn),
        tooltip: value,
      };
    }
    if (field === "member") {
      const member = lookups?.members.find(
        (candidate) => candidate.name === value,
      );
      return { hidden: member?.is_hidden, label: value, tooltip: value };
    }
    if (field === "lifecycle") {
      return {
        label: lifecycleStatusLabel(
          value as (typeof transactionLifecycleStatuses)[number],
        ),
        tooltip: value,
      };
    }
    if (field === "settlement") {
      return {
        label: settlementChipValueLabel(value as TransactionSettlement),
        tooltip: value,
      };
    }
    if (field === "class") {
      return {
        label: transactionClassLabel(value as TransactionClass),
        tooltip: value,
      };
    }
    if (field === "shape" || field === "role") {
      return {
        label: accountingLabel(value as RecordRole),
        tooltip: value,
      };
    }
    return { label: value, tooltip: value };
  };

  const chipPresentation = (
    chip: TransactionFilterChip,
  ): {
    hidden?: boolean;
    label: string;
    labelSuffix?: string;
    tooltip: string;
    truncateLabel?: boolean;
  } => {
    const dimension = dimensionById.get(dimensionForChip(chip))!;
    if (chip.kind === "range") {
      const dimensionLabel =
        chip.field === "initiated" ? "Initiated" : dimension.label;
      const label =
        rangeLabel(dimensionLabel, chip.from, chip.to) ?? dimensionLabel;
      return {
        label,
        tooltip: label,
        truncateLabel: chip.field === "initiated",
      };
    }
    const values = chip.values.flatMap((value) => {
      const entityId = chip.entityIdValues?.includes(value) ?? false;
      const humanEntity = chip.humanEntityValues?.includes(value) ?? false;
      return [
        ...(entityId
          ? [valuePresentation(chip.field, value, false, true)]
          : []),
        ...(!entityId || humanEntity
          ? [
              valuePresentation(
                chip.field,
                value,
                chip.scopedValues?.includes(value),
              ),
            ]
          : []),
      ];
    });
    const describedValues = values.map((value) =>
      value.hidden ? `${value.label} (hidden)` : value.label,
    );
    const describedTooltips = values.map((value) =>
      value.hidden ? `${value.tooltip} (hidden)` : value.tooltip,
    );
    const label = `${dimension.label} ${describedValues.join(", ")}`;
    const labelSuffix = ` · ${modeLabel(chip.mode).toLowerCase()}`;
    return {
      hidden: values.some((value) => value.hidden),
      label,
      labelSuffix,
      tooltip: `${dimension.label} ${describedTooltips.join(", ")}${labelSuffix}`,
    };
  };

  if (advanced) {
    return (
      <div
        data-testid="transaction-filter-advanced"
        className="flex min-w-0 items-start gap-3 border-2 border-[var(--border-ink)] bg-[var(--band)] p-3"
        aria-label="Advanced transaction filter"
      >
        <div className="min-w-0 flex-1">
          <p className="font-heading text-xs font-semibold uppercase">
            Advanced filter
          </p>
          <code className="mt-1 block font-mono text-sm break-all whitespace-pre-wrap">
            {filters.filterText}
          </code>
        </div>
        <Button
          ref={advancedClearButtonRef}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            restoreAdvancedClearFocusRef.current = true;
            onChange(withTransactionFilterExpression(filters, undefined));
          }}
        >
          <Close aria-hidden="true" className="size-4" />
          Clear
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={controlsRef}
      className="flex min-w-0 flex-col gap-2"
      aria-label="Transaction filters"
    >
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="contents">
          {rowIndex > 0 ? (
            <div
              className="flex items-center gap-2"
              role="separator"
              aria-label="OR"
            >
              <span className="h-px flex-1 bg-[var(--hairline)]" />
              <span
                className="font-heading text-xs font-semibold uppercase"
                aria-hidden="true"
              >
                OR
              </span>
              <span className="h-px flex-1 bg-[var(--hairline)]" />
            </div>
          ) : null}
          <div
            data-testid={`transaction-filter-row-${rowIndex + 1}`}
            className={
              rows.length > 1
                ? "flex min-w-0 flex-wrap items-center gap-2 border-2 border-[var(--border-ink)] bg-[var(--band)] p-2"
                : "flex min-w-0 flex-wrap items-center gap-2"
            }
          >
            {rows.length > 1 ? (
              <span className="font-heading mr-1 text-xs font-semibold uppercase">
                Row {rowIndex + 1}
              </span>
            ) : null}
            <Popover
              open={activeEditor?.rowIndex === rowIndex}
              onOpenChange={(open) => {
                setEntityPickerOpen(false);
                if (open) openEditor({ mode: "any", rowIndex });
                else {
                  setEditor(undefined);
                }
              }}
            >
              <AppTooltip
                asChild
                disabled={activeEditor?.rowIndex === rowIndex}
                label={
                  rows.length > 1
                    ? `Add filter to row ${rowIndex + 1}`
                    : "Add filter"
                }
              >
                <PopoverTrigger asChild>
                  <Button
                    ref={(element) => {
                      if (element)
                        addFilterTriggerRefs.current.set(rowIndex, element);
                      else addFilterTriggerRefs.current.delete(rowIndex);
                    }}
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    aria-label={
                      rows.length > 1
                        ? `Add filter to row ${rowIndex + 1}`
                        : "Add filter"
                    }
                  >
                    <Filter aria-hidden="true" />
                  </Button>
                </PopoverTrigger>
              </AppTooltip>
              <PopoverContent
                className="max-w-[calc(100vw-1rem)]"
                onOpenAutoFocus={(event) => {
                  if (!activeEditor?.dimension) return;
                  event.preventDefault();
                  editorRef.current
                    ?.querySelector<HTMLElement>(editorFocusableSelector)
                    ?.focus();
                }}
                onCloseAutoFocus={(event) => {
                  const focusTarget = restoreEditedChipOnCloseRef.current;
                  if (focusTarget) {
                    event.preventDefault();
                    restoreEditedChipAfterCloseRef.current = true;
                    window.requestAnimationFrame(() => {
                      const target = restoreEditedChipOnCloseRef.current;
                      if (!target || sourceRef.current !== target.source)
                        return;
                      const liveTrigger =
                        controlsRef.current?.querySelector<HTMLButtonElement>(
                          `[data-filter-chip-edit="${target.editKey}"]`,
                        );
                      restoreEditedChipOnCloseRef.current = undefined;
                      restoreEditedChipAfterCloseRef.current = false;
                      focusWithoutTooltip(
                        liveTrigger ??
                          addFilterTriggerRefs.current.get(rowIndex),
                      );
                    });
                    return;
                  }
                  if (restoreAddFilterTriggerFocusRef.current !== rowIndex)
                    return;
                  restoreAddFilterTriggerFocusRef.current = undefined;
                  event.preventDefault();
                  focusWithoutTooltip(
                    addFilterTriggerRefs.current.get(rowIndex),
                  );
                }}
                onEscapeKeyDown={(event) => {
                  if (
                    event.target instanceof HTMLInputElement &&
                    event.target.list !== null &&
                    !event.target.disabled &&
                    !event.target.readOnly &&
                    datalistEscapePendingRef.current
                  ) {
                    event.preventDefault();
                    datalistKeyboardCommitTargetRef.current = null;
                    datalistPointerTargetRef.current = null;
                    datalistEscapePendingRef.current = false;
                    return;
                  }
                  if (entityPickerOpen) {
                    event.preventDefault();
                    return;
                  }
                  const currentEditKey = activeEditor?.dimension
                    ? `${rowIndex}:${activeEditor.dimension}:${dimensionById.get(activeEditor.dimension)?.modes ? activeEditor.mode : "range"}`
                    : undefined;
                  if (currentEditKey) {
                    restoreEditedChipAfterCloseRef.current = false;
                    restoreEditedChipOnCloseRef.current = {
                      editKey: currentEditKey,
                      source: activeEditor?.currentSource ?? source,
                    };
                  } else {
                    restoreAddFilterTriggerFocusRef.current = rowIndex;
                  }
                }}
                onKeyDownCapture={(event) => {
                  if (
                    event.key === "Enter" &&
                    event.target instanceof HTMLInputElement &&
                    event.target.list !== null &&
                    datalistEscapePendingRef.current
                  ) {
                    datalistKeyboardCommitTargetRef.current = event.target;
                    datalistPointerTargetRef.current = null;
                    datalistEscapePendingRef.current = false;
                    return;
                  }
                  if (
                    (event.key === "ArrowDown" || event.key === "ArrowUp") &&
                    event.target instanceof HTMLInputElement &&
                    event.target.list !== null &&
                    !event.target.disabled &&
                    !event.target.readOnly &&
                    hasMatchingDatalistOption(event.target)
                  ) {
                    datalistEscapePendingRef.current = true;
                    return;
                  }
                  if (event.key !== "Escape") {
                    datalistKeyboardCommitTargetRef.current = null;
                    datalistPointerTargetRef.current = null;
                    datalistEscapePendingRef.current = false;
                  }
                }}
                onKeyUpCapture={(event) => {
                  if (
                    event.key === "Enter" &&
                    event.target === datalistKeyboardCommitTargetRef.current
                  ) {
                    datalistKeyboardCommitTargetRef.current = null;
                  }
                }}
                onPointerDownCapture={(event) => {
                  const target =
                    event.target instanceof HTMLInputElement &&
                    event.target.list !== null &&
                    !event.target.disabled &&
                    !event.target.readOnly &&
                    hasMatchingDatalistOption(event.target)
                      ? event.target
                      : null;
                  datalistKeyboardCommitTargetRef.current = null;
                  datalistPointerTargetRef.current = target;
                  datalistEscapePendingRef.current = target !== null;
                }}
                onPointerDownOutside={() => {
                  datalistKeyboardCommitTargetRef.current = null;
                  datalistPointerTargetRef.current = null;
                  datalistEscapePendingRef.current = false;
                }}
                onFocusCapture={(event) => {
                  if (event.target === datalistPointerTargetRef.current) {
                    datalistPointerTargetRef.current = null;
                    return;
                  }
                  datalistKeyboardCommitTargetRef.current = null;
                  datalistPointerTargetRef.current = null;
                  datalistEscapePendingRef.current = false;
                }}
                onInputCapture={(event) => {
                  if (
                    event.target === datalistKeyboardCommitTargetRef.current
                  ) {
                    datalistKeyboardCommitTargetRef.current = null;
                    datalistEscapePendingRef.current = false;
                    return;
                  }
                  if (event.target === datalistPointerTargetRef.current) {
                    datalistPointerTargetRef.current = null;
                    datalistEscapePendingRef.current = false;
                    return;
                  }
                  datalistEscapePendingRef.current =
                    event.target instanceof HTMLInputElement &&
                    event.target.list !== null &&
                    !event.target.disabled &&
                    !event.target.readOnly &&
                    hasMatchingDatalistOption(event.target);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") event.stopPropagation();
                }}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-heading text-sm font-semibold uppercase">
                      {activeEditor?.dimension
                        ? dimensionById.get(activeEditor.dimension)?.label
                        : rows.length > 1
                          ? `Add filter · Row ${rowIndex + 1}`
                          : "Add filter"}
                    </h2>
                    {activeEditor?.dimension ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setEntityPickerOpen(false);
                          restoreDimensionMenuFocusRef.current =
                            activeEditor.dimension;
                          openEditor({ mode: "any", rowIndex });
                        }}
                      >
                        Back
                      </Button>
                    ) : null}
                  </div>
                  <div ref={editorRef}>{renderEditor(rowIndex)}</div>
                </div>
              </PopoverContent>
            </Popover>
            <div
              className="flex min-w-0 shrink-0 basis-full flex-wrap items-center gap-2 sm:flex-1 sm:shrink sm:basis-0"
              aria-label={`Active filters in row ${rowIndex + 1}`}
            >
              {row.chips.map((chip, chipIndex) => {
                if (hiddenDimensionSet.has(dimensionForChip(chip))) return null;
                const presentation = chipPresentation(chip);
                return (
                  <div
                    key={`${chip.kind}-${chip.field}-${chip.kind === "membership" ? chip.mode : "range"}`}
                    className="flex max-w-full min-w-0 shrink-0 items-center gap-2"
                    data-filter-chip-group
                  >
                    {chipIndex >
                    row.chips.findIndex(
                      (candidate) =>
                        !hiddenDimensionSet.has(dimensionForChip(candidate)),
                    ) ? (
                      <span className="font-heading text-muted-foreground shrink-0 text-xs font-semibold uppercase">
                        AND
                      </span>
                    ) : null}
                    <div className="max-w-full min-w-0">
                      <FilterChip
                        {...presentation}
                        editKey={`${rowIndex}:${dimensionForChip(chip)}:${chip.kind === "membership" ? chip.mode : "range"}`}
                        onEdit={() => {
                          openEditor({
                            dimension: dimensionForChip(chip),
                            mode:
                              chip.kind === "membership" ? chip.mode : "any",
                            rowIndex,
                          });
                        }}
                        onRemove={() => {
                          updateRow(
                            rowIndex,
                            row.chips.filter((_, index) => index !== chipIndex),
                          );
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {rowIndex === rows.length - 1 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  const nextRows = [...rows, { chips: [] }];
                  setRowState({ rows: nextRows, source });
                  openEditor({
                    mode: "any",
                    rowIndex: nextRows.length - 1,
                  });
                }}
              >
                <Plus aria-hidden="true" className="size-4" />
                Add OR row
              </Button>
            ) : null}
            {rows.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remove row ${rowIndex + 1}`}
                onClick={() => removeRow(rowIndex)}
              >
                <Trash aria-hidden="true" />
                Remove row
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
};
