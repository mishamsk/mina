import { ChevronRight, WarningDiamond, Zap } from "pixelarticons/react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "react-router";

import {
  apiErrorMessage,
  type BackgroundOperationId,
  type BackgroundOperationRun,
  listBackgroundOperationRunEnvelopes,
  listBackgroundOperations,
} from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type ConcreteOperationRun,
  operationLabel,
  operationModules,
  type OperationStatusSummary,
} from "@/features/status/operation-modules";
import { RunDetailFrame } from "@/features/status/run-detail-frame";

const operationPageSizes = [25, 50, 100] as const;
const defaultOperationPageSize = operationPageSizes[0];

interface OperationListState {
  readonly errorMessage?: string;
  readonly loading: boolean;
  readonly operationIds: readonly BackgroundOperationId[];
}

interface RunListState {
  readonly errorMessage?: string;
  readonly loading: boolean;
  readonly operationId?: BackgroundOperationId;
  readonly runs: readonly BackgroundOperationRun[];
  readonly totalCount?: number;
}

interface OperationStatusState {
  readonly errorMessage?: string;
  readonly loading: boolean;
  readonly operationId?: BackgroundOperationId;
  readonly status?: OperationStatusSummary;
}

interface RunDetailState {
  readonly errorMessage?: string;
  readonly loading: boolean;
  readonly operationId?: BackgroundOperationId;
  readonly run?: ConcreteOperationRun;
  readonly runId?: number;
}

const initialOperationListState: OperationListState = {
  loading: true,
  operationIds: [],
};

const initialRunListState: RunListState = {
  loading: false,
  runs: [],
};

const initialOperationStatusState: OperationStatusState = {
  loading: false,
};

