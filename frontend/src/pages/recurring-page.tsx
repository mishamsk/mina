import { Plus } from "pixelarticons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSearchParams,
  type SetURLSearchParams,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";

import {
  apiErrorMessage,
  getRecurringDefinition,
  type RecurringDefinition,
} from "@/api";
import { PageHelp } from "@/components/page-help";
import { fixedPageClassName } from "@/components/reference-table-frame";
import { Toast, toastDurationMs } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell";
import {
  RecurringPageContent,
  revealRecurringDefinitionActionRow,
  useRecurringDefinitionsResource,
} from "@/features/recurring";
import {
  readReferenceSearchState,
  ReferenceToolbar,
} from "@/features/reference";
import {
  openEditRecurringDefinitionEditor,
  openNewRecurringDefinitionEditor,
  takeConsumedRecurringDefinitionFragmentNavigation,
  useCommandPaletteOpen,
  useRecurringDefinitionEditorView,
  useTemplateEditorView,
} from "@/store";

interface Notice {
  readonly id: number;
  readonly message: string;
  readonly tone: "error" | "success";
}

interface FragmentLookupFailure {
  readonly fragmentNavigation: string;
  readonly message: string;
}

const definitionIdFromFragment = (hash: string): number | undefined => {
  const match = /^#definition-([1-9][0-9]*)$/.exec(hash);
  return match ? Number(match[1]) : undefined;
};

