import { RefreshCw } from "lucide-react";
import { Database, ExternalLink, Lock, Server } from "pixelarticons/react";
import { Tabs } from "radix-ui";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { getHealth, type HealthResponse, isNetworkFailure } from "../api";
import { PageHelp } from "../components/page-help";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
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

const browserRepositoryURL = (repoURL: string): string | undefined => {
  if (repoURL === "unknown") {
    return undefined;
  }
  try {
    const parsed = new URL(repoURL);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

const buildCommitURL = (
  repoURL: string,
  commitSHA: string,
): string | undefined => {
  const repositoryURL = browserRepositoryURL(repoURL);
  if (!repositoryURL || commitSHA === "unknown") {
    return undefined;
  }
  return `${repositoryURL.replace(/\/?\.git\/?$/, "").replace(/\/$/, "")}/commit/${encodeURIComponent(commitSHA)}`;
};

interface ServerInfoPopoverProps {
  readonly health: HealthResponse | undefined;
  readonly serverTime: string | undefined;
}

const ServerInfoPopover = ({ health, serverTime }: ServerInfoPopoverProps) => {
  const repositoryURL = health
    ? browserRepositoryURL(health.version.repo_url)
    : undefined;
  const commitURL = health
    ? buildCommitURL(health.version.repo_url, health.version.commit_sha)
    : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={!health}>
          <Server aria-hidden="true" />
          Server info
        </Button>
      </PopoverTrigger>
      {health ? (
        <PopoverContent
          align="end"
          sideOffset={10}
          aria-label="Server info"
          className="w-[min(36rem,calc(100vw-2rem))] p-0"
        >
          <header className="flex items-start justify-between gap-4 border-b-2 border-[var(--border-ink)] bg-[var(--color-interactive-bright)] p-4">
            <div className="flex min-w-0 items-start gap-3">
              <Server aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0">
                <h2 className="font-heading text-base font-bold uppercase">
                  Server info
                </h2>
                <p className="font-body mt-1 text-sm">
                  Runtime, database, and source provenance.
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="bg-[var(--color-status-posted-bright)] text-[var(--color-status-posted-ink)]"
            >
              {health.status}
            </Badge>
          </header>

          <div className="max-h-[min(32rem,calc(100dvh-8rem))] overflow-y-auto">
            <section aria-labelledby="server-runtime-heading" className="p-4">
              <h3
                id="server-runtime-heading"
                className="font-heading text-muted-foreground text-xs font-bold uppercase"
              >
                Runtime
              </h3>
              <dl className="mt-2 divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
                <div className="grid gap-1 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-baseline">
                  <dt className="text-muted-foreground font-mono text-xs">
                    Server time
                  </dt>
                  <dd className="font-mono text-sm font-semibold sm:text-right sm:whitespace-nowrap">
                    {formatServerTime(serverTime)}
                  </dd>
                </div>
              </dl>
            </section>

            <section
              aria-labelledby="server-database-heading"
              className="border-t-2 border-[var(--border-ink)] bg-[var(--band)] p-4"
            >
              <h3
                id="server-database-heading"
                className="font-heading flex items-center gap-2 text-xs font-bold uppercase"
              >
                <Database aria-hidden="true" className="size-4" />
                Database
              </h3>
              <dl className="mt-2 divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
                <div className="grid gap-1 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-baseline">
                  <dt className="text-muted-foreground font-mono text-xs">
                    Schema version
                  </dt>
                  <dd className="font-mono text-sm font-semibold sm:text-right">
                    {health.schema_version}
                  </dd>
                </div>
                <div className="grid gap-1 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-baseline">
                  <dt className="text-muted-foreground font-mono text-xs">
                    Database file size
                  </dt>
                  <dd className="font-mono text-sm font-semibold sm:text-right">
                    {formatDatabaseFileSize(health.database_file_size_bytes)}
                  </dd>
                </div>
                <div className="grid gap-1 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-baseline">
                  <dt className="text-muted-foreground font-mono text-xs">
                    Database encryption
                  </dt>
                  <dd className="flex items-center gap-2 font-mono text-sm font-semibold sm:justify-end">
                    {health.database_encrypted ? (
                      <Lock aria-hidden="true" className="size-4 shrink-0" />
                    ) : null}
                    {health.database_encrypted ? "Encrypted" : "Not encrypted"}
                  </dd>
                </div>
              </dl>
            </section>

            <section
              aria-labelledby="server-build-heading"
              className="border-t-2 border-[var(--border-ink)] p-4"
            >
              <h3
                id="server-build-heading"
                className="font-heading text-muted-foreground text-xs font-bold uppercase"
              >
                Build
              </h3>
              <dl className="mt-2 divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
                <div className="grid gap-1 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-baseline">
                  <dt className="text-muted-foreground font-mono text-xs">
                    Build type
                  </dt>
                  <dd className="font-mono text-sm font-semibold capitalize sm:text-right">
                    {health.version.type}
                  </dd>
                </div>
                <div className="grid gap-1 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start">
                  <dt className="text-muted-foreground font-mono text-xs">
                    Commit SHA
                  </dt>
                  <dd className="min-w-0 font-mono text-xs font-semibold break-all sm:text-right">
                    {commitURL ? (
                      <a
                        href={commitURL}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-end gap-1 text-[var(--color-interactive-ink)] underline decoration-2 underline-offset-2"
                      >
                        {health.version.commit_sha}
                        <ExternalLink
                          aria-hidden="true"
                          className="size-3 shrink-0"
                        />
                      </a>
                    ) : (
                      health.version.commit_sha
                    )}
                  </dd>
                </div>
                <div className="grid gap-1 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start">
                  <dt className="text-muted-foreground font-mono text-xs">
                    Source repository
                  </dt>
                  <dd className="min-w-0 font-mono text-xs font-semibold break-all sm:text-right">
                    {repositoryURL ? (
                      <a
                        href={repositoryURL}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-start justify-end gap-1 text-[var(--color-interactive-ink)] underline decoration-2 underline-offset-2"
                      >
                        {health.version.repo_url}
                        <ExternalLink
                          aria-hidden="true"
                          className="mt-px size-3 shrink-0"
                        />
                      </a>
                    ) : (
                      health.version.repo_url
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </PopoverContent>
      ) : null}
    </Popover>
  );
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
    <section className="flex flex-col gap-4" aria-labelledby="status-title">
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
          <>
            <ServerInfoPopover
              health={health.data}
              serverTime={health.serverTime}
            />
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
          </>
        }
      />

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
        <Tabs.Content value="operations" className="mt-4">
          <StatusOperations refreshRevision={refreshRevision} />
        </Tabs.Content>
        <Tabs.Content value="audit-log" className="mt-4">
          <StatusAuditLog refreshRevision={refreshRevision} />
        </Tabs.Content>
      </Tabs.Root>
    </section>
  );
};
