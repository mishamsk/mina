import type { Transaction } from "@/api";

import { AmountText } from "./amount-text";
import { displayAmountKey, formatInitiatedDate } from "./format";

export const TransactionDeleteAmountSummary = ({
  transaction,
}: {
  readonly transaction: Transaction;
}) => {
  const amounts =
    transaction.transaction_class === "transfer" ||
    transaction.transaction_class === "currency_exchange" ||
    transaction.transaction_class === "mixed"
      ? transaction.components.flatMap((component) => component.amounts)
      : transaction.primary_amounts.length > 0
        ? transaction.primary_amounts
        : transaction.components.flatMap((component) => component.amounts);

  return amounts.length > 0 ? (
    <span className="inline-flex flex-wrap gap-1">
      {amounts.map((amount, index) => (
        <AmountText
          key={`${displayAmountKey(amount)}:${index}`}
          amount={amount}
          positiveSign={
            transaction.transaction_class !== "transfer" &&
            transaction.transaction_class !== "currency_exchange"
          }
          transactionClass={transaction.transaction_class}
        />
      ))}
    </span>
  ) : (
    <span>No display amount</span>
  );
};

export const TransactionDeleteDescription = ({
  transaction,
}: {
  readonly transaction: Transaction;
}) => (
  <>
    <p>
      Delete {transaction.display_title} from{" "}
      {formatInitiatedDate(transaction.initiated_date)} for{" "}
      <TransactionDeleteAmountSummary transaction={transaction} />?
    </p>
    <p>
      This tombstones the transaction and removes it from default transaction
      lists.
    </p>
  </>
);
