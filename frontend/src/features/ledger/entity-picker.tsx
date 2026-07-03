import { Close } from "pixelarticons/react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EntityOption {
  readonly detail?: string;
  readonly id: number;
  readonly label: string;
  readonly searchLabel: string;
}

interface EntityPickerProps {
  readonly id: string;
  readonly label: string;
  readonly onChange: (id: number | undefined) => void;
  readonly options: readonly EntityOption[];
  readonly placeholder?: string;
  readonly value: number | undefined;
}

const matchesQuery = (option: EntityOption, query: string): boolean =>
  option.searchLabel.toLowerCase().includes(query.trim().toLowerCase());

export const EntityPicker = ({
  id,
  label,
  onChange,
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
    open && activeOption ? `${id}-option-${activeOption.id}` : undefined;

  const selectOption = (option: EntityOption) => {
    onChange(option.id);
    setQuery(option.searchLabel);
    setOpen(false);
  };

  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        role="combobox"
        aria-controls={`${id}-options`}
        aria-expanded={open}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]"
        placeholder={placeholder}
        value={query}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false);
          }, 100);
        }}
        onChange={(event) => {
          const nextQuery = event.target.value;
          const exactOption = options.find(
            (option) => option.searchLabel === nextQuery,
          );
          setQuery(nextQuery);
          setOpen(true);
          setActiveIndex(0);
          if (exactOption) {
            onChange(exactOption.id);
          } else if (!selected || selected.searchLabel !== nextQuery) {
            onChange(undefined);
          }
        }}
        onFocus={() => {
          setQuery(selected?.searchLabel ?? query);
          setOpen(true);
          setActiveIndex(
            Math.max(
              0,
              filteredOptions.findIndex((option) => option.id === value),
            ),
          );
        }}
        onKeyDown={(event) => {
          if (event.metaKey || event.ctrlKey) {
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            return;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) =>
              filteredOptions.length === 0
                ? 0
                : Math.min(current + 1, filteredOptions.length - 1),
            );
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
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
      {open ? (
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
                <span className="font-medium">{option.label}</span>
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
  readonly id: string;
  readonly label: string;
  readonly onChange: (ids: readonly number[]) => void;
  readonly options: readonly EntityOption[];
  readonly placeholder?: string;
  readonly value: readonly number[];
}

export const EntityMultiPicker = ({
  id,
  label,
  onChange,
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
        key={value.join(",")}
        id={id}
        label={label}
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
        <div className="flex flex-wrap gap-1">
          {selectedOptions.map((option) => (
            <span
              key={option.id}
              className="bg-muted inline-flex h-7 items-center gap-1 border border-[var(--border-ink)] px-2 font-mono text-xs shadow-[var(--shadow-chip)]"
            >
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
