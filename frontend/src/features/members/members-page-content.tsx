import { MagicEdit, Reload, Trash } from "pixelarticons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

const deleteDialogFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

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
  const [deleteTarget, setDeleteTarget] = useState<
    MemberDeleteTarget | undefined
  >();
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<
    string | undefined
  >();
  const [deleting, setDeleting] = useState(false);
  const deleteDialogRef = useRef<HTMLElement | null>(null);
  const cancelDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
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

  useEffect(() => {
    if (!deleteTarget) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "Escape") {
        if (deleting) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        closeDeleteDialog();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const trapRoot = deleteDialogRef.current;
      if (!trapRoot) {
        return;
      }
      const focusable = Array.from(
        trapRoot.querySelectorAll<HTMLElement>(deleteDialogFocusableSelector),
      ).filter((element) => !element.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        trapRoot.focus();
        return;
      }
      if (!trapRoot.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, { capture: true });
    window.requestAnimationFrame(() => {
      cancelDeleteButtonRef.current?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [closeDeleteDialog, deleteTarget, deleting]);

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
              <th scope="col" className="px-3 py-2">
                Name
              </th>
              <th scope="col" className="w-[5.5rem] px-1 py-2 text-center">
                Actions
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
                  onEditMember(member, event.currentTarget);
                }}
              >
                <td className="min-w-0 px-3 py-2">
                  <span className="font-mono font-semibold break-words">
                    {member.name}
                  </span>
                </td>
                <td className="w-[5.5rem] px-1 py-2 align-middle">
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
      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-[color-mix(in_srgb,var(--frame),transparent_18%)] p-4"
          role="presentation"
        >
          <section
            ref={deleteDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-member-row-title"
            aria-describedby="delete-member-row-description"
            className="bg-card w-[min(480px,100%)] border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)]"
            tabIndex={-1}
          >
            <h3
              id="delete-member-row-title"
              className="font-heading text-base font-bold uppercase"
            >
              Delete member
            </h3>
            <div
              id="delete-member-row-description"
              className="font-body text-muted-foreground mt-3 space-y-2 text-sm"
            >
              <p className="flex flex-wrap items-center gap-1">
                <span>Delete</span>
                <span className="text-foreground font-mono break-all">
                  {deleteTarget.member.name}
                </span>
                <span>?</span>
              </p>
              <p>
                This tombstones the member and removes it from default member
                lists and pickers.
              </p>
            </div>
            {deleteErrorMessage ? (
              <p
                className="border-destructive text-destructive mt-3 border-2 p-2 text-sm"
                role="alert"
              >
                {deleteErrorMessage}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                ref={cancelDeleteButtonRef}
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={closeDeleteDialog}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => {
                  void confirmDelete();
                }}
              >
                <Trash aria-hidden="true" />
                {deleting ? "Deleting" : "Delete member"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
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
