import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { getHealth, type HealthResponse, isNetworkFailure } from "../api";
import { PageHelp } from "../components/page-help";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Separator } from "../components/ui/separator";
import { Skeleton } from "../components/ui/skeleton";
import { PageHeader } from "../features/app-shell";
import { StatusOperations } from "../features/status";
import { setStatusPageShowDetails, useStatusPageView } from "../store";

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

export const StatusPage = () => {
  const { showDetails } = useStatusPageView();
  const [health, setHealth] = useState<HealthState>(initialHealthState);
  const [refreshRevision, setRefreshRevision] = useState(0);

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
            Backend health and local UI state for this Mina process.
          </PageHelp>
        }
        actions={
          <>
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
            <label
              htmlFor="status-details"
              className="bg-card text-foreground flex h-8 items-center gap-2 border-2 border-[var(--border-ink)] px-3 text-sm shadow-[var(--shadow-pixel)]"
            >
              <Checkbox
                id="status-details"
                checked={showDetails}
                onCheckedChange={(checked) => {
                  setStatusPageShowDetails(checked === true);
                }}
              />
              <span>Details</span>
            </label>
          </>
        }
      />

      {health.loading ? (
        <div className="grid gap-3 md:grid-cols-3" aria-label="Loading status">
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
        <div className="grid gap-3 md:grid-cols-3">
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
        </div>
      ) : null}

      {showDetails && health.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Backend health route</CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="flex flex-wrap items-center gap-3">
            <code className="bg-muted text-muted-foreground px-2 py-1 font-mono text-sm">
              /api/health
            </code>
          </CardContent>
        </Card>
      ) : null}

      <StatusOperations refreshRevision={refreshRevision} />
    </section>
  );
};
