import { BracketsContent, Reload, Star, Terminal } from "pixelarticons/react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  apiErrorDetails,
  getSettings,
  type SettingField,
  type SettingSource,
  type SettingsResponse,
} from "@/api";
import { PageHelp } from "@/components/page-help";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/features/app-shell";
import { useCommandPaletteOpen } from "@/store";

const SettingsSkeletonRow = () => (
  <div className="grid gap-3 border-t border-[var(--hairline)] pt-4 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)]">
    <div className="grid gap-2">
      <Skeleton className="h-4 w-36 max-w-full" />
      <Skeleton className="h-4 w-full max-w-sm" />
    </div>
    <div>
      <Skeleton className="h-9 w-full" />
    </div>
  </div>
);

const SettingsSkeleton = () => (
  <div className="grid gap-6" aria-label="Loading settings" aria-busy="true">
    <div className="bg-card text-card-foreground grid min-w-0 gap-1 border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)] sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-4">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-7 w-full sm:ml-auto sm:max-w-md" />
    </div>

    <div className="grid gap-5" aria-hidden="true">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48 max-w-full" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <SettingsSkeletonRow />
            <SettingsSkeletonRow />
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
);

const SettingValue = ({ field }: { readonly field: SettingField }) => {
  switch (field.control) {
    case "boolean":
      return (
        <span className="font-heading font-semibold">
          {field.value === "true" ? "Enabled" : "Disabled"}
        </span>
      );
    case "integer":
      return (
        <span className="font-mono break-all tabular-nums">{field.value}</span>
      );
    case "select":
    case "text":
      return (
        <span className="font-mono break-all whitespace-pre-wrap">
          {field.value}
        </span>
      );
  }
};

const SettingIndicator = ({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}) => (
  <Tooltip focusable={false} label={label}>
    <span
      aria-label={label}
      className="text-muted-foreground inline-flex size-4 shrink-0"
    >
      {children}
    </span>
  </Tooltip>
);

const SettingIndicators = ({ source }: { readonly source: SettingSource }) => {
  if (source === "default") {
    return null;
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {source === "cli_override" ? (
        <SettingIndicator label="CLI override">
          <Terminal aria-hidden="true" className="size-4" />
        </SettingIndicator>
      ) : null}
      {source === "environment" ? (
        <SettingIndicator label="Environment variable override">
          <BracketsContent aria-hidden="true" className="size-4" />
        </SettingIndicator>
      ) : null}
      <SettingIndicator label="Non-default value">
        <Star
          aria-hidden="true"
          className="size-4 text-[var(--color-class-adjustment-ink)]"
        />
      </SettingIndicator>
    </span>
  );
};

const SettingRow = ({ field }: { readonly field: SettingField }) => (
  <div
    className="grid gap-3 border-t border-[var(--hairline)] pt-4 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)] md:items-start"
    data-testid={`setting-${field.setting_key}`}
  >
    <dt className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <p className="font-heading min-w-0 text-sm font-semibold break-words">
          {field.label}
        </p>
        <SettingIndicators source={field.source} />
      </div>
      <p className="text-muted-foreground mt-1 font-sans text-sm break-words">
        {field.help}
      </p>
    </dt>
    <dd className="min-w-0">
      <div className="bg-muted flex min-h-9 min-w-0 items-center border border-[var(--border-ink)] px-3 py-2 text-sm">
        <SettingValue field={field} />
      </div>
    </dd>
  </div>
);

