import type { ReactNode } from "react";

import {
  type BackgroundOperationId,
  type DatabaseBackupRun,
  type ExchangeRateLoadingRun,
  getDatabaseBackupRun,
  getDatabaseBackupStatus,
  getExchangeRateLoadingRun,
  getExchangeRateLoadingStatus,
  startDatabaseBackupRun,
  startExchangeRateLoadingRun,
} from "@/api";

export interface OperationStatusSummary {
  readonly enabled: boolean;
  readonly runCount: number;
  readonly schedule: string;
  readonly state: string;
}

export type ConcreteOperationRun = ExchangeRateLoadingRun | DatabaseBackupRun;

export interface OperationModule {
  readonly label: string;
  readonly loadRun: (runID: number) => Promise<{
    readonly error?: unknown;
    readonly run?: ConcreteOperationRun;
  }>;
  readonly loadStatus: () => Promise<{
    readonly error?: unknown;
    readonly status?: OperationStatusSummary;
  }>;
  readonly renderRunDetail: (run: ConcreteOperationRun) => ReactNode;
  readonly start: () => Promise<{
    readonly error?: unknown;
    readonly runId?: number;
  }>;
}

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

const ExchangeRateLoadingRunDetail = ({
  run,
}: {
  readonly run: ExchangeRateLoadingRun;
}) => (
  <DefinitionList>
    <DefinitionField label="Operation" value="Exchange-rate loading" />
    <DefinitionField label="Run ID" value={run.operation_run_id} />
    <DefinitionField label="Work" value="Rate load and USD backfill" />
    <DefinitionField
      label="Result"
      value={run.error ?? "No operation-specific message was recorded."}
    />
  </DefinitionList>
);

const DatabaseBackupRunDetail = ({
  run,
}: {
  readonly run: DatabaseBackupRun;
}) => (
  <DefinitionList>
    <DefinitionField label="Operation" value="Database backup" />
    <DefinitionField label="Run ID" value={run.operation_run_id} />
    <DefinitionField label="Work" value="Local database backup" />
    <DefinitionField
      label="Result"
      value={run.error ?? "No operation-specific message was recorded."}
    />
  </DefinitionList>
);

export const operationModules: Record<BackgroundOperationId, OperationModule> =
  {
    "exchange-rate-loading": {
      label: "Exchange-rate loading",
      loadRun: async (runID) => {
        const result = await getExchangeRateLoadingRun({
          path: { operation_run_id: runID },
        });
        return result.data ? { run: result.data } : { error: result.error };
      },
      loadStatus: async () => {
        const result = await getExchangeRateLoadingStatus();
        if (!result.data) {
          return { error: result.error };
        }
        return {
          status: {
            enabled: result.data.enabled,
            runCount: result.data.run_count,
            schedule: result.data.schedule_utc,
            state: result.data.state,
          },
        };
      },
      renderRunDetail: (run) => (
        <ExchangeRateLoadingRunDetail run={run as ExchangeRateLoadingRun} />
      ),
      start: async () => {
        const result = await startExchangeRateLoadingRun();
        return result.data
          ? { runId: result.data.operation_run_id }
          : { error: result.error };
      },
    },
    "database-backup": {
      label: "Database backup",
      loadRun: async (runID) => {
        const result = await getDatabaseBackupRun({
          path: { operation_run_id: runID },
        });
        return result.data ? { run: result.data } : { error: result.error };
      },
      loadStatus: async () => {
        const result = await getDatabaseBackupStatus();
        if (!result.data) {
          return { error: result.error };
        }
        return {
          status: {
            enabled: result.data.enabled,
            runCount: result.data.run_count,
            schedule: result.data.schedule_utc,
            state: result.data.state,
          },
        };
      },
      renderRunDetail: (run) => (
        <DatabaseBackupRunDetail run={run as DatabaseBackupRun} />
      ),
      start: async () => {
        const result = await startDatabaseBackupRun();
        return result.data
          ? { runId: result.data.operation_run_id }
          : { error: result.error };
      },
    },
  };

export const operationLabel = (operationID: BackgroundOperationId): string =>
  operationModules[operationID].label;
