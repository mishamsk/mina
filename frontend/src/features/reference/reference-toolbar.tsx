import { Eye, EyeOff, Search } from "pixelarticons/react";
import { useCallback, useState } from "react";
import type { SetURLSearchParams } from "react-router";

import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";

export const readReferenceSearchState = (
  searchParams: URLSearchParams,
): {
  readonly includeHidden: boolean;
  readonly search: string;
} => ({
  includeHidden: searchParams.get("hidden") === "true",
  search: searchParams.get("q") ?? "",
});

const updateReferenceSearchParam = (
  current: URLSearchParams,
  key: "hidden" | "q",
  value: string | undefined,
): URLSearchParams => {
  const next = new URLSearchParams(current);
  if (value) {
    next.set(key, value);
  } else {
    next.delete(key);
  }
  return next;
};

interface ReferenceToolbarProps {
  readonly includeHidden: boolean;
  readonly search: string;
  readonly searchInputId: string;
  readonly searchPlaceholder: string;
  readonly setSearchParams: SetURLSearchParams;
  readonly showIncludeHiddenToggle?: boolean;
  readonly toggleLabel?: string;
  readonly toggleOffTooltip?: string;
  readonly toggleOnTooltip?: string;
}

export const ReferenceToolbar = ({
  includeHidden,
  search,
  searchInputId,
  searchPlaceholder,
  setSearchParams,
  showIncludeHiddenToggle = true,
  toggleLabel,
  toggleOffTooltip,
  toggleOnTooltip,
}: ReferenceToolbarProps) => {
  const [searchInputDraft, setSearchInputDraft] = useState<
    string | undefined
  >();
  const searchInputValue = searchInputDraft ?? search;

  const setSearch = useCallback(
    (nextSearch: string) => {
      const normalizedSearch = nextSearch.trim();
      setSearchInputDraft(nextSearch);
      setSearchParams((current) =>
        updateReferenceSearchParam(current, "q", normalizedSearch || undefined),
      );
    },
    [setSearchParams],
  );

  const commitSearch = useCallback(
    (nextSearch: string) => {
      const normalizedSearch = nextSearch.trim();
      setSearchInputDraft(undefined);
      setSearchParams((current) =>
        updateReferenceSearchParam(current, "q", normalizedSearch || undefined),
      );
    },
    [setSearchParams],
  );

  const setIncludeHidden = useCallback(
    (nextIncludeHidden: boolean) => {
      setSearchParams((current) =>
        updateReferenceSearchParam(
          current,
          "hidden",
          nextIncludeHidden ? "true" : undefined,
        ),
      );
    },
    [setSearchParams],
  );

  const hiddenToggleLabel = toggleLabel ?? "Include hidden";
  const hiddenToggleOffTooltip = toggleOffTooltip ?? hiddenToggleLabel;
  const hiddenToggleOnTooltip = toggleOnTooltip ?? hiddenToggleLabel;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-[16rem] flex-col gap-1">
        <label
          htmlFor={searchInputId}
          className="font-heading text-xs font-semibold text-[var(--frame-muted)] uppercase"
        >
          Search
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2"
          />
          <input
            id={searchInputId}
            type="search"
            className="bg-card text-foreground placeholder:text-muted-foreground h-9 w-full border-2 border-[var(--border-ink)] px-8 font-mono text-sm shadow-[var(--shadow-pixel)]"
            placeholder={searchPlaceholder}
            value={searchInputValue}
            onFocus={(event) => {
              setSearchInputDraft(event.currentTarget.value);
            }}
            onBlur={(event) => {
              commitSearch(event.currentTarget.value);
            }}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </div>
      </div>

      {showIncludeHiddenToggle ? (
        <Tooltip
          label={includeHidden ? hiddenToggleOnTooltip : hiddenToggleOffTooltip}
          asChild
        >
          <Button
            type="button"
            variant="outline"
            size="lg"
            aria-label={hiddenToggleLabel}
            aria-pressed={includeHidden}
            className="aria-pressed:bg-[var(--table-header)]"
            onClick={() => {
              setIncludeHidden(!includeHidden);
            }}
          >
            {includeHidden ? (
              <EyeOff aria-hidden="true" data-icon="inline-start" />
            ) : (
              <Eye aria-hidden="true" data-icon="inline-start" />
            )}
            {hiddenToggleLabel}
          </Button>
        </Tooltip>
      ) : null}
    </div>
  );
};
