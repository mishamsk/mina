import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import type { ConcreteOperationRun } from "@/features/status/operation-modules";

const DefinitionList = ({ children }: { readonly children: ReactNode }) => (
  <dl className="grid gap-3 text-sm sm:grid-cols-2">{children}</dl>
);

const DefinitionField = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}) => (
  <div className="border-l-2 border-[var(--hairline)] pl-3">
    <dt className="text-muted-foreground font-heading text-xs uppercase">
      {label}
    </dt>
    <dd className="mt-1 font-mono text-sm">{value}</dd>
  </div>
);

const formatTimestamp = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));

const formatFinished = (run: ConcreteOperationRun): string => {
  if (!run.completed_at) {
    return "Running";
  }
  const duration =
    new Date(run.completed_at).getTime() - new Date(run.started_at).getTime();
  return `${formatTimestamp(run.completed_at)} (${formatDuration(duration)})`;
};

const formatDuration = (milliseconds: number): string => {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

const outcomeVariant = (
  outcome: ConcreteOperationRun["outcome"],
): "destructive" | "outline" | "secondary" => {
  switch (outcome) {
    case "failed":
    case "canceled":
      return "destructive";
    case "succeeded":
      return "secondary";
    default:
      return "outline";
  }
};

export const RunDetailFrame = ({
  label,
  moduleDetail,
  run,
}: {
  readonly label: string;
  readonly moduleDetail: ReactNode;
  readonly run: ConcreteOperationRun;
}) => (
  <div
    className="bg-muted border-2 border-[var(--border-ink)] p-4"
    data-testid="operation-run-detail"
  >
    <div className="mb-4 flex items-center justify-between gap-3 border-b-2 border-[var(--hairline)] pb-3">
      <div>
        <p className="font-heading text-sm uppercase">Run detail</p>
        <p className="text-muted-foreground mt-1 font-mono text-sm">
          {label} · run {run.operation_run_id}
        </p>
      </div>
      <Badge variant={outcomeVariant(run.outcome)}>{run.outcome}</Badge>
    </div>
    <DefinitionList>
      <DefinitionField
        label="Started"
        value={formatTimestamp(run.started_at)}
      />
      <DefinitionField label="Finished" value={formatFinished(run)} />
      <DefinitionField label="Trigger" value={run.trigger} />
      <DefinitionField label="Error" value={run.error ?? "None"} />
    </DefinitionList>
    <div className="mt-5 border-t-2 border-[var(--hairline)] pt-4">
      {moduleDetail}
    </div>
  </div>
);
