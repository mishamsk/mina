import { ArrowRight } from "pixelarticons/react";
import { Link } from "react-router";

import { PageHelp } from "@/components/page-help";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell";
import { OverviewDashboard } from "@/features/overview";

export const OverviewPage = () => (
  <section className="flex flex-col gap-6" aria-labelledby="overview-title">
    <PageHeader
      title="Overview"
      titleId="overview-title"
      titleTabIndex={-1}
      eyebrow="Household pulse"
      help={
        <PageHelp label="Overview help">
          Current balance-account standing and the newest ledger activity.
        </PageHelp>
      }
      actions={
        <Button asChild variant="outline">
          <Link to="/transactions">
            <ArrowRight aria-hidden="true" />
            View all
          </Link>
        </Button>
      }
    />

    <OverviewDashboard />
  </section>
);
