import { Reload } from "pixelarticons/react";
import { useMemo } from "react";

import type { Member } from "@/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MembersPageSnapshot } from "@/store";

import { refreshMembersPage } from "./use-members-resource";

export const readMembersSearchState = (
  searchParams: URLSearchParams,
): {
  readonly search: string;
} => ({
  search: searchParams.get("q") ?? "",
});

interface MembersPageContentProps {
  readonly membersPage: {
    readonly errorMessage: string | undefined;
    readonly loading: boolean;
    readonly snapshot: MembersPageSnapshot | undefined;
  };
  readonly onEditMember: (member: Member, opener: HTMLElement) => void;
  readonly search: string;
}

const memberSearchMatches = (name: string, search: string): boolean =>
  search.trim() === "" ||
  name.toLowerCase().includes(search.trim().toLowerCase());

const memberListClickableRowClassName =
  "cursor-pointer " +
  "hover:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)] " +
  "focus-within:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)]";

const MembersListSkeleton = () => (
  <div
    className="bg-card border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
    aria-hidden="true"
  >
    <div className="grid grid-cols-1 bg-[var(--table-header)] py-2">
      <div className="px-3">
        <Skeleton className="h-5" />
      </div>
    </div>
    {Array.from({ length: 8 }).map((_, index) => (
      <div
        key={index}
        className={cn(
          "grid grid-cols-1 py-3",
          index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
        )}
      >
        <div className="px-3">
          <Skeleton className="h-5" />
        </div>
      </div>
    ))}
  </div>
);

const MembersList = ({
  errorMessage,
  loading,
  members,
  onEditMember,
  search,
}: {
  readonly errorMessage?: string;
  readonly loading: boolean;
  readonly members: readonly Member[] | undefined;
  readonly onEditMember: (member: Member, opener: HTMLElement) => void;
  readonly search: string;
}) => {
  const rows = useMemo(
    () =>
      members
        ? members.filter((member) => memberSearchMatches(member.name, search))
        : [],
    [members, search],
  );

  if (loading && !members) {
    return <MembersListSkeleton />;
  }

  if (errorMessage) {
    return (
      <div
        className="border-destructive bg-card border-2 p-4 shadow-[var(--shadow-pixel)]"
        role="alert"
      >
        <p className="text-destructive font-semibold">
          Members could not be loaded.
        </p>
        <details className="text-muted-foreground mt-3 text-sm">
          <summary className="text-foreground cursor-pointer">
            API error
          </summary>
          <pre className="mt-2 overflow-auto font-mono text-xs whitespace-pre-wrap">
            {errorMessage}
          </pre>
        </details>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => {
            void refreshMembersPage();
          }}
        >
          <Reload aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  if (!members || rows.length === 0) {
    const hasMembers = (members?.length ?? 0) > 0;
    return (
      <div className="bg-card flex flex-col items-start gap-3 border-2 border-[var(--border-ink)] p-6 shadow-[var(--shadow-pixel)]">
        <div className="space-y-1">
          <p className="font-heading text-base font-semibold uppercase">
            No members
          </p>
          <p className="font-body text-muted-foreground max-w-prose text-sm">
            {hasMembers
              ? "No members match the current search."
              : "The member list will show household members once they exist."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card min-h-0 overflow-hidden border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]">
      <div
        className="reference-table-scroll max-h-full overflow-auto"
        data-testid="reference-table-scroll"
        tabIndex={-1}
      >
        <table className="reference-table w-full table-fixed border-collapse text-sm">
          <thead className="text-foreground sticky top-0 z-10 bg-[var(--table-header)]">
            <tr className="font-heading text-left text-xs font-semibold uppercase">
              <th scope="col" className="w-full px-3 py-2">
                Name
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((member, index) => (
              <tr
                key={member.member_id}
                data-testid="members-list-row"
                className={cn(
                  "group/reference-row align-middle",
                  index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
                  memberListClickableRowClassName,
                )}
                aria-description="Press Enter or Space to edit."
                aria-keyshortcuts="Enter Space"
                aria-label={`Edit member ${member.name}`}
                tabIndex={0}
                onClick={(event) => {
                  onEditMember(member, event.currentTarget);
                }}
                onKeyDown={(event) => {
                  if (event.defaultPrevented) {
                    return;
                  }
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }
                  event.preventDefault();
                  onEditMember(member, event.currentTarget);
                }}
              >
                <td className="min-w-0 px-3 py-2">
                  <span className="font-mono font-semibold break-words">
                    {member.name}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const MembersPageContent = ({
  membersPage,
  onEditMember,
  search,
}: MembersPageContentProps) => {
  const refreshErrorMessage = membersPage.snapshot
    ? membersPage.errorMessage
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {refreshErrorMessage ? (
        <div
          className="border-destructive bg-card flex flex-wrap items-center justify-between gap-3 border-2 p-3 shadow-[var(--shadow-pixel)]"
          role="alert"
        >
          <div>
            <p className="text-destructive font-semibold">
              Members could not be refreshed.
            </p>
            <p className="text-muted-foreground font-body text-sm">
              Showing the last loaded member list.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void refreshMembersPage();
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <MembersList
          errorMessage={
            membersPage.snapshot ? undefined : membersPage.errorMessage
          }
          loading={membersPage.loading}
          members={membersPage.snapshot?.members}
          onEditMember={onEditMember}
          search={search}
        />
      </div>
    </div>
  );
};
