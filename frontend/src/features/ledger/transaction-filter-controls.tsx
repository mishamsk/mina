import { Close, EyeOff, Filter } from "pixelarticons/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import type { Account, Category, Member, Tag } from "@/api";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TransactionFilters } from "@/models/transaction-filters";
import {
  transactionFilterDecimalPattern,
  transactionPostingStatuses,
} from "@/models/transaction-filters";
import type { LedgerLookupsSnapshot } from "@/store";

import { EntityMultiPicker, type EntityOption } from "./entity-picker";
import { postingStatusLabel } from "./format";

type EntityDimension = "account" | "category" | "tag" | "member";
type RangeDimension =
  "amount" | "amountUsd" | "initiated" | "pending" | "posted";
export type TransactionFilterDimension =
  EntityDimension | "status" | RangeDimension;

interface TransactionFilterControlsProps {
  readonly filters: TransactionFilters;
  readonly hiddenDimensions?: readonly TransactionFilterDimension[];
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly onChange: (filters: TransactionFilters) => void;
  readonly onOpenChange?: (open: boolean) => void;
}

interface DimensionDefinition {
  readonly id: TransactionFilterDimension;
  readonly label: string;
}

const dimensions: readonly DimensionDefinition[] = [
  { id: "account", label: "Account" },
  { id: "category", label: "Category" },
  { id: "tag", label: "Tag" },
  { id: "member", label: "Member" },
  { id: "status", label: "Posting status" },
  { id: "amount", label: "Amount" },
  { id: "amountUsd", label: "Amount USD" },
  { id: "initiated", label: "Initiated date" },
  { id: "pending", label: "Pending date" },
  { id: "posted", label: "Posted date" },
];

