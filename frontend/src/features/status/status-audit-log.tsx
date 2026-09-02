import { ChevronRight, WarningDiamond } from "pixelarticons/react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router";

import {
  type ApiAuditClientSurface,
  type ApiAuditEntryForDisplay,
  apiErrorMessage,
  apiMutationCompletedEvent,
  formatAuditJSONSource,
  listApiAuditEntriesForDisplay,
} from "@/api";
import { MobileTableControls } from "@/components/mobile-table-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const auditPageSizes = [25, 50, 100] as const;
const defaultAuditPageSize = auditPageSizes[0];
const auditMethods = ["POST", "PUT", "PATCH", "DELETE"] as const;
const auditSurfaces: readonly ApiAuditClientSurface[] = [
  "rest",
  "web-ui",
  "cli",
  "mcp",
];

interface AuditListState {
  readonly entries: readonly ApiAuditEntryForDisplay[];
  readonly errorMessage?: string;
  readonly loading: boolean;
  readonly requestKey?: string;
  readonly totalCount?: number;
}

const initialAuditListState: AuditListState = {
  entries: [],
  loading: true,
};

const parsePositiveInteger = (
  value: string | null,
  fallback: number,
): number => {
  if (!value || !/^\d+$/.test(value)) {
    return fallback;
  }
  const parsed = Number(value);
  return parsed > 0 ? parsed : fallback;
};

const formatTimestamp = (value: string): string => {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(timestamp);
};

const formatDuration = (microseconds: number): string => {
  if (microseconds < 1_000) {
    return `${microseconds} μs`;
  }
  if (microseconds < 1_000_000) {
    return `${(microseconds / 1_000).toFixed(microseconds < 10_000 ? 1 : 0)} ms`;
  }
  return `${(microseconds / 1_000_000).toFixed(2)} s`;
};

const pageCount = (totalCount: number | undefined, pageSize: number): number =>
  totalCount === undefined ? 1 : Math.max(1, Math.ceil(totalCount / pageSize));

const rowKeyDown = (
  event: KeyboardEvent<HTMLTableRowElement>,
  onActivate: () => void,
) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const rows = Array.from(
      event.currentTarget
        .closest("tbody")
        ?.querySelectorAll<HTMLTableRowElement>("tr[tabindex='0']") ?? [],
    );
    const currentIndex = rows.indexOf(event.currentTarget);
    const nextIndex = Math.max(
      0,
      Math.min(
        rows.length - 1,
        currentIndex + (event.key === "ArrowDown" ? 1 : -1),
      ),
    );
    rows[nextIndex]?.focus();
    return;
  }
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onActivate();
};

