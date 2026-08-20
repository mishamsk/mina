import { RefreshCw } from "lucide-react";
import { Lock } from "pixelarticons/react";
import { Tabs } from "radix-ui";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { getHealth, type HealthResponse, isNetworkFailure } from "../api";
import { PageHelp } from "../components/page-help";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { PageHeader } from "../features/app-shell";
import { StatusAuditLog, StatusOperations } from "../features/status";

interface HealthState {
  readonly data: HealthResponse | undefined;
  readonly errorDetails: string | undefined;
  readonly loading: boolean;
  readonly serverTime: string | undefined;
}

const initialHealthState: HealthState = {
  data: undefined,
  errorDetails: undefined,
  loading: true,
  serverTime: undefined,
};

type StatusTabValue = "operations" | "audit-log";

const errorMessage = (error: unknown): string => {
  if (isNetworkFailure(error)) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "object" &&
    error.error !== null &&
    "message" in error.error &&
    typeof error.error.message === "string"
  ) {
    return error.error.message;
  }
  return "API health check failed.";
};

const formatServerTime = (value: string | undefined): string => {
  if (!value) {
    return "Unavailable";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(parsed);
};

const formatDatabaseFileSize = (bytes: number | null): string => {
  if (bytes === null) {
    return "Unavailable";
  }

  const units = ["B", "KiB", "MiB", "GiB", "TiB"] as const;
  let exponent = Math.min(
    Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)),
    units.length - 1,
  );
  let value = bytes / 1024 ** exponent;
  if (
    exponent > 0 &&
    exponent < units.length - 1 &&
    Math.round(value * 10) / 10 >= 1024
  ) {
    exponent += 1;
    value = bytes / 1024 ** exponent;
  }
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  }).format(value)} ${units[exponent]}`;
};

export const StatusPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [health, setHealth] = useState<HealthState>(initialHealthState);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const activeTab =
    searchParams.get("tab") === "audit-log" ? "audit-log" : "operations";

  const setActiveTab = (tab: StatusTabValue) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", tab);
      return next;
    });
  };

  useEffect(() => {
    let active = true;

    const loadHealth = async () => {
      setHealth((current) => ({
        ...current,
        errorDetails: undefined,
        loading: true,
      }));

      const result = await getHealth();
      if (!active) {
        return;
      }

      if (result.data) {
        setHealth({
          data: result.data,
          errorDetails: undefined,
          loading: false,
          serverTime: result.response?.headers.get("Date") ?? undefined,
        });
        return;
      }

      setHealth({
        data: undefined,
        errorDetails: errorMessage(result.error),
        loading: false,
        serverTime: undefined,
      });
    };

    void loadHealth();

    return () => {
      active = false;
    };
  }, [refreshRevision]);

  return (
    <section className="flex flex-col gap-6" aria-labelledby="status-title">
      <PageHeader
        title="Status"
        titleId="status-title"
        eyebrow="Local web UI"
        help={
          <PageHelp label="Status help">
            Backend health, background work, and API mutation history for this
            Mina process.
          </PageHelp>
        }
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setRefreshRevision((revision) => revision + 1);
            }}
            disabled={health.loading}
          >
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {health.loading ? (
        <div
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"
          aria-label="Loading status"
        >
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : null}

      {health.errorDetails ? (
        <div className="border-destructive bg-card border-2 p-4" role="alert">
          <p className="text-destructive font-semibold">
            Status could not be loaded.
          </p>
          <details className="text-muted-foreground mt-3 text-sm">
            <summary className="text-foreground cursor-pointer">
              API error
            </summary>
            <pre className="mt-2 overflow-auto font-mono text-xs whitespace-pre-wrap">
              {health.errorDetails}
            </pre>
          </details>
        </div>
      ) : null}

      {health.data ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Card size="sm">
            <CardHeader>
              <p className="text-muted-foreground text-sm">API status</p>
            </CardHeader>
            <CardContent>
              <p>
                <Badge variant="secondary">{health.data.status}</Badge>
              </p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <p className="text-muted-foreground text-sm">Schema version</p>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">
                {health.data.schema_version}
              </p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <p className="text-muted-foreground text-sm">Server time</p>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold break-words">
                {formatServerTime(health.serverTime)}
              </p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <p className="text-muted-foreground text-sm">
                Database file size
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">
                {formatDatabaseFileSize(health.data.database_file_size_bytes)}
              </p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <p className="text-muted-foreground text-sm">
                Database encryption
              </p>
            </CardHeader>
            <CardContent>
              <p className="flex items-center gap-2 text-lg font-semibold">
                {health.data.database_encrypted ? (
                  <Lock aria-hidden="true" className="size-4 shrink-0" />
                ) : null}
                {health.data.database_encrypted ? "Encrypted" : "Not encrypted"}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Tabs.Root
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as StatusTabValue)}
      >
        <Tabs.List
          className="bg-muted flex w-full border-2 border-[var(--border-ink)] p-1 shadow-[var(--shadow-pixel)] sm:w-fit"
          aria-label="Status views"
        >
          <Tabs.Trigger
            value="operations"
            className="font-heading text-muted-foreground hover:text-foreground min-h-9 flex-1 border-2 border-transparent px-4 text-xs font-semibold uppercase transition-colors duration-150 ease-[steps(2)] data-[state=active]:border-[var(--border-ink)] data-[state=active]:bg-[var(--color-interactive-bright)] data-[state=active]:text-[var(--foreground)] motion-reduce:transition-none sm:flex-none"
          >
            Background operations
          </Tabs.Trigger>
          <Tabs.Trigger
            value="audit-log"
            className="font-heading text-muted-foreground hover:text-foreground min-h-9 flex-1 border-2 border-transparent px-4 text-xs font-semibold uppercase transition-colors duration-150 ease-[steps(2)] data-[state=active]:border-[var(--border-ink)] data-[state=active]:bg-[var(--color-interactive-bright)] data-[state=active]:text-[var(--foreground)] motion-reduce:transition-none sm:flex-none"
          >
            Audit log
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="operations" className="mt-6">
          <StatusOperations refreshRevision={refreshRevision} />
        </Tabs.Content>
        <Tabs.Content value="audit-log" className="mt-6">
          <StatusAuditLog refreshRevision={refreshRevision} />
        </Tabs.Content>
      </Tabs.Root>
    </section>
  );
};