const editorFocusableSelector = [
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

const activeRecord = <T extends { readonly tombstoned_at?: string | null }>(
  value: T,
): boolean => !value.tombstoned_at;

const accountOption = (account: Account): EntityOption => ({
  detail: account.fqn,
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
  id: number,
  selectedIds: readonly number[],
  hidden: boolean,
  includeHidden: boolean,
): boolean => selectedIds.includes(id) || !hidden || includeHidden;

const rangeLabel = (
  label: string,
  from: string | undefined,
  to: string | undefined,
): string | undefined => {
  if (from && to) {
    return `${label} ${from}-${to}`;
  }
  if (from) {
    return `${label} >= ${from}`;
  }
  if (to) {
    return `${label} <= ${to}`;
  }
  return undefined;
};

const filterCount = (
  filters: TransactionFilters,
  hiddenDimensions: ReadonlySet<TransactionFilterDimension>,
): number =>
  (hiddenDimensions.has("account") ? 0 : filters.accountIds.length) +
  (hiddenDimensions.has("category") ? 0 : filters.categoryIds.length) +
  (hiddenDimensions.has("tag") ? 0 : filters.tagIds.length) +
  (hiddenDimensions.has("member") ? 0 : filters.memberIds.length) +
  (hiddenDimensions.has("status") ? 0 : filters.statuses.length) +
  [
    hiddenDimensions.has("amount")
      ? undefined
      : rangeLabel("Amount", filters.amountMin, filters.amountMax),
    hiddenDimensions.has("amountUsd")
      ? undefined
      : rangeLabel("Amount USD", filters.amountUsdMin, filters.amountUsdMax),
    hiddenDimensions.has("initiated")
      ? undefined
      : rangeLabel("Initiated", filters.initiatedFrom, filters.initiatedTo),
    hiddenDimensions.has("pending")
      ? undefined
      : rangeLabel("Pending", filters.pendingFrom, filters.pendingTo),
    hiddenDimensions.has("posted")
      ? undefined
      : rangeLabel("Posted", filters.postedFrom, filters.postedTo),
  ].filter(Boolean).length;

export const hasActiveTransactionFilterChips = (
  filters: TransactionFilters,
  hiddenDimensions: readonly TransactionFilterDimension[] = [],
): boolean => filterCount(filters, new Set(hiddenDimensions)) > 0;

interface FilterChipProps {
  readonly hidden?: boolean;
  readonly label: string;
  readonly onRemove: () => void;
  readonly truncateLabel?: boolean;
  readonly tooltip?: string;
}

const FilterChip = ({
  hidden,
  label,
  onRemove,
  truncateLabel = true,
  tooltip,
}: FilterChipProps) => {
  const tooltipText = tooltip ?? label;
  const chip = (
    <Badge
      variant="secondary"
      className={[
        truncateLabel
          ? "max-w-64"
          : "h-auto min-h-5 max-w-full overflow-visible py-1 whitespace-normal",
        "justify-start gap-1 normal-case",
      ].join(" ")}
    >
      {hidden ? <EyeOff aria-label="Hidden" className="size-3" /> : null}
      <span
        className={truncateLabel ? "truncate" : "break-all whitespace-normal"}
      >
        {label}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
      >
        <Close aria-hidden="true" />
      </Button>
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
};

interface CheckboxListProps<T extends string> {
  readonly labelFor: (value: T) => string;
  readonly onChange: (values: readonly T[]) => void;
  readonly values: readonly T[];
  readonly selectedValues: readonly T[];
}

const CheckboxList = <T extends string>({
  labelFor,
  onChange,
  selectedValues,
  values,
}: CheckboxListProps<T>) => (
  <div className="flex flex-col gap-2">
    {values.map((value) => {
      const checked = selectedValues.includes(value);
      const id = `transactions-filter-${value}`;
      return (
        <label key={value} htmlFor={id} className="flex items-center gap-2">
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
          <span className="font-mono text-sm">{labelFor(value)}</span>
        </label>
      );
    })}
  </div>
);

interface RangeEditorProps {
  readonly fromLabel: string;
  readonly fromValue: string | undefined;
  readonly inputType?: "date" | "text";
  readonly onChange: (from: string | undefined, to: string | undefined) => void;
  readonly pattern?: RegExp;
  readonly toLabel: string;
  readonly toValue: string | undefined;
}

const RangeEditor = ({
  fromLabel,
  fromValue,
  inputType = "text",
  onChange,
  pattern,
  toLabel,
  toValue,
}: RangeEditorProps) => {
  const [draftState, setDraftState] = useState({
    fromDraft: fromValue ?? "",
    fromValue,
    toDraft: toValue ?? "",
    toValue,
  });
  const draftMatchesValues =
    draftState.fromValue === fromValue && draftState.toValue === toValue;
  const fromDraft = draftMatchesValues
    ? draftState.fromDraft
    : (fromValue ?? "");
  const toDraft = draftMatchesValues ? draftState.toDraft : (toValue ?? "");

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
    if (value && pattern && !pattern.test(value)) {
      return;
    }

    const normalizeDraft = (
      draft: string,
      previousValue: string | undefined,
    ): string | undefined => {
      const nextValue = draft.trim();
      if (!nextValue) {
        return undefined;
      }
      if (pattern && !pattern.test(nextValue)) {
        return previousValue;
      }
      return nextValue;
    };

    onChange(
      normalizeDraft(nextFromDraft, fromValue),
      normalizeDraft(nextToDraft, toValue),
    );
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1 font-mono text-xs">
        {fromLabel}
        <input
          type={inputType}
          inputMode={inputType === "text" ? "decimal" : undefined}
          className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]"
          value={fromDraft}
          onChange={(event) => {
            update("from", event.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 font-mono text-xs">
        {toLabel}
        <input
          type={inputType}
          inputMode={inputType === "text" ? "decimal" : undefined}
          className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]"
          value={toDraft}
          onChange={(event) => {
            update("to", event.target.value);
          }}
        />
      </label>
    </div>
  );
};

export const TransactionFilterControls = ({
  filters,
  hiddenDimensions = [],
  lookups,
  onChange,
  onOpenChange,
}: TransactionFilterControlsProps) => {
  const addFilterTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreAddFilterTriggerFocusRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [selectedDimension, setSelectedDimension] =
    useState<TransactionFilterDimension>();
  const [includeHidden, setIncludeHidden] = useState<
    Partial<Record<EntityDimension, boolean>>
  >({});
  const [entityPickerOpen, setEntityPickerOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const restoreDimensionRef = useRef<TransactionFilterDimension | undefined>(
    undefined,
  );
  const hiddenDimensionSet = useMemo(
    () => new Set<TransactionFilterDimension>(hiddenDimensions),
    [hiddenDimensions],
  );
  const visibleDimensions = useMemo(
    () =>
      dimensions.filter((dimension) => !hiddenDimensionSet.has(dimension.id)),
    [hiddenDimensionSet],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (selectedDimension) {
        const firstEditorControl =
          editorRef.current?.querySelector<HTMLElement>(
            editorFocusableSelector,
          );
        firstEditorControl?.focus();
        return;
      }

      if (!restoreDimensionRef.current) {
        return;
      }

      const dimensionButton = editorRef.current?.querySelector<HTMLElement>(
        `[data-filter-dimension="${restoreDimensionRef.current}"]`,
      );
      restoreDimensionRef.current = undefined;
      dimensionButton?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [open, selectedDimension]);

  const accountOptions = useMemo(
    () =>
      lookups?.accounts
        .filter(activeRecord)
        .filter((account) =>
          selectedOrVisible(
            account.account_id,
            filters.accountIds,
            account.is_hidden,
            includeHidden.account ?? false,
          ),
        )
        .map(accountOption) ?? [],
    [filters.accountIds, includeHidden.account, lookups?.accounts],
  );
  const categoryOptions = useMemo(
    () =>
      lookups?.categories
        .filter(activeRecord)
        .filter((category) =>
          selectedOrVisible(
            category.category_id,
            filters.categoryIds,
            category.is_hidden,
            includeHidden.category ?? false,
          ),
        )
        .map(categoryOption) ?? [],
    [filters.categoryIds, includeHidden.category, lookups?.categories],
  );
  const tagOptions = useMemo(
    () =>
      lookups?.tags
        .filter(activeRecord)
        .filter((tag) =>
          selectedOrVisible(
            tag.tag_id,
            filters.tagIds,
            tag.is_hidden,
            includeHidden.tag ?? false,
          ),
        )
        .map(tagOption) ?? [],
    [filters.tagIds, includeHidden.tag, lookups?.tags],
  );
  const memberOptions = useMemo(
    () =>
      lookups?.members
        .filter(activeRecord)
        .filter((member) =>
          selectedOrVisible(
            member.member_id,
            filters.memberIds,
            member.is_hidden,
            includeHidden.member ?? false,
          ),
        )
        .map(memberOption) ?? [],
    [filters.memberIds, includeHidden.member, lookups?.members],
  );
  const accountsById = useMemo(
    () => mapById(lookups?.accounts, (account) => account.account_id),
    [lookups?.accounts],
  );
  const categoriesById = useMemo(
    () => mapById(lookups?.categories, (category) => category.category_id),
    [lookups?.categories],
  );
  const tagsById = useMemo(
    () => mapById(lookups?.tags, (tag) => tag.tag_id),
    [lookups?.tags],
  );
  const membersById = useMemo(
    () => mapById(lookups?.members, (member) => member.member_id),
    [lookups?.members],
  );
  const activeFilterCount = filterCount(filters, hiddenDimensionSet);

  const updateFilters = (nextFilters: TransactionFilters) => {
    onChange(nextFilters);
  };

  const selectDimension = (
    dimension: TransactionFilterDimension | undefined,
  ) => {
    setEntityPickerOpen(false);
    setSelectedDimension(dimension);
  };

  const renderEntityEditor = (dimension: EntityDimension): ReactNode => {
    const configs = {
      account: {
        hiddenToggle: true,
        label: "Accounts",
        options: accountOptions,
        setValue: (ids: readonly number[]) => {
          updateFilters({ ...filters, accountIds: ids });
        },
        value: filters.accountIds,
      },
      category: {
        hiddenToggle: true,
        label: "Categories",
        options: categoryOptions,
        setValue: (ids: readonly number[]) => {
          updateFilters({ ...filters, categoryIds: ids });
        },
        value: filters.categoryIds,
      },
      member: {
        hiddenToggle: true,
        label: "Members",
        options: memberOptions,
        setValue: (ids: readonly number[]) => {
          updateFilters({ ...filters, memberIds: ids });
        },
        value: filters.memberIds,
      },
      tag: {
        hiddenToggle: true,
        label: "Tags",
        options: tagOptions,
        setValue: (ids: readonly number[]) => {
          updateFilters({ ...filters, tagIds: ids });
        },
        value: filters.tagIds,
      },
    } satisfies Record<
      EntityDimension,
      {
        readonly hiddenToggle: boolean;
        readonly label: string;
        readonly options: readonly EntityOption[];
        readonly setValue: (ids: readonly number[]) => void;
        readonly value: readonly number[];
      }
    >;
    const config = configs[dimension];

    return (
      <div className="flex flex-col gap-3">
        {config.hiddenToggle ? (
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
        ) : null}
        <EntityMultiPicker
          id={`transactions-filter-${dimension}`}
          label={config.label}
          onOpenChange={setEntityPickerOpen}
          options={config.options}
          value={config.value}
          onChange={config.setValue}
        />
      </div>
    );
  };

  const renderEditor = (): ReactNode => {
    if (!selectedDimension) {
      return (
        <div className="grid grid-cols-1 gap-1">
          {visibleDimensions.map((dimension) => (
            <Button
              key={dimension.id}
              type="button"
              variant="ghost"
              className="justify-start"
              data-filter-dimension={dimension.id}
              onClick={() => {
                restoreDimensionRef.current = dimension.id;
                selectDimension(dimension.id);
              }}
            >
              {dimension.label}
            </Button>
          ))}
        </div>
      );
    }

    if (
      selectedDimension === "account" ||
      selectedDimension === "category" ||
      selectedDimension === "tag" ||
      selectedDimension === "member"
    ) {
      return renderEntityEditor(selectedDimension);
    }

    if (selectedDimension === "status") {
      return (
        <CheckboxList
          values={transactionPostingStatuses}
          selectedValues={filters.statuses}
          labelFor={postingStatusLabel}
          onChange={(statuses) => {
            updateFilters({ ...filters, statuses });
          }}
        />
      );
    }

    if (selectedDimension === "amount") {
      return (
        <RangeEditor
          fromLabel="Min"
          toLabel="Max"
          fromValue={filters.amountMin}
          toValue={filters.amountMax}
          pattern={transactionFilterDecimalPattern}
          onChange={(amountMin, amountMax) => {
            updateFilters({ ...filters, amountMax, amountMin });
          }}
        />
      );
    }

    if (selectedDimension === "amountUsd") {
      return (
        <RangeEditor
          fromLabel="Min"
          toLabel="Max"
          fromValue={filters.amountUsdMin}
          toValue={filters.amountUsdMax}
          pattern={transactionFilterDecimalPattern}
          onChange={(amountUsdMin, amountUsdMax) => {
            updateFilters({ ...filters, amountUsdMax, amountUsdMin });
          }}
        />
      );
    }

    const dateConfigs = {
      initiated: {
        from: filters.initiatedFrom,
        setValue: (
          initiatedFrom: string | undefined,
          initiatedTo: string | undefined,
        ) => {
          updateFilters({ ...filters, initiatedFrom, initiatedTo });
        },
        to: filters.initiatedTo,
      },
      pending: {
        from: filters.pendingFrom,
        setValue: (
          pendingFrom: string | undefined,
          pendingTo: string | undefined,
        ) => {
          updateFilters({ ...filters, pendingFrom, pendingTo });
        },
        to: filters.pendingTo,
      },
      posted: {
        from: filters.postedFrom,
        setValue: (
          postedFrom: string | undefined,
          postedTo: string | undefined,
        ) => {
          updateFilters({ ...filters, postedFrom, postedTo });
        },
        to: filters.postedTo,
      },
    } satisfies Record<
      "initiated" | "pending" | "posted",
      {
        readonly from: string | undefined;
        readonly setValue: (
          from: string | undefined,
          to: string | undefined,
        ) => void;
        readonly to: string | undefined;
      }
    >;
    const config = dateConfigs[selectedDimension];
    return (
      <RangeEditor
        inputType="date"
        fromLabel="From"
        toLabel="To"
        fromValue={config.from}
        toValue={config.to}
        onChange={config.setValue}
      />
    );
  };

  const selectedDimensionLabel = dimensions.find(
    (dimension) => dimension.id === selectedDimension,
  )?.label;

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-2"
      aria-label="Transaction filters"
    >
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          onOpenChange?.(nextOpen);
          if (!nextOpen) {
            selectDimension(undefined);
          }
        }}
      >
        <AppTooltip asChild disabled={open} label="Add filter">
          <PopoverTrigger asChild>
            <Button
              ref={addFilterTriggerRef}
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Add filter"
            >
              <Filter aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </AppTooltip>
        <PopoverContent
          onCloseAutoFocus={(event) => {
            if (!restoreAddFilterTriggerFocusRef.current) {
              return;
            }

            restoreAddFilterTriggerFocusRef.current = false;
            event.preventDefault();
            focusWithoutTooltip(addFilterTriggerRef.current);
          }}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            if (entityPickerOpen) {
              return;
            }
            restoreAddFilterTriggerFocusRef.current = true;
            setOpen(false);
            onOpenChange?.(false);
            selectDimension(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
            }
          }}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading text-sm font-semibold uppercase">
                {selectedDimensionLabel ?? "Add filter"}
              </h2>
              {selectedDimension ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    selectDimension(undefined);
                  }}
                >
                  Back
                </Button>
              ) : null}
            </div>
            <div ref={editorRef}>{renderEditor()}</div>
          </div>
        </PopoverContent>
      </Popover>
      {activeFilterCount > 0 ? (
        <div
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
          aria-label="Active transaction filters"
        >
          {!hiddenDimensionSet.has("account")
            ? filters.accountIds.map((accountId) => {
                const account = accountsById.get(accountId);
                return (
                  <FilterChip
                    key={`account-${accountId}`}
                    hidden={account?.is_hidden}
                    label={
                      account
                        ? `Account ${account.name}`
                        : `Account #${accountId}`
                    }
                    tooltip={account?.fqn ?? `Selected account ID ${accountId}`}
                    onRemove={() => {
                      updateFilters({
                        ...filters,
                        accountIds: filters.accountIds.filter(
                          (selectedAccountId) =>
                            selectedAccountId !== accountId,
                        ),
                      });
                    }}
                  />
                );
              })
            : null}
          {!hiddenDimensionSet.has("category")
            ? filters.categoryIds.map((categoryId) => {
                const category = categoriesById.get(categoryId);
                return (
                  <FilterChip
                    key={`category-${categoryId}`}
                    hidden={category?.is_hidden}
                    label={
                      category
                        ? `Category ${category.name}`
                        : `Category #${categoryId}`
                    }
                    tooltip={
                      category?.fqn ?? `Selected category ID ${categoryId}`
                    }
                    onRemove={() => {
                      updateFilters({
                        ...filters,
                        categoryIds: filters.categoryIds.filter(
                          (selectedCategoryId) =>
                            selectedCategoryId !== categoryId,
                        ),
                      });
                    }}
                  />
                );
              })
            : null}
          {!hiddenDimensionSet.has("tag")
            ? filters.tagIds.map((tagId) => {
                const tag = tagsById.get(tagId);
                return (
                  <FilterChip
                    key={`tag-${tagId}`}
                    hidden={tag?.is_hidden}
                    label={tag ? `Tag ${tag.name}` : `Tag #${tagId}`}
                    tooltip={tag?.fqn ?? `Selected tag ID ${tagId}`}
                    onRemove={() => {
                      updateFilters({
                        ...filters,
                        tagIds: filters.tagIds.filter(
                          (selectedTagId) => selectedTagId !== tagId,
                        ),
                      });
                    }}
                  />
                );
              })
            : null}
          {!hiddenDimensionSet.has("member")
            ? filters.memberIds.map((memberId) => {
                const member = membersById.get(memberId);
                return (
                  <FilterChip
                    key={`member-${memberId}`}
                    hidden={member?.is_hidden}
                    label={
                      member ? `Member ${member.name}` : `Member #${memberId}`
                    }
                    tooltip={
                      member ? undefined : `Selected member ID ${memberId}`
                    }
                    onRemove={() => {
                      updateFilters({
                        ...filters,
                        memberIds: filters.memberIds.filter(
                          (selectedMemberId) => selectedMemberId !== memberId,
                        ),
                      });
                    }}
                  />
                );
              })
            : null}
          {!hiddenDimensionSet.has("status")
            ? filters.statuses.map((status) => (
                <FilterChip
                  key={`status-${status}`}
                  label={`Status ${postingStatusLabel(status)}`}
                  onRemove={() => {
                    updateFilters({
                      ...filters,
                      statuses: filters.statuses.filter(
                        (selectedStatus) => selectedStatus !== status,
                      ),
                    });
                  }}
                />
              ))
            : null}
          {!hiddenDimensionSet.has("amount") &&
          rangeLabel("Amount", filters.amountMin, filters.amountMax) ? (
            <FilterChip
              label={rangeLabel(
                "Amount",
                filters.amountMin,
                filters.amountMax,
              )!}
              truncateLabel={false}
              onRemove={() => {
                updateFilters({
                  ...filters,
                  amountMax: undefined,
                  amountMin: undefined,
                });
              }}
            />
          ) : null}
          {!hiddenDimensionSet.has("amountUsd") &&
          rangeLabel(
            "Amount USD",
            filters.amountUsdMin,
            filters.amountUsdMax,
          ) ? (
            <FilterChip
              label={rangeLabel(
                "Amount USD",
                filters.amountUsdMin,
                filters.amountUsdMax,
              )!}
              truncateLabel={false}
              onRemove={() => {
                updateFilters({
                  ...filters,
                  amountUsdMax: undefined,
                  amountUsdMin: undefined,
                });
              }}
            />
          ) : null}
          {!hiddenDimensionSet.has("initiated") &&
          rangeLabel(
            "Initiated",
            filters.initiatedFrom,
            filters.initiatedTo,
          ) ? (
            <FilterChip
              label={rangeLabel(
                "Initiated",
                filters.initiatedFrom,
                filters.initiatedTo,
              )!}
              onRemove={() => {
                updateFilters({
                  ...filters,
                  initiatedFrom: undefined,
                  initiatedTo: undefined,
                });
              }}
            />
          ) : null}
          {!hiddenDimensionSet.has("pending") &&
          rangeLabel("Pending", filters.pendingFrom, filters.pendingTo) ? (
            <FilterChip
              label={rangeLabel(
                "Pending",
                filters.pendingFrom,
                filters.pendingTo,
              )!}
              onRemove={() => {
                updateFilters({
                  ...filters,
                  pendingFrom: undefined,
                  pendingTo: undefined,
                });
              }}
            />
          ) : null}
          {!hiddenDimensionSet.has("posted") &&
          rangeLabel("Posted", filters.postedFrom, filters.postedTo) ? (
            <FilterChip
              label={rangeLabel(
                "Posted",
                filters.postedFrom,
                filters.postedTo,
              )!}
              onRemove={() => {
                updateFilters({
                  ...filters,
                  postedFrom: undefined,
                  postedTo: undefined,
                });
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
