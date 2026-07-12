import { Plus } from "pixelarticons/react";
import { useNavigate, useParams } from "react-router";

import { PageHelp } from "@/components/page-help";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell";
import { refreshMembersPage, useMembersResource } from "@/features/members";
import {
  ReferenceDrilldownError,
  ReferenceDrilldownNotFound,
  ReferenceDrilldownPage,
  ReferenceDrilldownSkeleton,
  referenceTransactionHref,
} from "@/features/reference";

const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const MemberPage = () => {
  const navigate = useNavigate();
  const { memberId: memberIdParam } = useParams();
  const membersPage = useMembersResource(true);
  const memberId = parsePositiveInteger(memberIdParam);
  const member = membersPage.snapshot?.members.find(
    (candidate) => candidate.member_id === memberId,
  );
  const filterIds = member ? [member.member_id] : [];
  const viewAllHref = referenceTransactionHref("member", filterIds);

  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6"
      aria-labelledby="member-title"
    >
      <PageHeader
        title={member?.name ?? "Member"}
        titleId="member-title"
        titleClassName="normal-case"
        eyebrow="Reference drill-down"
        help={
          <PageHelp label="Member help">
            Member pages show transactions attributed to that household member.
          </PageHelp>
        }
        actions={
          <Button
            type="button"
            onClick={() => {
              void navigate("/transactions");
            }}
          >
            <Plus aria-hidden="true" />
            New transaction
          </Button>
        }
      />

      {membersPage.loading && !membersPage.snapshot ? (
        <ReferenceDrilldownSkeleton />
      ) : null}
      {membersPage.errorMessage && !membersPage.snapshot ? (
        <ReferenceDrilldownError
          message={membersPage.errorMessage}
          title="Member could not be loaded."
          onRetry={() => {
            void refreshMembersPage(true);
          }}
        />
      ) : null}
      {membersPage.snapshot && !member ? (
        <ReferenceDrilldownNotFound
          backHref="/members"
          backLabel="Back to members"
          entityKindLabel="Member"
        />
      ) : null}
      {member ? (
        <ReferenceDrilldownPage
          actionLabel="View all transactions"
          entityKindLabel="Member"
          filterIds={filterIds}
          filterKind="member"
          title={member.name}
          viewAllHref={viewAllHref}
        />
      ) : null}
    </section>
  );
};
