import { useSearchParams } from "react-router";

import { AccountGroupPageContent } from "@/features/accounts";
import { PageHeader } from "@/features/app-shell";

const AccountGroupPageError = ({ message }: { readonly message: string }) => (
  <section className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6">
    <PageHeader title="Account group" eyebrow="Group register" />
    <div
      className="border-destructive bg-card border-2 p-4 shadow-[var(--shadow-pixel)]"
      role="alert"
    >
      <p className="text-destructive font-semibold">{message}</p>
    </div>
  </section>
);

export const AccountGroupPage = () => {
  const [searchParams] = useSearchParams();
  const prefix = searchParams.get("prefix")?.trim() ?? "";

  if (!prefix) {
    return <AccountGroupPageError message="The group prefix is missing." />;
  }

  return <AccountGroupPageContent prefix={prefix} />;
};
