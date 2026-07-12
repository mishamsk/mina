import { EyeOff, Reload } from "pixelarticons/react";
import { type ReactNode, useMemo } from "react";

import { type RowAction, RowActions } from "@/components/row-actions";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FqnPath } from "@/features/ledger";
import { cn } from "@/lib/utils";

export interface ReferenceLeaf {
  readonly fqn: string;
  readonly is_hidden: boolean;
}

export interface ReferenceGroup {
  readonly fqn: string;
  readonly is_hidden: boolean;
}

export interface ReferenceTreeRow<TLeaf extends ReferenceLeaf, TGroup> {
  readonly depth: number;
  readonly fqn: string;
  readonly group?: TGroup;
  readonly kind: "group" | "leaf";
  readonly leaf?: TLeaf;
}

export const compareFqnPath = (left: string, right: string): number => {
  const leftSegments = left.split(":");
  const rightSegments = right.split(":");
  const maxLength = Math.max(leftSegments.length, rightSegments.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftSegment = leftSegments[index];
    const rightSegment = rightSegments[index];
    if (leftSegment === undefined) {
      return -1;
    }
    if (rightSegment === undefined) {
      return 1;
    }
    const comparison = leftSegment.localeCompare(rightSegment);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
};

const fqnSearchMatches = (fqn: string, search: string): boolean =>
  search.trim() === "" ||
  fqn.toLowerCase().includes(search.trim().toLowerCase());

export const referenceTreeRows = <
  TLeaf extends ReferenceLeaf,
  TGroup extends ReferenceGroup,
>(
  leaves: readonly TLeaf[],
  groups: readonly TGroup[],
  {
    includeHidden,
    search,
  }: {
    readonly includeHidden: boolean;
    readonly search: string;
  },
): readonly ReferenceTreeRow<TLeaf, TGroup>[] => {
  const groupByFqn = new Map(groups.map((group) => [group.fqn, group]));
  const visibleLeafByFqn = new Map(
    leaves
      .filter(
        (leaf) =>
          (includeHidden || !leaf.is_hidden) &&
          fqnSearchMatches(leaf.fqn, search),
      )
      .map((leaf) => [leaf.fqn, leaf]),
  );
  const visibleNodeFqns = new Set<string>();

  for (const leaf of visibleLeafByFqn.values()) {
    const segments = leaf.fqn.split(":");
    for (
      let segmentIndex = 1;
      segmentIndex <= segments.length;
      segmentIndex += 1
    ) {
      visibleNodeFqns.add(segments.slice(0, segmentIndex).join(":"));
    }
  }

  return [...visibleNodeFqns].sort(compareFqnPath).map((fqn) => {
    const leaf = visibleLeafByFqn.get(fqn);
    return {
      depth: Math.max(0, fqn.split(":").length - 1),
      fqn,
      group: leaf ? undefined : groupByFqn.get(fqn),
      kind: leaf ? "leaf" : "group",
      leaf,
    };
  });
};

const HiddenRowIndicator = ({ label }: { readonly label: string }) => (
  <Tooltip
    focusable={false}
    label={label}
    className="text-foreground inline-flex shrink-0"
  >
    <span aria-label={label} className="inline-flex">
      <EyeOff aria-hidden="true" className="size-4" />
    </span>
  </Tooltip>
);

const referenceTreeSkeletonGridClass = (hasBadgeColumn: boolean) =>
  hasBadgeColumn
    ? "grid grid-cols-[58%_24%_18%] sm:grid-cols-[62%_20%_18%]"
    : "grid grid-cols-[76%_24%] sm:grid-cols-[82%_18%]";

const referenceTreeSkeletonColumnClasses = (hasBadgeColumn: boolean) =>
  hasBadgeColumn
    ? (["px-3", "px-3", "px-3"] as const)
    : (["px-3", "px-3"] as const);

const referenceTreeClickableRowClassName =
  "cursor-pointer " +
  "hover:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)] " +
  "focus-within:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)]";

const ReferenceTreeSkeleton = ({
  hasBadgeColumn,
}: {
  readonly hasBadgeColumn: boolean;
}) => (
  <div
    className="bg-card border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
    aria-hidden="true"
  >
    <div
      className={cn(
        referenceTreeSkeletonGridClass(hasBadgeColumn),
        "bg-[var(--table-header)] py-2",
      )}
    >
      {referenceTreeSkeletonColumnClasses(hasBadgeColumn).map(
        (className, index) => (
          <div key={index} className={className}>
            <Skeleton className="h-5" />
          </div>
        ),
      )}
    </div>
    {Array.from({ length: 8 }).map((_, index) => (
      <div
        key={index}
        className={cn(
          referenceTreeSkeletonGridClass(hasBadgeColumn),
          "py-3",
          index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
        )}
      >
        {referenceTreeSkeletonColumnClasses(hasBadgeColumn).map(
          (className, columnIndex) => (
            <div key={columnIndex} className={className}>
              <Skeleton className="h-5" />
            </div>
          ),
        )}
      </div>
    ))}
  </div>
);

const badgeColumnWidthClass = "w-[24%] px-3 py-2 sm:w-[20%]";
const nameColumnWidthClass = (hasBadgeColumn: boolean) =>
  hasBadgeColumn
    ? "w-[58%] px-3 py-2 sm:w-[62%]"
    : "w-[76%] px-3 py-2 sm:w-[82%]";

const actionsColumnWidthClass = (hasBadgeColumn: boolean) =>
  hasBadgeColumn
    ? "w-[18%] px-3 py-2 text-center"
    : "w-[24%] px-3 py-2 text-center sm:w-[18%]";

interface ReferenceTreeProps<TLeaf extends ReferenceLeaf, TGroup> {
  readonly badgeHeader?: string;
  readonly emptyAction?: ReactNode;
  readonly emptyDescription: string;
  readonly emptyFilteredDescription: string;
  readonly emptyTitle: string;
  readonly errorMessage?: string;
  readonly groups: readonly TGroup[] | undefined;
  readonly includeHidden: boolean;
  readonly leaves: readonly TLeaf[] | undefined;
  readonly loading: boolean;
  readonly loadErrorTitle: string;
  readonly onRetry?: () => void;
  readonly onRowClick?: (
    row: ReferenceTreeRow<TLeaf, TGroup>,
    opener: HTMLElement,
  ) => void;
  readonly rowActivationLabel?: (
    row: ReferenceTreeRow<TLeaf, TGroup>,
  ) => string;
  readonly renderActions?: (
    row: ReferenceTreeRow<TLeaf, TGroup>,
  ) => readonly RowAction[];
  readonly renderBadge?: (row: ReferenceTreeRow<TLeaf, TGroup>) => ReactNode;
  readonly rowTestId?: string;
  readonly search: string;
}

const interactiveTargetSelector =
  "a, button, input, select, textarea, summary, [role='button'], " +
  "[contenteditable='true'], " +
  "[tabindex]:not([tabindex='-1']):not([data-slot='tooltip-trigger'])";

const isInteractiveTarget = (
  target: EventTarget | null,
  currentTarget: HTMLElement,
): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const interactiveTarget = target.closest(interactiveTargetSelector);
  return interactiveTarget !== null && interactiveTarget !== currentTarget;
};

