import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { apiErrorMessage, getMember, type Member } from "@/api";
import { PageHelp } from "@/components/page-help";
import { PageHeader } from "@/features/app-shell";
import {
  ReferenceDrilldownError,
  ReferenceDrilldownNotFound,
  ReferenceDrilldownPage,
  ReferenceDrilldownSkeleton,
} from "@/features/reference";

const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

interface MemberLoadState {
  readonly errorMessage?: string;
  readonly member?: Member;
  readonly notFound?: boolean;
  readonly requestKey: string;
}

export const MemberPage = () => {
  const { memberId: memberIdParam } = useParams();
  const memberId = parsePositiveInteger(memberIdParam);
  const [retryToken, setRetryToken] = useState(0);
  const [routeIdentity, setRouteIdentity] = useState(() => ({
    generation: 0,
    memberId,
  }));
  if (routeIdentity.memberId !== memberId) {
    setRouteIdentity({
      generation: routeIdentity.generation + 1,
      memberId,
    });
  }
  const requestKey = `${memberId ?? "invalid"}:${routeIdentity.generation}`;
  const [loadState, setLoadState] = useState<MemberLoadState>({
    requestKey: "",
  });

  useEffect(() => {
    if (!memberId) return;
    const controller = new AbortController();
    void getMember({
      path: { member_id: memberId },
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.data) {
        setLoadState({ member: result.data, requestKey });
      } else if (result.response?.status === 404) {
        setLoadState({ notFound: true, requestKey });
      } else {
        setLoadState({
          errorMessage: apiErrorMessage(result.error),
          requestKey,
        });
      }
    });
    return () => {
      controller.abort();
    };
  }, [memberId, requestKey, retryToken]);

  const current = loadState.requestKey === requestKey ? loadState : undefined;
  const member = current?.member;
  return (
    <section
      className="roomy-shell:h-[calc(100svh-2.5rem)] flex min-h-0 flex-col gap-6"
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
      />

      {memberId && !current ? <ReferenceDrilldownSkeleton /> : null}
      {current?.errorMessage ? (
        <ReferenceDrilldownError
          message={current.errorMessage}
          title="Member could not be loaded."
          onRetry={() => {
            setRetryToken((value) => value + 1);
          }}
        />
      ) : null}
      {!memberId || current?.notFound ? (
        <ReferenceDrilldownNotFound
          backHref="/members"
          backLabel="Back to members"
          entityKindLabel="Member"
        />
      ) : null}
      {member ? <ReferenceDrilldownPage memberName={member.name} /> : null}
    </section>
  );
};
