import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { getHealth, type HealthResponse, isNetworkFailure } from "../api";
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
import { setStatusPageShowDetails, useStatusPageView } from "../store";

interface HealthState {
  readonly data: HealthResponse | undefined;
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly serverTime: string | undefined;
}

const initialHealthState: HealthState = {
  data: undefined,
  errorMessage: undefined,
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

const formatServerTime = (value: string | undefined): string =>
  value ?? "Unavailable";

export const StatusPage = () => {
  const { showDetails } = useStatusPageView();
  const [health, setHealth] = useState<HealthState>(initialHealthState);
  const [refreshRevision, setRefreshRevision] = useState(0);

  useEffect(() => {
    let active = true;

    const loadHealth = async () => {
      setHealth((current) => ({
        ...current,
        errorMessage: undefined,
        loading: true,
      }));

      const result = await getHealth();
      if (!active) {
        return;
      }

      if (result.data) {
        setHealth({
          data: result.data,
          errorMessage: undefined,
          loading: false,
          serverTime: result.response?.headers.get("Date") ?? undefined,
        });
        return;
      }

      setHealth({
        data: undefined,
        errorMessage: errorMessage(result.error),
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
    <section
      className="mx-auto flex w-full max-w-5xl flex-col gap-6"
      aria-labelledby="status-title"
    >
      <header className="border-border flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm font-medium">
            Local web UI
          </p>
          <h1
            id="status-title"
            className="font-heading mt-1 text-3xl font-semibold tracking-normal"
          >
            Mina
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setRefreshRevision((revision) => revision + 1);
            }}
            disabled={health.loading}
          >
            <RefreshCw
              className={health.loading ? "animate-spin" : undefined}
              aria-hidden="true"
            />
            Refresh
          </Button>
          <label
            htmlFor="status-details"
            className="border-border bg-card flex h-8 items-center gap-2 rounded-lg border px-3 text-sm"
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
        </div>
      </header>

      {health.loading ? (
        <p className="text-muted-foreground text-sm">Checking API status...</p>
      ) : null}

      {health.errorMessage ? (
        <p
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm"
          role="alert"
        >
          {health.errorMessage}
        </p>
      ) : null}

      {health.data ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Card size="sm">
            <CardHeader>
              <p className="text-muted-foreground text-sm">API status</p>
            </CardHeader>
            <CardContent>
              <p>
                <Badge variant="secondary" className="capitalize">
                  {health.data.status}
                </Badge>
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
            <code className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-sm">
              /api/health
            </code>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
};
