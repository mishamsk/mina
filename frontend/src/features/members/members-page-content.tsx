import { MagicEdit, Reload, Trash } from "pixelarticons/react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { deleteLedgerMemberById, type Member } from "@/api";
import { type RowAction, RowActions } from "@/components/row-actions";
import { focusWithoutTooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MembersPageSnapshot } from "@/store";

import { memberAPIErrorMessage } from "./member-api-error-message";
import {
  refreshMembersAfterMutation,
  refreshMembersPage,
} from "./use-members-resource";

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
  readonly onMemberDeleted: (memberId: number) => void;
  readonly onNotice: (message: string) => void;
  readonly search: string;
}

type MemberDeleteTarget = {
  readonly member: Member;
  readonly opener: HTMLElement;
};

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
    <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] bg-[var(--table-header)] py-2">
      <div className="px-3">
        <Skeleton className="h-5" />
      </div>
      <div className="px-1" />
    </div>
    {Array.from({ length: 8 }).map((_, index) => (
      <div
        key={index}
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_5.5rem] py-3",
          index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
        )}
      >
        <div className="px-3">
          <Skeleton className="h-5" />
        </div>
        <div className="px-1" />
      </div>
    ))}
  </div>
);

const MembersList = ({
  errorMessage,
  loading,
  members,
  onEditMember,
  onMemberDeleted,
  onNotice,
  search,
}: {
  readonly errorMessage?: string;
  readonly loading: boolean;
  readonly members: readonly Member[] | undefined;
  readonly onEditMember: (member: Member, opener: HTMLElement) => void;
  readonly onMemberDeleted: (memberId: number) => void;
  readonly onNotice: (message: string) => void;
  readonly search: string;
}) => {
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<
    MemberDeleteTarget | undefined
  >();
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<
    string | undefined
  >();
  const [deleting, setDeleting] = useState(false);
  const rows = useMemo(
    () =>
      members
        ? members.filter((member) => memberSearchMatches(member.name, search))
        : [],
    [members, search],
  );

  const closeDeleteDialog = useCallback(() => {
    if (deleting) {
      return;
    }
    const opener = deleteTarget?.opener;
    setDeleteTarget(undefined);
    setDeleteErrorMessage(undefined);
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) {
        focusWithoutTooltip(opener, { preventScroll: true });
      }
    });
  }, [deleteTarget?.opener, deleting]);

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) {
      return;
    }
    setDeleting(true);
    setDeleteErrorMessage(undefined);
    const result = await deleteLedgerMemberById(deleteTarget.member.member_id);
    if (result.data !== undefined || !result.error) {
      await refreshMembersAfterMutation();
      onMemberDeleted(deleteTarget.member.member_id);
      onNotice("Member deleted.");
      setDeleting(false);
      setDeleteTarget(undefined);
      window.requestAnimationFrame(() => {
        const searchField = document.getElementById("members-search");
        if (searchField instanceof HTMLElement && searchField.isConnected) {
          focusWithoutTooltip(searchField, { preventScroll: true });
        }
      });
      return;
    }
    setDeleting(false);
    setDeleteErrorMessage(
      memberAPIErrorMessage(result.error, "Member could not be deleted."),
    );
  };

  if (loading && !members) {
    return (
      <div className="w-full max-w-[48rem]">
        <MembersListSkeleton />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="w-full max-w-[48rem]">
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
      </div>
    );
  }

  if (!members || rows.length === 0) {
    const hasMembers = (members?.length ?? 0) > 0;
    return (
      <div className="bg-card flex w-full max-w-[48rem] flex-col items-start gap-3 border-2 border-[var(--border-ink)] p-6 shadow-[var(--shadow-pixel)]">
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
    <div
      className="bg-card flex h-full min-h-0 w-full max-w-[48rem] flex-col overflow-hidden border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
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
              <th scope="col" className="px-3 py-2">
                Name
              </th>
              <th scope="col" className="w-[5.5rem] px-3 py-2 text-center" />
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
                aria-description="Press Enter or Space to open."
                aria-keyshortcuts="Enter Space"
                aria-label={`Open member ${member.name}`}
                tabIndex={0}
                onClick={() => {
                  void navigate(`/members/${member.member_id}`);
                }}
                onKeyDown={(event) => {
                  if (
                    event.defaultPrevented ||
                    event.target !== event.currentTarget
                  ) {
                    return;
                  }
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }
                  event.preventDefault();
                  void navigate(`/members/${member.member_id}`);
                }}
              >
                <td className="min-w-0 px-3 py-2">
                  <span className="font-mono font-semibold break-words">
                    {member.name}
                  </span>
                </td>
                <td className="w-[5.5rem] px-3 py-2 align-middle">
                  <RowActions
                    foldable
                    actions={
                      [
                        {
                          icon: <MagicEdit aria-hidden="true" />,
                          label: "Edit member",
                          onSelect: (opener) => {
                            onEditMember(member, opener);
                          },
                        },
                        {
                          disabled: member.deletable !== true,
                          disabledReason: "Member has attributed records.",
                          icon: <Trash aria-hidden="true" />,
                          label: "Delete member",
                          onSelect: (opener) => {
                            setDeleteErrorMessage(undefined);
                            setDeleteTarget({ member, opener });
                          },
                        },
                      ] satisfies readonly RowAction[]
                    }
                    className="justify-center"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmationDialog
        confirmIcon={<Trash aria-hidden="true" />}
        confirmLabel="Delete member"
        errorMessage={deleteErrorMessage}
        open={deleteTarget !== undefined}
        pending={deleting}
        pendingLabel="Deleting"
        title="Delete member"
        onConfirm={() => {
          void confirmDelete();
        }}
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteDialog();
          }
        }}
      >
        {deleteTarget ? (
          <ReferenceEntityDeleteDescription
            name={deleteTarget.member.name}
            noun="member"
          />
        ) : null}
      </ConfirmationDialog>
    </div>
  );
};

export const MembersPageContent = ({
  membersPage,
  onEditMember,
  onMemberDeleted,
  onNotice,
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
          onMemberDeleted={onMemberDeleted}
          onNotice={onNotice}
          search={search}
        />
      </div>
    </div>
  );
};
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ReferenceEntityDeleteDescription } from "@/components/reference-entity-delete-description";
