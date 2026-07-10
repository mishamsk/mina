import { Plus } from "pixelarticons/react";
import { useRef, useState } from "react";
import { useSearchParams } from "react-router";

import type { Member } from "@/api";
import { PageHelp } from "@/components/page-help";
import { Toast, toastDurationMs } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell";
import {
  MembersPageContent,
  MembersSidePanel,
  readMembersSearchState,
  useMembersResource,
} from "@/features/members";
import { ReferenceToolbar } from "@/features/reference";

interface Notice {
  readonly id: number;
  readonly message: string;
}

export const MembersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const membersPage = useMembersResource();
  const [panelMode, setPanelMode] = useState<"create" | "edit" | undefined>();
  const [selectedMemberId, setSelectedMemberId] = useState<
    number | undefined
  >();
  const [notice, setNotice] = useState<Notice | undefined>();
  const createMemberButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelOpenerRef = useRef<HTMLElement | null>(null);
  const { search } = readMembersSearchState(searchParams);
  const selectedMember = membersPage.snapshot?.members.find(
    (member) => member.member_id === selectedMemberId,
  );

  const showNotice = (message: string) => {
    setNotice((current) => ({
      id: (current?.id ?? 0) + 1,
      message,
    }));
  };

  const restorePanelOpenerFocus = () => {
    const opener = panelOpenerRef.current;
    panelOpenerRef.current = null;
    const target = opener?.isConnected ? opener : createMemberButtonRef.current;
    if (target) {
      window.requestAnimationFrame(() => {
        target.focus({ preventScroll: true });
      });
    }
  };

  const openCreatePanel = (opener: HTMLElement) => {
    panelOpenerRef.current = opener;
    setSelectedMemberId(undefined);
    setPanelMode("create");
  };

  const openEditPanel = (member: Member, opener: HTMLElement) => {
    panelOpenerRef.current = opener;
    setSelectedMemberId(member.member_id);
    setPanelMode("edit");
  };

  const closePanel = () => {
    setPanelMode(undefined);
    setSelectedMemberId(undefined);
    restorePanelOpenerFocus();
  };

  const closeDeletedMemberEditor = (memberId: number) => {
    if (panelMode === "edit" && selectedMemberId === memberId) {
      closePanel();
    }
  };

  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6"
      aria-labelledby="members-title"
    >
      <PageHeader
        title="Members"
        titleId="members-title"
        eyebrow="Reference data"
        help={
          <PageHelp label="Members help">
            Members attribute journal records to a person or leave them as
            whole-household activity.
          </PageHelp>
        }
        actions={
          <Button
            ref={createMemberButtonRef}
            type="button"
            onClick={(event) => {
              openCreatePanel(event.currentTarget);
            }}
          >
            <Plus aria-hidden="true" />
            New member
          </Button>
        }
        toolbar={
          <ReferenceToolbar
            includeHidden={false}
            search={search}
            searchInputId="members-search"
            searchPlaceholder="Member name"
            setSearchParams={setSearchParams}
            showIncludeHiddenToggle={false}
          />
        }
      />

      <div className="min-h-0 flex-1">
        <MembersPageContent
          membersPage={membersPage}
          onEditMember={openEditPanel}
          onMemberDeleted={closeDeletedMemberEditor}
          onNotice={showNotice}
          search={search}
        />
      </div>
      <Toast
        key={notice?.id ?? "empty"}
        className="text-[var(--color-money-in)]"
        containerClassName="z-[70]"
        durationMs={toastDurationMs}
        message={notice?.message}
        onDismiss={() => {
          setNotice(undefined);
        }}
      />
      <MembersSidePanel
        member={selectedMember}
        mode={panelMode ?? "create"}
        onClose={closePanel}
        onNotice={showNotice}
        open={Boolean(panelMode)}
      />
    </section>
  );
};