export const ReferenceTree = <
  TLeaf extends ReferenceLeaf,
  TGroup extends ReferenceGroup,
>({
  badgeHeader,
  emptyAction,
  emptyDescription,
  emptyFilteredDescription,
  emptyTitle,
  errorMessage,
  groups,
  includeHidden,
  leaves,
  loading,
  loadErrorTitle,
  onRetry,
  onRowClick,
  rowActivationLabel,
  renderActions,
  renderBadge,
  rowTestId = "reference-tree-row",
  search,
}: ReferenceTreeProps<TLeaf, TGroup>) => {
  const hasBadgeColumn = Boolean(badgeHeader);
  const rows = useMemo(
    () =>
      leaves
        ? referenceTreeRows(leaves, groups ?? [], { includeHidden, search })
        : [],
    [groups, includeHidden, leaves, search],
  );

  if (loading && !leaves) {
    return <ReferenceTreeSkeleton hasBadgeColumn={hasBadgeColumn} />;
  }

  if (errorMessage) {
    return (
      <div
        className="border-destructive bg-card border-2 p-4 shadow-[var(--shadow-pixel)]"
        role="alert"
      >
        <p className="text-destructive font-semibold">{loadErrorTitle}</p>
        <details className="text-muted-foreground mt-3 text-sm">
          <summary className="text-foreground cursor-pointer">
            API error
          </summary>
          <pre className="mt-2 overflow-auto font-mono text-xs whitespace-pre-wrap">
            {errorMessage}
          </pre>
        </details>
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={onRetry}
          >
            <Reload aria-hidden="true" />
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  if (!leaves || rows.length === 0) {
    const hasLeaves = (leaves?.length ?? 0) > 0;
    return (
      <div className="bg-card flex flex-col items-start gap-3 border-2 border-[var(--border-ink)] p-6 shadow-[var(--shadow-pixel)]">
        <div className="space-y-1">
          <p className="font-heading text-base font-semibold uppercase">
            {emptyTitle}
          </p>
          <p className="font-body text-muted-foreground max-w-prose text-sm">
            {hasLeaves ? emptyFilteredDescription : emptyDescription}
          </p>
        </div>
        {emptyAction}
      </div>
    );
  }

  return (
    <div
      className="bg-card flex h-full min-h-0 flex-col overflow-hidden border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
      data-testid="reference-table-frame"
    >
      <div
        className="reference-table-scroll min-h-0 flex-1 overflow-auto"
        data-testid="reference-table-scroll"
        tabIndex={-1}
      >
        <table className="reference-table w-full table-fixed border-collapse text-sm">
          <thead className="text-foreground sticky top-0 z-10 bg-[var(--table-header)]">
            <tr className="font-heading text-left text-xs font-semibold uppercase">
              <th scope="col" className={nameColumnWidthClass(hasBadgeColumn)}>
                Name
              </th>
              {hasBadgeColumn ? (
                <th scope="col" className={badgeColumnWidthClass}>
                  {badgeHeader}
                </th>
              ) : null}
              <th
                scope="col"
                className={actionsColumnWidthClass(hasBadgeColumn)}
              />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowHidden =
                row.leaf?.is_hidden ?? row.group?.is_hidden ?? false;
              const actions = renderActions?.(row) ?? [];
              const clickable = Boolean(onRowClick && row.kind === "leaf");
              return (
                <tr
                  key={row.fqn}
                  data-testid={rowTestId}
                  className={cn(
                    "group/reference-row align-middle",
                    index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
                    clickable && referenceTreeClickableRowClassName,
                  )}
                  aria-description={
                    clickable ? "Press Enter or Space to edit." : undefined
                  }
                  aria-keyshortcuts={clickable ? "Enter Space" : undefined}
                  aria-label={
                    clickable
                      ? (rowActivationLabel?.(row) ?? `Open ${row.fqn}`)
                      : undefined
                  }
                  tabIndex={clickable ? 0 : undefined}
                  onClick={(event) => {
                    if (
                      !onRowClick ||
                      isInteractiveTarget(event.target, event.currentTarget)
                    ) {
                      return;
                    }
                    onRowClick(row, event.currentTarget);
                  }}
                  onKeyDown={(event) => {
                    if (!onRowClick || event.defaultPrevented) {
                      return;
                    }
                    if (event.key !== "Enter" && event.key !== " ") {
                      return;
                    }
                    if (
                      isInteractiveTarget(event.target, event.currentTarget)
                    ) {
                      return;
                    }
                    event.preventDefault();
                    onRowClick(row, event.currentTarget);
                  }}
                >
                  <td className="min-w-0 px-3 py-2">
                    <div
                      className="flex min-w-0 items-center gap-2"
                      style={{
                        paddingLeft: `${Math.min(row.depth, 7) * 1.25}rem`,
                      }}
                    >
                      <FqnPath
                        value={row.fqn}
                        focusable={false}
                        leafClassName={
                          row.kind === "leaf" ? "font-semibold" : undefined
                        }
                      />
                      {rowHidden ? (
                        <HiddenRowIndicator
                          label={
                            row.kind === "leaf" ? "Hidden item" : "Hidden group"
                          }
                        />
                      ) : null}
                    </div>
                  </td>
                  {hasBadgeColumn ? (
                    <td className="min-w-0 px-3 py-2">{renderBadge?.(row)}</td>
                  ) : null}
                  <td className="px-3 py-2 text-center">
                    <RowActions
                      actions={actions}
                      foldable
                      className="justify-center"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
