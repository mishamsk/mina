import { EyeOff } from "pixelarticons/react";

import type { AccountBalance, CreditLimitHistory, DisplayAmount } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { Badge } from "@/components/ui/badge";
import { AmountText, FqnPath } from "@/features/ledger";
import { formatLocalCivilDate } from "@/utils/date";

import { AccountTypeBadge } from "./account-type-badge";
import { CreditLimitIndicator } from "./credit-limit-indicator";

interface AccountHeaderProps {
  readonly account: {
    readonly account_type: "balance" | "flow" | "system";
    readonly currency?: string | null;
    readonly external_id?: string | null;
    readonly external_system?: string | null;
    readonly fqn: string;
    readonly is_hidden: boolean;
  };
  readonly balances: readonly AccountBalance[];
  readonly creditLimitHistory: readonly CreditLimitHistory[];
}

const BalanceAmount = ({
  amount,
  currency,
}: {
  readonly amount: string;
  readonly currency: string;
}) => {
  const displayAmount: DisplayAmount = { amount, currency };
  return (
    <AmountText amount={displayAmount} positiveSign={false} tone="neutral" />
  );
};

const MetadataValue = ({ value }: { readonly value: string }) => (
  <dd className="text-foreground min-w-0">
    <Tooltip label={value} className="block min-w-0">
      <span className="block truncate">{value}</span>
    </Tooltip>
  </dd>
);

export const AccountHeader = ({
  account,
  balances,
  creditLimitHistory,
}: AccountHeaderProps) => {
  const latestCreditLimit = creditLimitHistory[0];

  return (
    <div
      className="bg-card border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)]"
      data-testid="account-header"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <FqnPath
              value={account.fqn}
              className="text-lg font-semibold sm:text-xl"
            />
            {creditLimitHistory.length > 0 ? <CreditLimitIndicator /> : null}
            <AccountTypeBadge accountType={account.account_type} />
            {account.currency ? (
              <Badge variant="outline" className="bg-[var(--band)]">
                {account.currency}
              </Badge>
            ) : null}
            {account.is_hidden ? (
              <span
                aria-label="Hidden account"
                className="inline-flex items-center gap-1 border border-[var(--border-ink)] bg-[var(--band)] px-2 py-1 font-mono text-xs font-semibold shadow-[var(--shadow-chip)]"
              >
                <EyeOff aria-hidden="true" className="size-4" />
                Hidden
              </span>
            ) : null}
          </div>

          {account.external_system || account.external_id ? (
            <dl className="grid min-w-0 gap-2 font-mono text-xs sm:grid-cols-2">
              {account.external_system ? (
                <div className="min-w-0">
                  <dt className="text-muted-foreground uppercase">
                    External system
                  </dt>
                  <MetadataValue value={account.external_system} />
                </div>
              ) : null}
              {account.external_id ? (
                <div className="min-w-0">
                  <dt className="text-muted-foreground uppercase">
                    External id
                  </dt>
                  <MetadataValue value={account.external_id} />
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row lg:ml-auto lg:justify-end">
          <div className="border-2 border-[var(--border-ink)] bg-[var(--band)] p-3 sm:min-w-56">
            <p className="font-heading text-xs font-semibold uppercase">
              Balances
            </p>
            {balances.length > 0 ? (
              <dl className="mt-3 space-y-3">
                {balances.map((balance) => (
                  <div
                    key={`${balance.currency}:${balance.current_balance}:${balance.posted_balance}`}
                    className="grid grid-cols-[1fr_auto] gap-3 font-mono text-sm"
                  >
                    <dt className="text-muted-foreground">Current</dt>
                    <dd className="text-right">
                      <BalanceAmount
                        amount={balance.current_balance}
                        currency={balance.currency}
                      />
                    </dd>
                    <dt className="text-muted-foreground">Posted</dt>
                    <dd className="text-right">
                      <BalanceAmount
                        amount={balance.posted_balance}
                        currency={balance.currency}
                      />
                    </dd>
                    {balance.credit_limit ? (
                      <>
                        <dt className="text-muted-foreground">Credit limit</dt>
                        <dd className="text-right">
                          <BalanceAmount
                            amount={balance.credit_limit}
                            currency={balance.currency}
                          />
                        </dd>
                      </>
                    ) : null}
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-muted-foreground mt-3 font-mono text-sm">
                No balance rows
              </p>
            )}
          </div>

          {latestCreditLimit ? (
            <div className="border-2 border-[var(--border-ink)] bg-[var(--band)] p-3">
              <p className="font-heading text-xs font-semibold uppercase">
                Credit history
              </p>
              <ul className="mt-3 space-y-2 font-mono text-sm">
                {creditLimitHistory.slice(0, 3).map((entry) => (
                  <li
                    key={entry.credit_limit_history_id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-muted-foreground">
                      {formatLocalCivilDate(entry.effective_date)}
                    </span>
                    <BalanceAmount
                      amount={entry.credit_limit}
                      currency={account.currency ?? "USD"}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