export const RecurringPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { search } = readReferenceSearchState(searchParams);
  const [searchToolbarGeneration, setSearchToolbarGeneration] = useState(0);
  const recurringDefinitions = useRecurringDefinitionsResource(search);
  const commandPaletteOpen = useCommandPaletteOpen();
  const recurringDefinitionEditor = useRecurringDefinitionEditorView();
  const templateEditor = useTemplateEditorView();
  const [notice, setNotice] = useState<Notice | undefined>();
  const [fragmentLookupFailure, setFragmentLookupFailure] =
    useState<FragmentLookupFailure>();
  const [fragmentLookupRetryVersion, setFragmentLookupRetryVersion] =
    useState(0);
  const handledFragmentNavigationRef = useRef<string | undefined>(undefined);
  const deferredFragmentNavigationRef = useRef<string | undefined>(undefined);
  const newDefinitionButtonRef = useRef<HTMLButtonElement>(null);
  const setSearchParamsPreservingFragment = useCallback<SetURLSearchParams>(
    (nextInit, navigateOptions) => {
      const nextSearchParams = createSearchParams(
        typeof nextInit === "function" ? nextInit(searchParams) : nextInit,
      );
      void navigate(
        {
          hash: location.hash,
          pathname: location.pathname,
          search: nextSearchParams.toString(),
        },
        navigateOptions,
      );
    },
    [location.hash, location.pathname, navigate, searchParams],
  );

  useEffect(() => {
    const definitionId = definitionIdFromFragment(location.hash);
    if (definitionId === undefined) {
      handledFragmentNavigationRef.current = undefined;
      deferredFragmentNavigationRef.current = undefined;
      return;
    }
    const fragmentNavigation = `${location.key}:${location.hash}`;
    if (takeConsumedRecurringDefinitionFragmentNavigation(fragmentNavigation)) {
      handledFragmentNavigationRef.current = fragmentNavigation;
      deferredFragmentNavigationRef.current = undefined;
      void navigate(
        { pathname: location.pathname, search: location.search },
        { replace: true },
      );
      return;
    }
    if (handledFragmentNavigationRef.current === fragmentNavigation) {
      return;
    }
    if (
      commandPaletteOpen ||
      recurringDefinitionEditor.open ||
      templateEditor.open
    ) {
      deferredFragmentNavigationRef.current = fragmentNavigation;
      return;
    }
    if (!recurringDefinitions.snapshot) {
      return;
    }
    const snapshotDefinition = recurringDefinitions.snapshot.definitions.find(
      (candidate) => candidate.recurring_definition_id === definitionId,
    );
    let active = true;
    let frame: number | undefined;
    let deferredFrame: number | undefined;
    const showUnavailableDefinition = () => {
      handledFragmentNavigationRef.current = fragmentNavigation;
      deferredFragmentNavigationRef.current = undefined;
      frame = window.requestAnimationFrame(() => {
        setFragmentLookupFailure(undefined);
        setNotice((current) => ({
          id: (current?.id ?? 0) + 1,
          message: "Recurring definition is no longer available.",
          tone: "error",
        }));
        void navigate(
          { pathname: location.pathname, search: location.search },
          { replace: true },
        );
      });
    };
    const scheduleLinkedEditor = (definition: RecurringDefinition) => {
      const openLinkedEditor = () => {
        if (!active) {
          return;
        }
        setFragmentLookupFailure(undefined);
        const opener = document.getElementById(`definition-${definitionId}`);
        if (opener instanceof HTMLElement) {
          revealRecurringDefinitionActionRow(opener);
        }
        handledFragmentNavigationRef.current = fragmentNavigation;
        deferredFragmentNavigationRef.current = undefined;
        openEditRecurringDefinitionEditor(
          definition,
          opener instanceof HTMLElement ? opener : undefined,
          fragmentNavigation,
        );
      };
      frame = window.requestAnimationFrame(() => {
        if (deferredFragmentNavigationRef.current === fragmentNavigation) {
          deferredFrame = window.requestAnimationFrame(openLinkedEditor);
          return;
        }
        openLinkedEditor();
      });
    };
    if (snapshotDefinition) {
      scheduleLinkedEditor(snapshotDefinition);
    } else if (!search.trim()) {
      showUnavailableDefinition();
    } else {
      void getRecurringDefinition({
        path: { recurring_definition_id: definitionId },
      }).then((result) => {
        if (!active) {
          return;
        }
        if (!result.data && result.response?.status === 404) {
          showUnavailableDefinition();
          return;
        }
        if (!result.data) {
          setFragmentLookupFailure({
            fragmentNavigation,
            message: apiErrorMessage(
              result.error,
              "Recurring definition could not be loaded.",
            ),
          });
          return;
        }
        scheduleLinkedEditor(result.data);
      });
    }
    return () => {
      active = false;
      if (frame !== undefined) {
        window.cancelAnimationFrame(frame);
      }
      if (deferredFrame !== undefined) {
        window.cancelAnimationFrame(deferredFrame);
      }
    };
  }, [
    commandPaletteOpen,
    location.hash,
    location.key,
    location.pathname,
    location.search,
    navigate,
    recurringDefinitionEditor.open,
    recurringDefinitions.snapshot,
    fragmentLookupRetryVersion,
    search,
    templateEditor.open,
  ]);

  const clearDefinitionFragment = () => {
    if (definitionIdFromFragment(location.hash) === undefined) {
      return;
    }
    setFragmentLookupFailure(undefined);
    void navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true },
    );
  };

  const showNotice = (message: string) => {
    setNotice((current) => ({
      id: (current?.id ?? 0) + 1,
      message,
      tone: "success",
    }));
  };

  return (
    <section className={fixedPageClassName} aria-labelledby="recurring-title">
      <PageHeader
        title="Recurring"
        titleId="recurring-title"
        eyebrow="Ledger"
        actions={
          <Button
            ref={newDefinitionButtonRef}
            type="button"
            onClick={(event) => {
              clearDefinitionFragment();
              openNewRecurringDefinitionEditor(event.currentTarget);
            }}
          >
            <Plus aria-hidden="true" />
            New definition
          </Button>
        }
        help={
          <PageHelp label="Recurring help">
            Manage recurring transaction definitions. Expected transactions
            appear inline in Transactions.
          </PageHelp>
        }
        toolbar={
          <ReferenceToolbar
            includeHidden={false}
            search={search}
            searchDraftResetVersion={searchToolbarGeneration}
            searchInputId="recurring-search"
            searchPlaceholder="Full definition path"
            setSearchParams={setSearchParamsPreservingFragment}
            showIncludeHiddenToggle={false}
          />
        }
      />
      {fragmentLookupFailure?.fragmentNavigation ===
      `${location.key}:${location.hash}` ? (
        <div
          className="border-destructive bg-card flex flex-wrap items-center justify-between gap-3 border-2 p-3 shadow-[var(--shadow-pixel)]"
          role="alert"
        >
          <div>
            <p className="text-destructive font-semibold">
              Recurring definition could not be loaded.
            </p>
            <p className="text-muted-foreground text-sm">
              {fragmentLookupFailure.message}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFragmentLookupFailure(undefined);
              setFragmentLookupRetryVersion((current) => current + 1);
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">
        <RecurringPageContent
          errorMessage={recurringDefinitions.errorMessage}
          filtered={search.trim() !== ""}
          loading={recurringDefinitions.loading}
          onClearFilter={() => {
            setSearchParamsPreservingFragment((current) => {
              const next = new URLSearchParams(current);
              next.delete("q");
              return next;
            });
            setSearchToolbarGeneration((current) => current + 1);
            window.requestAnimationFrame(() => {
              const searchField = document.getElementById("recurring-search");
              const target =
                searchField && searchField.getClientRects().length > 0
                  ? searchField
                  : document.querySelector<HTMLElement>(
                      "[data-mobile-table-controls-trigger]",
                    );
              target?.focus({ preventScroll: true });
            });
          }}
          onEdit={(definition, opener) => {
            clearDefinitionFragment();
            openEditRecurringDefinitionEditor(definition, opener);
          }}
          onNotice={showNotice}
          refresh={recurringDefinitions.refresh}
          snapshot={recurringDefinitions.snapshot}
        />
      </div>
      <Toast
        key={notice?.id ?? "empty"}
        className={
          notice?.tone === "error"
            ? "text-destructive"
            : "text-[var(--color-money-in)]"
        }
        durationMs={toastDurationMs}
        message={notice?.message}
        onDismiss={() => {
          setNotice(undefined);
        }}
      />
    </section>
  );
};
