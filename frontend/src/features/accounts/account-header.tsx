import { EyeOff } from "pixelarticons/react";

import type {
  Account,
  AccountBalance,
  CreditLimitHistory,
  DisplayAmount,
} from "@/api";
import { FavoriteStarIcon } from "@/components/favorite-star-icon";
import { Tooltip } from "@/components/tooltip";
import { Badge } from "@/components/ui/badge";
import { AccountDisplayLabel, AmountText } from "@/features/ledger";
import { cn } from "@/lib/utils";
import { formatLocalCivilDate } from "@/utils/date";

import { AccountTypeBadge } from "./account-type-badge";
import { CreditLimitIndicator } from "./credit-limit-indicator";

interface AccountHeaderProps {
  readonly account: Account;
  readonly balances: readonly AccountBalance[];
  readonly creditLimitHistory: readonly CreditLimitHistory[];
  readonly featuredTogglePending: boolean;
  readonly onToggleFeatured: () => void;
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
    <AmountText
      amount={displayAmount}
      className="min-w-0 justify-end"
      overflowTooltip
      positiveSign={false}
      tone="neutral"
      truncate
    />
  );
};

const BalanceLabel = ({
  emphasized = false,
  label,
}: {
  readonly emphasized?: boolean;
  readonly label: string;
}) => (
  <dt
    className={cn(
      "text-muted-foreground min-w-0",
      emphasized && "font-semibold",
    )}
  >
    <Tooltip label={label} className="block min-w-0">
      <span className="block truncate">{label}</span>
    </Tooltip>
  </dt>
);

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
  featuredTogglePending,
  onToggleFeatured,
}: AccountHeaderProps) => {
  const accountCurrency = account.currency;
  const accountCreditLimitHistory =
    accountCurrency == null ? [] : creditLimitHistory;
  const latestCreditLimit = accountCreditLimitHistory[0];

  return (
    <div
      className="bg-card border-2 border-[var(--border-ink)] p-2 shadow-[var(--shadow-pixel)] sm:p-4"
      data-testid="account-header"
    >
      <div className="flex flex-col gap-2 sm:gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <AccountDisplayLabel
              account={account}
              className="text-lg font-semibold sm:text-xl"
            />
            {accountCreditLimitHistory.length > 0 ? (
              <CreditLimitIndicator />
            ) : null}
            <AccountTypeBadge accountType={account.account_type} />
            <Badge variant="outline" className="bg-[var(--band)]">
              {account.currency ?? "Multi-currency"}
            </Badge>
            {account.account_type === "system" ? (
              <Badge variant="outline" className="bg-[var(--band)]">
                Read-only system account
              </Badge>
            ) : (
              <button
                type="button"
                className="focus-visible:outline-ring hover:bg-muted aria-disabled:bg-muted aria-disabled:text-muted-foreground aria-disabled:[&_svg]:!text-muted-foreground inline-flex h-9 items-center gap-2 overflow-visible border-0 bg-transparent px-1 py-0 font-mono text-xs font-semibold shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:cursor-not-allowed"
                aria-disabled={featuredTogglePending ? "true" : undefined}
                aria-pressed={account.is_featured}
                onClick={onToggleFeatured}
              >
                <span
                  aria-hidden="true"
                  className="inline-grid size-[24px] shrink-0 place-items-center overflow-visible"
                  data-favorite-star-icon-box=""
                  data-icon="inline-start"
                >
                  <FavoriteStarIcon filled={account.is_featured} />
                </span>
                {account.is_featured ? "Unfeature account" : "Feature account"}
              </button>
            )}
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

        <div className="account-header-standing flex flex-col gap-2 sm:flex-row sm:gap-3 lg:ml-auto lg:justify-end">
          <div className="border-2 border-[var(--border-ink)] bg-[var(--band)] p-1 sm:min-w-56 sm:p-3">
            <p className="font-heading text-xs font-semibold uppercase">
              Balances
            </p>
            {balances.length > 0 ? (
              <dl className="mt-1 space-y-1 sm:mt-3 sm:space-y-3">
                {balances.map((balance) => (
                  <div
                    key={`${balance.currency}:${balance.current_balance}:${balance.posted_balance}`}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,max-content)] gap-1 font-mono text-xs sm:gap-3 sm:text-sm"
                  >
                    {balance.remaining_credit !== undefined ? (
                      <>
                        <BalanceLabel emphasized label="Remaining credit" />
                        <dd className="min-w-0 overflow-hidden text-right font-semibold">
                          <BalanceAmount
                            amount={balance.remaining_credit}
                            currency={balance.currency}
                          />
                        </dd>
                      </>
                    ) : null}
                    <BalanceLabel
                      label={
                        balance.remaining_credit !== undefined
                          ? "Full balance"
                          : "Current"
                      }
                    />
                    <dd className="min-w-0 overflow-hidden text-right">
                      <BalanceAmount
                        amount={balance.current_balance}
                        currency={balance.currency}
                      />
                    </dd>
                    <BalanceLabel
                      label={
                        balance.remaining_credit !== undefined
                          ? "Posted balance"
                          : "Posted"
                      }
                    />
                    <dd className="min-w-0 overflow-hidden text-right">
                      <BalanceAmount
                        amount={balance.posted_balance}
                        currency={balance.currency}
                      />
                    </dd>
                    {balance.credit_limit ? (
                      <>
                        <BalanceLabel label="Credit limit" />
                        <dd className="min-w-0 overflow-hidden text-right">
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

          {latestCreditLimit && accountCurrency ? (
            <div className="border-2 border-[var(--border-ink)] bg-[var(--band)] p-1 sm:p-3">
              <p className="font-heading text-xs font-semibold uppercase">
                Credit history
              </p>
              <ul className="mt-1 space-y-1 font-mono text-xs sm:mt-3 sm:space-y-2 sm:text-sm">
                {accountCreditLimitHistory.slice(0, 3).map((entry) => (
                  <li
                    key={entry.credit_limit_history_id}
                    className="flex items-center justify-between gap-1 sm:gap-3"
                  >
                    <span className="text-muted-foreground">
                      {formatLocalCivilDate(entry.effective_date)}
                    </span>
                    <BalanceAmount
                      amount={entry.credit_limit}
                      currency={accountCurrency}
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
