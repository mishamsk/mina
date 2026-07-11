import { useState } from "react";

import { PageHelp } from "@/components/page-help";
import { Toast, toastDurationMs } from "@/components/toast";
import { PageHeader } from "@/features/app-shell";
import {
  RecurringPageContent,
  useRecurringReviewResource,
} from "@/features/recurring";

interface Notice {
  readonly id: number;
  readonly message: string;
}

export const RecurringPage = () => {
  const recurringReview = useRecurringReviewResource();
  const [notice, setNotice] = useState<Notice | undefined>();

  const showNotice = (message: string) => {
    setNotice((current) => ({
      id: (current?.id ?? 0) + 1,
      message,
    }));
  };

  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6"
      aria-labelledby="recurring-title"
    >
      <PageHeader
        title="Recurring"
        titleId="recurring-title"
        eyebrow="Ledger"
        help={
          <PageHelp label="Recurring help">
            Expected recurring occurrences waiting for manual review.
          </PageHelp>
        }
      />
      <div className="min-h-0 flex-1">
        <RecurringPageContent
          errorMessage={recurringReview.errorMessage}
          loading={recurringReview.loading}
          onNotice={showNotice}
          refresh={recurringReview.refresh}
          snapshot={recurringReview.snapshot}
        />
      </div>
      <Toast
        key={notice?.id ?? "empty"}
        className="text-[var(--color-money-in)]"
        durationMs={toastDurationMs}
        message={notice?.message}
        onDismiss={() => {
          setNotice(undefined);
        }}
      />
    </section>
  );
};