const SettingsView = ({
  focusTargetRef,
  settings,
}: {
  readonly focusTargetRef: RefObject<HTMLHeadingElement | null>;
  readonly settings: SettingsResponse;
}) => (
  <>
    <div className="bg-card text-card-foreground grid min-w-0 gap-1 border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)] sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-4">
      <span className="font-heading text-sm font-semibold uppercase">
        Config file
      </span>
      <code className="bg-muted min-w-0 border border-[var(--border-ink)] px-2 py-1 text-xs break-all whitespace-pre-wrap sm:text-right">
        {settings.config_file_path || "Unavailable"}
      </code>
    </div>

    <div className="grid gap-5">
      {settings.groups.map((group, index) => (
        <Card
          key={group.group_key}
          data-testid={`settings-group-${group.group_key}`}
        >
          <CardHeader>
            <h2
              ref={index === 0 ? focusTargetRef : undefined}
              tabIndex={index === 0 ? -1 : undefined}
              className="font-heading text-base leading-snug font-semibold break-words uppercase"
            >
              {group.label}
            </h2>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4">
              {group.fields.map((field) => (
                <SettingRow key={field.setting_key} field={field} />
              ))}
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  </>
);

export const SettingsPageContent = () => {
  const commandPaletteOpen = useCommandPaletteOpen();
  const pageTitleRef = useRef<HTMLHeadingElement>(null);
  const loadedFocusTargetRef = useRef<HTMLHeadingElement>(null);
  const retryFocusPendingRef = useRef(false);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const [settings, setSettings] = useState<SettingsResponse>();
  const [errorDetails, setErrorDetails] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (
        activeElement === document.body ||
        (activeElement instanceof HTMLAnchorElement &&
          activeElement.pathname === "/settings")
      ) {
        pageTitleRef.current?.focus({ preventScroll: true });
      }
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void getSettings().then((result) => {
      if (!active) {
        return;
      }
      if (result.data) {
        setSettings(result.data);
        setErrorDetails(undefined);
        setLoading(false);
        return;
      }
      setErrorDetails(
        apiErrorDetails(result.error, "Settings could not be loaded."),
      );
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [revision]);

  useEffect(() => {
    if (!settings || !retryFocusPendingRef.current || commandPaletteOpen) {
      return;
    }
    retryFocusPendingRef.current = false;
    let focusFrame: number | undefined;
    const paletteRestoreFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => {
        if (
          document.activeElement === document.body ||
          document.activeElement === pageTitleRef.current
        ) {
          loadedFocusTargetRef.current?.focus();
        }
      });
    });
    return () => {
      window.cancelAnimationFrame(paletteRestoreFrame);
      if (focusFrame !== undefined) {
        window.cancelAnimationFrame(focusFrame);
      }
    };
  }, [commandPaletteOpen, settings]);

  useEffect(() => {
    if (!errorDetails || !retryFocusPendingRef.current || commandPaletteOpen) {
      return;
    }
    retryFocusPendingRef.current = false;
    if (
      document.activeElement === document.body ||
      document.activeElement === pageTitleRef.current
    ) {
      retryButtonRef.current?.focus();
    }
  }, [commandPaletteOpen, errorDetails]);

  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 min-w-0 [scrollbar-width:none] flex-col gap-6 overflow-y-auto pb-1 [&::-webkit-scrollbar]:hidden"
      aria-labelledby="settings-title"
    >
      <PageHeader
        title="Settings"
        titleClassName="outline-none"
        titleId="settings-title"
        titleRef={pageTitleRef}
        titleTabIndex={-1}
        eyebrow="Process configuration"
        help={
          <PageHelp label="Settings help">
            Mina loads configuration once at startup. This page reports the
            active values and their sources without changing the running process
            or its config file.
          </PageHelp>
        }
      />

      {loading ? <SettingsSkeleton /> : null}

      {errorDetails ? (
        <div
          className="border-destructive bg-card border-2 p-4 shadow-[var(--shadow-pixel)]"
          role="alert"
        >
          <p className="text-destructive font-semibold">
            Settings could not be loaded.
          </p>
          <details className="text-muted-foreground mt-3 text-sm">
            <summary className="text-foreground cursor-pointer">
              API error
            </summary>
            <pre className="mt-2 overflow-auto font-mono text-xs whitespace-pre-wrap">
              {errorDetails}
            </pre>
          </details>
          <Button
            ref={retryButtonRef}
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => {
              retryFocusPendingRef.current = true;
              pageTitleRef.current?.focus({ preventScroll: true });
              setSettings(undefined);
              setErrorDetails(undefined);
              setLoading(true);
              setRevision((current) => current + 1);
            }}
          >
            <Reload aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : null}

      {settings ? (
        <SettingsView
          focusTargetRef={loadedFocusTargetRef}
          settings={settings}
        />
      ) : null}
    </section>
  );
};
