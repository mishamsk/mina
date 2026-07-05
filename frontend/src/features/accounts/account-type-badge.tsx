import type { AccountType } from "@/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AccountTypeBadgeProps {
  readonly accountType: AccountType;
}

const accountTypeLabel = (accountType: AccountType): string => {
  if (accountType === "balance") {
    return "Balance";
  }
  if (accountType === "flow") {
    return "Flow";
  }
  return "System";
};

export const AccountTypeBadge = ({ accountType }: AccountTypeBadgeProps) => (
  <Badge
    variant="outline"
    className={cn(
      accountType === "balance" && "bg-card text-foreground",
      accountType === "flow" && "text-foreground bg-[var(--band)]",
      accountType === "system" && "bg-muted text-muted-foreground",
    )}
  >
    {accountTypeLabel(accountType)}
  </Badge>
);
