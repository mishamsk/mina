import { Close, EyeOff } from "pixelarticons/react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EntityOption {
  readonly detail?: string;
  readonly hidden?: boolean;
  readonly id: number;
  readonly label: string;
  readonly searchLabel: string;
}

interface EntityPickerProps {
  readonly autoFocus?: boolean;
  readonly clearOnSelect?: boolean;
  readonly disabled?: boolean;
  readonly exactMatchOptions?: readonly EntityOption[];
  readonly id: string;
  readonly label: string;
  readonly labelClassName?: string;
  readonly onChange: (id: number | undefined) => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly options: readonly EntityOption[];
  readonly placeholder?: string;
  readonly value: number | undefined;
}

const matchesQuery = (option: EntityOption, query: string): boolean =>
  option.searchLabel.toLowerCase().includes(query.trim().toLowerCase());

export const EntityPicker = ({
  autoFocus = false,
  clearOnSelect = false,
  disabled = false,
  exactMatchOptions = [],
  id,
  label,
  labelClassName,
  onChange,
  onOpenChange,
  options,
  placeholder = "Search",
  value,
}: EntityPickerProps) => {
  const selected = options.find((option) => option.id === value);
  const [query, setQuery] = useState(selected?.searchLabel ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const filteredOptions = useMemo(
    () => options.filter((option) => matchesQuery(option, query)).slice(0, 8),
    [options, query],
  );
  const clampedActiveIndex =
    filteredOptions.length === 0
      ? 0
      : Math.min(activeIndex, filteredOptions.length - 1);
  const activeOption = filteredOptions[clampedActiveIndex];
  const activeOptionId =
    open && !disabled && activeOption
      ? `${id}-option-${activeOption.id}`
      : undefined;

  const updateOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const selectOption = (option: EntityOption) => {
    onChange(option.id);
    setQuery(clearOnSelect ? "" : option.searchLabel);
    setActiveIndex(0);
    updateOpen(false);
  };

  return (
    <div className="relative flex flex-col gap-1">
      <label
        htmlFor={id}
        className={cn("text-sm font-semibold", labelClassName)}
      >
        {label}
      </label>
      <input
        id={id}
        autoFocus={autoFocus}
        role="combobox"
        aria-controls={`${id}-options`}
        aria-expanded={open && !disabled}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onBlur={() => {
          window.setTimeout(() => {
            updateOpen(false);
          }, 100);
        }}
        onChange={(event) => {
          const nextQuery = event.target.value;
          const exactOption = [...options, ...exactMatchOptions].find(
            (option) => option.searchLabel === nextQuery,
          );
          if (exactOption) {
            selectOption(exactOption);
            return;
          }
          setQuery(nextQuery);
          updateOpen(true);
          setActiveIndex(0);
          if (!selected || selected.searchLabel !== nextQuery) {
            onChange(undefined);
          }
        }}
        onFocus={() => {
          if (disabled) {
            return;
          }
          setQuery(selected?.searchLabel ?? query);
          updateOpen(true);
          setActiveIndex(
            Math.max(
              0,
              filteredOptions.findIndex((option) => option.id === value),
            ),
          );
        }}
        onKeyDown={(event) => {
          if (disabled) {
            return;
          }

          if (event.metaKey || event.ctrlKey) {
            return;
          }

          if (event.key === "Escape") {
            if (open) {
              event.preventDefault();
              updateOpen(false);
            }
            return;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            updateOpen(true);
            setActiveIndex((current) =>
              filteredOptions.length === 0
                ? 0
                : Math.min(current + 1, filteredOptions.length - 1),
            );
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            updateOpen(true);
            setActiveIndex((current) =>
              filteredOptions.length === 0 ? 0 : Math.max(current - 1, 0),
            );
            return;
          }

          if (event.key === "Enter" && open && activeOption) {
            event.preventDefault();
            selectOption(activeOption);
          }
        }}
      />
      {open && !disabled ? (
        <div
          id={`${id}-options`}
          role="listbox"
          className="bg-card absolute top-full right-0 left-0 z-30 mt-1 max-h-56 overflow-auto border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, optionIndex) => (
              <button
                key={option.id}
                id={`${id}-option-${option.id}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={option.id === value}
                className={cn(
                  "hover:bg-muted flex w-full flex-col items-start px-2 py-2 text-left text-sm",
                  optionIndex === clampedActiveIndex &&
                    "bg-[var(--color-interactive-bright)]",
                  option.id === value && "bg-[var(--color-interactive-bright)]",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectOption(option);
                }}
              >
                <span className="flex items-center gap-1 font-medium">
                  {option.hidden ? (
                    <EyeOff aria-label="Hidden" className="size-3" />
                  ) : null}
                  {option.label}
                </span>
                {option.detail ? (
                  <span className="text-muted-foreground font-mono text-xs">
                    {option.detail}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <div className="text-muted-foreground px-2 py-2 text-sm">
              No matches
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

interface EntityMultiPickerProps {
  readonly autoFocus?: boolean;
  readonly id: string;
  readonly label: string;
  readonly labelClassName?: string;
  readonly onChange: (ids: readonly number[]) => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly options: readonly EntityOption[];
  readonly placeholder?: string;
  readonly value: readonly number[];
}

export const EntityMultiPicker = ({
  autoFocus = false,
  id,
  label,
  labelClassName,
  onChange,
  onOpenChange,
  options,
  placeholder = "Search",
  value,
}: EntityMultiPickerProps) => {
  const selectedOptions = options.filter((option) => value.includes(option.id));
  const availableOptions = options.filter(
    (option) => !value.includes(option.id),
  );

  return (
    <div className="flex flex-col gap-2">
      <EntityPicker
        autoFocus={autoFocus}
        clearOnSelect
        id={id}
        label={label}
        labelClassName={labelClassName}
        onOpenChange={onOpenChange}
        options={availableOptions}
        placeholder={placeholder}
        value={undefined}
        onChange={(nextId) => {
          if (nextId) {
            onChange([...value, nextId]);
          }
        }}
      />
      {selectedOptions.length > 0 ? (
        <div className="relative z-40 flex flex-wrap gap-1">
          {selectedOptions.map((option) => (
            <span
              key={option.id}
              className="bg-muted inline-flex h-7 items-center gap-1 border border-[var(--border-ink)] px-2 font-mono text-xs shadow-[var(--shadow-chip)]"
            >
              {option.hidden ? (
                <EyeOff aria-label="Hidden" className="size-3" />
              ) : null}
              {option.label}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${option.label}`}
                onClick={() => {
                  onChange(value.filter((idValue) => idValue !== option.id));
                }}
              >
                <Close aria-hidden="true" />
              </Button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
};