export const StatusAuditLog = ({
  refreshRevision,
}: {
  readonly refreshRevision: number;
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const replaceUnavailablePage = useEffectEvent(
    (availablePageCount: number) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("auditPage", String(availablePageCount));
          next.delete("auditEntry");
          return next;
        },
        { replace: true },
      );
    },
  );
  const page = parsePositiveInteger(searchParams.get("auditPage"), 1);
  const requestedPageSize = parsePositiveInteger(
    searchParams.get("auditPageSize"),
    defaultAuditPageSize,
  );
  const pageSize = auditPageSizes.includes(
    requestedPageSize as (typeof auditPageSizes)[number],
  )
    ? requestedPageSize
    : defaultAuditPageSize;
  const requestedMethod = searchParams.get("auditMethod")?.toUpperCase();
  const method = auditMethods.includes(
    requestedMethod as (typeof auditMethods)[number],
  )
    ? requestedMethod
    : undefined;
  const requestedSurface = searchParams.get("auditSurface");
  const surface = auditSurfaces.includes(
    requestedSurface as ApiAuditClientSurface,
  )
    ? (requestedSurface as ApiAuditClientSurface)
    : undefined;
  const operationId = searchParams.get("auditOperation")?.trim() || undefined;
  const selectedEntryId = parsePositiveInteger(
    searchParams.get("auditEntry"),
    0,
  );
  const [auditEntries, setAuditEntries] = useState<AuditListState>(
    initialAuditListState,
  );
  const [mutationRevision, setMutationRevision] = useState(0);
  const detailRef = useRef<HTMLDivElement>(null);
  const nextPageRef = useRef<HTMLButtonElement>(null);
  const pendingDetailFocusRef = useRef(false);
  const pendingPaginationFocusRef = useRef<"next" | "previous" | undefined>(
    undefined,
  );
  const pendingRowFocusIndexRef = useRef<number | undefined>(undefined);
  const previousPageRef = useRef<HTMLButtonElement>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const requestKey = JSON.stringify({
    method,
    operationId,
    page,
    pageSize,
    surface,
  });

  useEffect(() => {
    const refresh = () => {
      const rows = Array.from(
        tableBodyRef.current?.querySelectorAll<HTMLTableRowElement>(
          "tr[tabindex='0']",
        ) ?? [],
      );
      const focusedIndex = rows.findIndex(
        (row) => row === document.activeElement,
      );
      pendingRowFocusIndexRef.current =
        focusedIndex >= 0 ? focusedIndex : undefined;
      setMutationRevision((revision) => revision + 1);
    };
    window.addEventListener(apiMutationCompletedEvent, refresh);
    return () => window.removeEventListener(apiMutationCompletedEvent, refresh);
  }, []);

  useEffect(() => {
    let active = true;
    const loadEntries = async () => {
      setAuditEntries((current) => ({
        ...current,
        errorMessage: undefined,
        loading: true,
      }));
      const result = await listApiAuditEntriesForDisplay({
        client_surface: surface,
        limit: pageSize,
        method,
        offset: (page - 1) * pageSize,
        operation_id: operationId,
      });
      if (!active) {
        return;
      }
      if (!result.data) {
        const errorMessage = apiErrorMessage(
          result.error,
          "Audit history could not be loaded.",
        );
        setAuditEntries((current) =>
          current.requestKey === requestKey
            ? {
                ...current,
                errorMessage,
                loading: false,
              }
            : {
                entries: [],
                errorMessage,
                loading: false,
                requestKey,
              },
        );
        return;
      }
      const availablePageCount = pageCount(result.data.total_count, pageSize);
      if (page > availablePageCount) {
        replaceUnavailablePage(availablePageCount);
        return;
      }
      setAuditEntries({
        entries: result.data.entries,
        loading: false,
        requestKey,
        totalCount: result.data.total_count,
      });
    };
    void loadEntries();
    return () => {
      active = false;
    };
  }, [
    method,
    mutationRevision,
    operationId,
    page,
    pageSize,
    refreshRevision,
    requestKey,
    surface,
  ]);

  const selectedEntry = auditEntries.entries.find(
    (entry) => entry.api_audit_entry_id === selectedEntryId,
  );
  const currentPageCount = pageCount(auditEntries.totalCount, pageSize);
  const initialLoading =
    auditEntries.loading && auditEntries.requestKey === undefined;
  const selectedEntryUnavailable =
    selectedEntryId > 0 &&
    selectedEntry === undefined &&
    !auditEntries.loading &&
    !auditEntries.errorMessage &&
    auditEntries.requestKey === requestKey;

  useEffect(() => {
    if (selectedEntry && pendingDetailFocusRef.current) {
      pendingDetailFocusRef.current = false;
      detailRef.current?.focus();
    }
  }, [selectedEntry]);

  useEffect(() => {
    const focusedIndex = pendingRowFocusIndexRef.current;
    if (focusedIndex === undefined || auditEntries.loading) {
      return;
    }
    pendingRowFocusIndexRef.current = undefined;
    if (document.activeElement !== document.body) {
      return;
    }
    const rows = Array.from(
      tableBodyRef.current?.querySelectorAll<HTMLTableRowElement>(
        "tr[tabindex='0']",
      ) ?? [],
    );
    rows[Math.min(focusedIndex, rows.length - 1)]?.focus();
  }, [auditEntries.entries, auditEntries.loading]);

  useEffect(() => {
    const focusTarget = pendingPaginationFocusRef.current;
    if (!focusTarget) {
      return;
    }
    pendingPaginationFocusRef.current = undefined;
    (focusTarget === "previous"
      ? previousPageRef.current
      : nextPageRef.current
    )?.focus();
  }, [page]);

  const updateFilter = (name: string, value: string | undefined) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) {
        next.set(name, value);
      } else {
        next.delete(name);
      }
      next.set("auditPage", "1");
      next.set("auditPageSize", String(pageSize));
      next.delete("auditEntry");
      return next;
    });
  };

  const setPage = (nextPage: number, focusTarget: "next" | "previous") => {
    pendingPaginationFocusRef.current = focusTarget;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("auditPage", String(nextPage));
      next.set("auditPageSize", String(pageSize));
      next.delete("auditEntry");
      return next;
    });
  };

  const setPageSize = (nextPageSize: number) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("auditPage", "1");
      next.set("auditPageSize", String(nextPageSize));
      next.delete("auditEntry");
      return next;
    });
  };

  const selectEntry = (
    entry: ApiAuditEntryForDisplay,
    focusDetail: boolean,
  ) => {
    pendingDetailFocusRef.current = focusDetail;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("auditEntry", String(entry.api_audit_entry_id));
      return next;
    });
  };

  return (
    <Card className="compact-shell:py-0 min-h-0" data-testid="status-audit-log">
      <MobileTableControls>
        <CardHeader>
          <div className="roomy-shell:grid-cols-[auto_auto_minmax(14rem,1fr)] grid gap-3">
            <FilterSelect
              label="Method"
              value={method ?? "all"}
              onValueChange={(value) =>
                updateFilter("auditMethod", value === "all" ? undefined : value)
              }
              options={auditMethods}
            />
            <FilterSelect
              label="Surface"
              value={surface ?? "all"}
              onValueChange={(value) =>
                updateFilter(
                  "auditSurface",
                  value === "all" ? undefined : value,
                )
              }
              options={auditSurfaces}
            />
            <OperationFilterForm
              operationId={operationId}
              onApply={(value) => updateFilter("auditOperation", value)}
            />
          </div>
        </CardHeader>
      </MobileTableControls>

      <div className="roomy-shell:max-h-[calc(100vh-24rem)] roomy-shell:min-h-64 roomy-shell:overflow-auto overflow-visible border-y-2 border-[var(--border-ink)]">
        <table
          className="w-full max-w-full table-fixed text-left text-sm"
          data-testid="audit-log-table"
        >
          <thead className="font-heading roomy-shell:sticky roomy-shell:top-0 roomy-shell:z-10 bg-[var(--table-header)] text-xs uppercase">
            <tr>
              <th className="w-[34%] px-3 py-2 md:w-[23%]">Timestamp</th>
              <th className="hidden w-[11%] px-3 py-2 md:table-cell">
                Surface
              </th>
              <th className="hidden w-[9%] px-3 py-2 md:table-cell">Method</th>
              <th className="w-[44%] px-3 py-2 md:w-[31%]">
                Operation / request
              </th>
              <th className="w-[22%] px-3 py-2 md:w-[11%]">Status</th>
              <th className="hidden w-[15%] px-3 py-2 text-right md:table-cell">
                Duration
              </th>
            </tr>
          </thead>
          <tbody ref={tableBodyRef}>
            {initialLoading ? <AuditSkeletonRows /> : null}
            {!auditEntries.loading &&
            !auditEntries.errorMessage &&
            auditEntries.requestKey === requestKey &&
            auditEntries.entries.length === 0 ? (
              <AuditEmptyRow />
            ) : null}
            {auditEntries.entries.map((entry, index) => {
              const selected = entry.api_audit_entry_id === selectedEntryId;
              return (
                <tr
                  key={entry.api_audit_entry_id}
                  tabIndex={0}
                  aria-expanded={selected}
                  aria-label={`Open audit entry ${entry.api_audit_entry_id}`}
                  className={`focus-visible:outline-ring cursor-pointer border-t border-[var(--hairline)] outline-none hover:bg-[color-mix(in_srgb,var(--band),var(--color-interactive-bright)_28%)] focus-visible:outline-2 ${
                    selected
                      ? "bg-[color-mix(in_srgb,var(--band),var(--color-interactive-bright)_18%)]"
                      : index % 2 === 1
                        ? "bg-[var(--band)]"
                        : "bg-card"
                  }`}
                  onClick={() => selectEntry(entry, true)}
                  onKeyDown={(event) =>
                    rowKeyDown(event, () => selectEntry(entry, true))
                  }
                >
                  <td className="truncate px-3 py-3 font-mono">
                    {formatTimestamp(entry.occurred_at)}
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    <Badge variant="outline">{entry.client_surface}</Badge>
                  </td>
                  <td className="hidden px-3 py-3 font-mono md:table-cell">
                    {entry.method}
                  </td>
                  <td className="px-3 py-3">
                    <p className="truncate font-mono font-semibold">
                      {entry.operation_id}
                    </p>
                    <p
                      className={`mt-1 truncate font-mono text-xs ${
                        selected ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {entry.request_uri}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={statusVariant(entry.response_status)}>
                      {entry.response_status}
                    </Badge>
                  </td>
                  <td className="hidden px-3 py-3 text-right font-mono md:table-cell">
                    <span className="inline-flex items-center gap-1">
                      {formatDuration(entry.duration_microseconds)}
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {auditEntries.errorMessage ? (
        <CardContent className="pt-4">
          <AuditError message={auditEntries.errorMessage} />
        </CardContent>
      ) : null}
      <MobileTableControls order="pagination">
        <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="audit-page-size" className="font-medium">
              Rows
            </label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => setPageSize(Number(value))}
            >
              <SelectTrigger
                id="audit-page-size"
                size="compact"
                aria-label="Audit rows per page"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {auditPageSizes.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            {auditEntries.loading ? (
              <span
                className="text-muted-foreground font-mono text-xs"
                role="status"
              >
                Loading
              </span>
            ) : null}
            <span className="text-muted-foreground font-mono text-sm">
              Page {page} of {currentPageCount}
            </span>
            <Button
              ref={previousPageRef}
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() =>
                setPage(page - 1, page - 1 <= 1 ? "next" : "previous")
              }
            >
              Previous
            </Button>
            <Button
              ref={nextPageRef}
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= currentPageCount}
              onClick={() =>
                setPage(
                  page + 1,
                  page + 1 >= currentPageCount ? "previous" : "next",
                )
              }
            >
              Next
            </Button>
          </div>
        </CardContent>
      </MobileTableControls>

      {selectedEntry ? (
        <CardContent ref={detailRef} tabIndex={-1} className="scroll-mt-4 pt-0">
          <AuditEntryDetail entry={selectedEntry} />
        </CardContent>
      ) : null}
      {selectedEntryUnavailable ? (
        <CardContent className="pt-0">
          <div
            className="bg-muted border-2 border-[var(--border-ink)] p-4"
            data-testid="audit-entry-unavailable"
          >
            <p className="font-heading text-sm uppercase">
              Audit entry unavailable
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Entry {selectedEntryId} is not on this page. It may have moved to
              another page or been removed by compaction.
            </p>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
};

const FilterSelect = ({
  label,
  onValueChange,
  options,
  value,
}: {
  readonly label: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly string[];
  readonly value: string;
}) => (
  <label>
    <span className="font-heading block text-xs font-semibold uppercase">
      {label}
    </span>
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="mt-1 min-w-32" aria-label={`${label} filter`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </label>
);

const OperationFilterForm = ({
  onApply,
  operationId,
}: {
  readonly onApply: (value: string | undefined) => void;
  readonly operationId: string | undefined;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = operationId ?? "";
    }
  }, [operationId]);

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply(inputRef.current?.value.trim() || undefined);
  };

  return (
    <form className="flex min-w-0 items-end gap-2" onSubmit={apply}>
      <label className="min-w-0 flex-1">
        <span className="font-heading block text-xs font-semibold uppercase">
          Operation ID
        </span>
        <input
          ref={inputRef}
          type="text"
          aria-label="Operation ID filter"
          defaultValue={operationId}
          placeholder="e.g. createTag"
          className="bg-card text-foreground mt-1 h-9 w-full border-2 border-[var(--border-ink)] px-3 font-mono text-sm shadow-[var(--shadow-pixel)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        />
      </label>
      <Button type="submit" variant="outline" size="sm">
        Apply
      </Button>
    </form>
  );
};

const AuditEntryDetail = ({
  entry,
}: {
  readonly entry: ApiAuditEntryForDisplay;
}) => (
  <div
    className="bg-muted border-2 border-[var(--border-ink)] p-4"
    data-testid="audit-entry-detail"
  >
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b-2 border-[var(--hairline)] pb-3">
      <div>
        <p className="font-heading text-sm uppercase">Audit entry</p>
        <p className="text-muted-foreground mt-1 font-mono text-sm">
          {entry.operation_id} · entry {entry.api_audit_entry_id}
        </p>
      </div>
      <div className="flex gap-2">
        <Badge variant="outline">{entry.client_surface}</Badge>
        <Badge variant={statusVariant(entry.response_status)}>
          {entry.response_status}
        </Badge>
      </div>
    </div>
    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <DetailField
        label="Timestamp"
        value={formatTimestamp(entry.occurred_at)}
      />
      <DetailField label="Method" value={entry.method} />
      <DetailField
        label="Duration"
        value={formatDuration(entry.duration_microseconds)}
      />
      <DetailField label="Surface" value={entry.client_surface} />
      <DetailField label="Operation" value={entry.operation_id} />
      <DetailField label="Request URI" value={entry.request_uri} wide />
    </dl>
    <div className="mt-5 grid gap-4 border-t-2 border-[var(--hairline)] pt-4 lg:grid-cols-2">
      <JsonPanel
        label="Request JSON"
        present={entry.request_json_present}
        source={entry.request_json_source}
      />
      <JsonPanel
        label="Response JSON"
        present={entry.response_json_present}
        source={entry.response_json_source}
      />
    </div>
  </div>
);

const DetailField = ({
  label,
  value,
  wide = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly wide?: boolean;
}) => (
  <div
    className={`border-l-2 border-[var(--hairline)] pl-3 ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}
  >
    <dt className="text-muted-foreground font-heading text-xs uppercase">
      {label}
    </dt>
    <dd className="mt-1 font-mono text-sm break-words">{value}</dd>
  </div>
);

const JsonPanel = ({
  label,
  present,
  source,
}: {
  readonly label: string;
  readonly present: boolean;
  readonly source: string;
}) => (
  <section aria-label={label}>
    <h3 className="font-heading text-xs font-semibold uppercase">{label}</h3>
    {present ? (
      <pre className="bg-card mt-2 max-h-80 overflow-auto border-2 border-[var(--border-ink)] p-3 font-mono text-xs whitespace-pre-wrap">
        {formatAuditJSONSource(source)}
      </pre>
    ) : (
      <p className="bg-card text-muted-foreground mt-2 border-2 border-[var(--border-ink)] p-3 font-mono text-xs">
        No {label.replace(/^./, (character) => character.toLowerCase())} body.
      </p>
    )}
  </section>
);

const statusVariant = (
  status: number,
): "destructive" | "outline" | "secondary" => {
  if (status >= 400) {
    return "destructive";
  }
  return status >= 200 && status < 300 ? "secondary" : "outline";
};

const AuditError = ({ message }: { readonly message: string }) => (
  <div
    className="border-destructive bg-card flex items-start gap-2 border-2 p-3 text-sm"
    role="alert"
  >
    <WarningDiamond
      aria-hidden="true"
      className="text-destructive mt-0.5 size-4 shrink-0"
    />
    <p>{message}</p>
  </div>
);

const AuditSkeletonRows = () => (
  <>
    {Array.from({ length: 4 }, (_, index) => (
      <tr key={index} className="border-t border-[var(--hairline)]">
        {auditSkeletonCellClasses.map((className, cell) => (
          <td key={cell} className={className}>
            <Skeleton className="h-4 w-full" />
          </td>
        ))}
      </tr>
    ))}
  </>
);

const AuditEmptyRow = () => (
  <tr>
    <td colSpan={6} className="h-64 px-4 py-8 text-center">
      <svg
        aria-hidden="true"
        className="mx-auto size-12"
        shapeRendering="crispEdges"
        viewBox="0 0 48 48"
      >
        <path
          d="M6 8h36v32H6z"
          fill="var(--card)"
          stroke="var(--border-ink)"
          strokeWidth="4"
        />
        <path d="M12 16h24v4H12zm0 8h16v4H12z" fill="var(--table-header)" />
        <path d="M32 28h4v4h-4z" fill="var(--color-interactive-bright)" />
      </svg>
      <p className="font-heading mt-3 text-sm uppercase">No audit entries</p>
      <p className="text-muted-foreground mt-1 text-sm">
        Mutating API requests matching these filters will appear here.
      </p>
    </td>
  </tr>
);

const auditSkeletonCellClasses = [
  "px-3 py-3",
  "hidden px-3 py-3 md:table-cell",
  "hidden px-3 py-3 md:table-cell",
  "px-3 py-3",
  "px-3 py-3",
  "hidden px-3 py-3 md:table-cell",
] as const;