const initialRunDetailState: RunDetailState = {
  loading: false,
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

const pageCount = (totalCount: number | undefined, pageSize: number): number =>
  totalCount === undefined ? 1 : Math.max(1, Math.ceil(totalCount / pageSize));

const formatTimestamp = (value: string | undefined): string => {
  if (!value) {
    return "—";
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
};

const formatFinished = (run: BackgroundOperationRun): string => {
  if (!run.completed_at) {
    return "Running";
  }
  const startedAt = new Date(run.started_at);
  const completedAt = new Date(run.completed_at);
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const duration =
    Number.isFinite(durationMs) && durationMs >= 0
      ? `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`
      : "Duration unavailable";
  return `${formatTimestamp(run.completed_at)} · ${duration}`;
};

const runStatusVariant = (
  status: BackgroundOperationRun["outcome"],
): "destructive" | "outline" | "secondary" => {
  switch (status) {
    case "failed":
      return "destructive";
    case "running":
    case "skipped":
      return "secondary";
    default:
      return "outline";
  }
};

const rowKeyDown = (
  event: KeyboardEvent<HTMLTableRowElement>,
  onActivate: () => void,
) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onActivate();
};

export const StatusOperations = ({
  refreshRevision,
}: {
  readonly refreshRevision: number;
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [operations, setOperations] = useState<OperationListState>(
    initialOperationListState,
  );
  const [runs, setRuns] = useState<RunListState>(initialRunListState);
  const [operationStatus, setOperationStatus] = useState<OperationStatusState>(
    initialOperationStatusState,
  );
  const [runDetail, setRunDetail] = useState<RunDetailState>(
    initialRunDetailState,
  );
  const [startingOperation, setStartingOperation] = useState(false);
  const [actionErrorMessage, setActionErrorMessage] = useState<string>();
  const [resourceRevision, setResourceRevision] = useState(0);

  useEffect(() => {
    let active = true;
    const loadOperations = async () => {
      setOperations((current) => ({
        ...current,
        errorMessage: undefined,
        loading: true,
      }));
      const result = await listBackgroundOperations();
      if (!active) {
        return;
      }
      if (!result.data) {
        setOperations({
          errorMessage: apiErrorMessage(
            result.error,
            "Background operations could not be loaded.",
          ),
          loading: false,
          operationIds: [],
        });
        return;
      }
      setOperations({
        loading: false,
        operationIds: result.data.operations.map(
          (operation) => operation.operation_id,
        ),
      });
    };
    void loadOperations();
    return () => {
      active = false;
    };
  }, [refreshRevision, resourceRevision]);

  const requestedOperationId = searchParams.get("operation");
  const selectedOperationId = useMemo(() => {
    if (requestedOperationId) {
      return operations.operationIds.find(
        (operationID) => operationID === requestedOperationId,
      );
    }
    return operations.operationIds[0];
  }, [operations.operationIds, requestedOperationId]);
  const invalidOperationId =
    requestedOperationId &&
    !operations.loading &&
    operations.operationIds.length > 0 &&
    !operations.operationIds.some(
      (operationID) => operationID === requestedOperationId,
    )
      ? requestedOperationId
      : undefined;
  const selectedModule = selectedOperationId
    ? operationModules[selectedOperationId]
    : undefined;
  const page = parsePositiveInteger(searchParams.get("runsPage"), 1);
  const requestedPageSize = parsePositiveInteger(
    searchParams.get("runsPageSize"),
    defaultOperationPageSize,
  );
  const pageSize = operationPageSizes.includes(
    requestedPageSize as (typeof operationPageSizes)[number],
  )
    ? requestedPageSize
    : defaultOperationPageSize;

  useEffect(() => {
    if (!selectedOperationId) {
      return;
    }
    let active = true;
    const loadRuns = async () => {
      setRuns((current) => ({
        ...current,
        errorMessage: undefined,
        loading: true,
      }));
      const result = await listBackgroundOperationRunEnvelopes({
        query: {
          limit: pageSize,
          offset: (page - 1) * pageSize,
          operation_id: selectedOperationId,
        },
      });
      if (!active) {
        return;
      }
      if (!result.data) {
        setRuns({
          errorMessage: apiErrorMessage(
            result.error,
            "Operation runs could not be loaded.",
          ),
          loading: false,
          operationId: selectedOperationId,
          runs: [],
        });
        return;
      }
      setRuns({
        loading: false,
        operationId: selectedOperationId,
        runs: result.data.runs,
        totalCount: result.data.total_count,
      });
    };
    void loadRuns();
    return () => {
      active = false;
    };
  }, [page, pageSize, refreshRevision, resourceRevision, selectedOperationId]);

  useEffect(() => {
    let active = true;
    const loadOperationStatus = async () => {
      if (!selectedOperationId || !selectedModule) {
        setOperationStatus(initialOperationStatusState);
        return;
      }
      setOperationStatus({ loading: true, operationId: selectedOperationId });
      const result = await selectedModule.loadStatus();
      if (!active) {
        return;
      }
      setOperationStatus({
        errorMessage: result.error
          ? apiErrorMessage(
              result.error,
              "Operation status could not be loaded.",
            )
          : undefined,
        loading: false,
        operationId: selectedOperationId,
        status: result.status,
      });
    };
    void loadOperationStatus();
    return () => {
      active = false;
    };
  }, [refreshRevision, resourceRevision, selectedModule, selectedOperationId]);

  const selectedRunID = Number(searchParams.get("run"));
  useEffect(() => {
    if (
      !selectedModule ||
      !Number.isSafeInteger(selectedRunID) ||
      selectedRunID <= 0
    ) {
      return;
    }
    let active = true;
    const loadRunDetail = async () => {
      setRunDetail({
        loading: true,
        operationId: selectedOperationId,
        runId: selectedRunID,
      });
      const result = await selectedModule.loadRun(selectedRunID);
      if (!active) {
        return;
      }
      setRunDetail(
        result.run
          ? {
              loading: false,
              operationId: selectedOperationId,
              run: result.run,
              runId: selectedRunID,
            }
          : {
              errorMessage: apiErrorMessage(
                result.error,
                "Run detail could not be loaded.",
              ),
              loading: false,
              operationId: selectedOperationId,
              runId: selectedRunID,
            },
      );
    };
    void loadRunDetail();
    return () => {
      active = false;
    };
  }, [selectedModule, selectedOperationId, selectedRunID]);
  const selectedRunDetailState =
    runDetail.operationId === selectedOperationId &&
    runDetail.runId === selectedRunID
      ? runDetail
      : initialRunDetailState;
  const selectedRunDetail =
    selectedRunDetailState.run &&
    selectedRunDetailState.run.operation_id === selectedOperationId &&
    selectedRunDetailState.run.operation_run_id === selectedRunID
      ? selectedRunDetailState.run
      : undefined;
  const currentPageCount = pageCount(runs.totalCount, pageSize);

  const setOperation = (operationId: BackgroundOperationId) => {
    setActionErrorMessage(undefined);
    setRunDetail(initialRunDetailState);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("operation", operationId);
      next.set("runsPage", "1");
      next.set("runsPageSize", String(pageSize));
      next.delete("run");
      return next;
    });
  };

  const setPage = (nextPage: number) => {
    setRunDetail(initialRunDetailState);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("runsPage", String(nextPage));
      next.set("runsPageSize", String(pageSize));
      next.delete("run");
      return next;
    });
  };

  const setPageSize = (nextPageSize: number) => {
    setRunDetail(initialRunDetailState);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("runsPage", "1");
      next.set("runsPageSize", String(nextPageSize));
      next.delete("run");
      return next;
    });
  };

  const selectRun = (run: BackgroundOperationRun) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("run", String(run.operation_run_id));
      return next;
    });
  };

  const startSelectedOperation = async () => {
    if (!selectedModule) {
      return;
    }
    setActionErrorMessage(undefined);
    setStartingOperation(true);
    const result = await selectedModule.start();
    setStartingOperation(false);
    if (result.error) {
      setActionErrorMessage(
        apiErrorMessage(result.error, "Operation could not be started."),
      );
      return;
    }
    setResourceRevision((revision) => revision + 1);
    if (result.runId) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("runsPage", "1");
        next.set("runsPageSize", String(pageSize));
        next.set("run", String(result.runId));
        return next;
      });
    }
  };

  return (
    <Card className="min-h-0" data-testid="status-operations">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Background operations</CardTitle>
          </div>
          {selectedModule ? (
            <Button
              type="button"
              onClick={() => {
                void startSelectedOperation();
              }}
              disabled={startingOperation}
            >
              <Zap aria-hidden="true" />
              {startingOperation ? "Starting" : "Run now"}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t-2 border-[var(--hairline)] pt-4">
          <label
            className="font-heading text-xs font-semibold uppercase"
            htmlFor="status-operation-select"
          >
            Operation
          </label>
          <Select
            value={selectedOperationId}
            onValueChange={(operationID) =>
              setOperation(operationID as BackgroundOperationId)
            }
            disabled={
              operations.loading || operations.operationIds.length === 0
            }
          >
            <SelectTrigger id="status-operation-select" aria-label="Operation">
              <SelectValue placeholder="Choose an operation" />
            </SelectTrigger>
            <SelectContent>
              {operations.operationIds.map((operationId) => (
                <SelectItem key={operationId} value={operationId}>
                  {operationLabel(operationId)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {operations.loading ? (
            <span className="text-muted-foreground font-mono text-xs">
              Loading operations
            </span>
          ) : null}
        </div>
      </CardHeader>

      {operations.errorMessage ? (
        <CardContent>
          <StatusError message={operations.errorMessage} />
        </CardContent>
      ) : null}
      {invalidOperationId ? (
        <CardContent>
          <StatusError
            message={`Background operation "${invalidOperationId}" was not found.`}
          />
        </CardContent>
      ) : null}

      {selectedOperationId ? (
        <>
          <CardContent>
            <div className="bg-muted grid gap-3 border-2 border-[var(--border-ink)] p-3 sm:grid-cols-4">
              <StatusMetric
                label="State"
                loading={operationStatus.loading}
                value={operationStatus.status?.state ?? "Unavailable"}
              />
              <StatusMetric
                label="Enabled"
                loading={operationStatus.loading}
                value={operationStatus.status?.enabled ? "Yes" : "No"}
              />
              <StatusMetric
                label="Schedule"
                loading={operationStatus.loading}
                value={operationStatus.status?.schedule || "Manual only"}
              />
              <StatusMetric
                label="Completed runs"
                loading={operationStatus.loading}
                value={operationStatus.status?.runCount ?? "—"}
              />
            </div>
            {operationStatus.errorMessage ? (
              <div className="mt-3">
                <StatusError message={operationStatus.errorMessage} />
              </div>
            ) : null}
            {actionErrorMessage ? (
              <div className="mt-3">
                <StatusError message={actionErrorMessage} />
              </div>
            ) : null}
          </CardContent>

          <div className="border-y-2 border-[var(--border-ink)]">
            <table
              className="w-full max-w-full table-fixed text-left text-sm"
              data-testid="operation-runs-table"
            >
              <thead className="font-heading bg-[var(--color-class-transfer-bright)] text-xs uppercase">
                <tr>
                  <th className="w-[34%] px-3 py-2 md:w-[24%]">Started</th>
                  <th className="hidden w-[30%] px-3 py-2 md:table-cell">
                    Finished / duration
                  </th>
                  <th className="hidden w-[16%] px-3 py-2 md:table-cell">
                    Trigger
                  </th>
                  <th className="w-[26%] px-3 py-2 md:w-[16%]">Outcome</th>
                  <th className="w-[20%] px-3 py-2 text-right md:w-[14%]">
                    Run
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.loading && runs.operationId !== selectedOperationId ? (
                  <RunSkeletonRows />
                ) : null}
                {runs.operationId === selectedOperationId
                  ? runs.runs.map((run, index) => {
                      const selected = run.operation_run_id === selectedRunID;
                      return (
                        <tr
                          key={run.operation_run_id}
                          tabIndex={0}
                          aria-expanded={selected}
                          aria-label={`Open run ${run.operation_run_id}`}
                          className={`hover:bg-muted focus-visible:outline-ring cursor-pointer border-t border-[var(--hairline)] outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] ${
                            index % 2 === 1 ? "bg-[var(--band)]" : "bg-card"
                          } ${selected ? "bg-muted" : ""}`}
                          onClick={() => {
                            selectRun(run);
                          }}
                          onKeyDown={(event) => {
                            rowKeyDown(event, () => {
                              selectRun(run);
                            });
                          }}
                        >
                          <td className="truncate px-3 py-3 font-mono">
                            {formatTimestamp(run.started_at)}
                          </td>
                          <td className="hidden truncate px-3 py-3 font-mono md:table-cell">
                            {formatFinished(run)}
                          </td>
                          <td className="hidden px-3 py-3 font-mono md:table-cell">
                            {run.trigger}
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant={runStatusVariant(run.outcome)}>
                              {run.outcome}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-right font-mono">
                            <span className="inline-flex items-center gap-1">
                              {run.operation_run_id}
                              <ChevronRight
                                aria-hidden="true"
                                className="size-4"
                              />
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  : null}
              </tbody>
            </table>
          </div>

          {runs.errorMessage ? (
            <CardContent className="pt-4">
              <StatusError message={runs.errorMessage} />
            </CardContent>
          ) : null}
          {runs.operationId === selectedOperationId &&
          !runs.loading &&
          runs.runs.length === 0 ? (
            <CardContent className="py-8 text-center">
              <p className="font-heading text-sm uppercase">No runs yet</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Start a manual run to add the first entry to this operation
                history.
              </p>
            </CardContent>
          ) : null}

          <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="operation-runs-page-size" className="font-medium">
                Rows
              </label>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => setPageSize(Number(value))}
              >
                <SelectTrigger
                  id="operation-runs-page-size"
                  size="compact"
                  aria-label="Rows per page"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operationPageSizes.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              {runs.loading ? (
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
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= currentPageCount}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </CardContent>

          {selectedRunDetailState.errorMessage ? (
            <CardContent className="pt-0">
              <StatusError message={selectedRunDetailState.errorMessage} />
            </CardContent>
          ) : null}
          {selectedRunDetailState.loading ? (
            <CardContent className="pt-0">
              <Skeleton className="h-48 w-full" />
            </CardContent>
          ) : null}
          {selectedRunDetail && selectedModule ? (
            <CardContent className="pt-0">
              <RunDetailFrame
                label={operationLabel(selectedRunDetail.operation_id)}
                moduleDetail={selectedModule.renderRunDetail(selectedRunDetail)}
                run={selectedRunDetail}
              />
            </CardContent>
          ) : null}
        </>
      ) : null}
    </Card>
  );
};

const StatusMetric = ({
  label,
  loading,
  value,
}: {
  readonly label: string;
  readonly loading: boolean;
  readonly value: ReactNode;
}) => (
  <div>
    <p className="text-muted-foreground font-heading text-xs uppercase">
      {label}
    </p>
    {loading ? (
      <Skeleton className="mt-2 h-4 w-20" />
    ) : (
      <p className="mt-1 font-mono text-sm">{value}</p>
    )}
  </div>
);

const StatusError = ({ message }: { readonly message: string }) => (
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

const runSkeletonCellClasses = [
  "px-3 py-3",
  "hidden px-3 py-3 md:table-cell",
  "hidden px-3 py-3 md:table-cell",
  "px-3 py-3",
  "px-3 py-3",
] as const;

const RunSkeletonRows = () => (
  <>
    {[0, 1, 2].map((row) => (
      <tr key={row} className={row % 2 === 1 ? "bg-[var(--band)]" : "bg-card"}>
        {runSkeletonCellClasses.map((className, column) => (
          <td key={column} className={className}>
            <Skeleton className="h-4 w-3/4" />
          </td>
        ))}
      </tr>
    ))}
  </>
);
