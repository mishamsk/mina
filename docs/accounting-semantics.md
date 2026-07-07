# Accounting Semantics and Transaction Classification

This document defines Mina's business semantics for accounts, categories,
journal records, transaction classes, and display amounts. It explains how
user-facing accounting meaning is derived from double-entry records. It does
not define SQL migrations, REST DTO shapes, import matching, reconciliation
workflow, report layouts, or UI screens.

Mina stores transactions as balanced journal records. Account type determines
whether an account balance is household-facing state. Category economic intent
determines what each record means. Transaction class, display amounts, and
record summaries are derived from account type, category economic intent,
record amounts, and currency.

## Accounts

Accounts use hierarchical FQNs for organization and prefix grouping. Accounts
that represent the same real-world entity share a prefix.

Examples:

- `banks:Chase:checking:Joint`
- `banks:Chase:credit_card:Sapphire`
- `banks:Chase:fees`
- `banks:Chase:interest`
- `banks:Chase:fx`
- `people:Jordan:balance`
- `people:Jordan:merchant`
- `system:opening_balance`

Each account has exactly one account type.

| Account type | Meaning | Balance treatment | Examples |
| --- | --- | --- | --- |
| `balance` | Household balance-sheet account. The balance is user-facing household state. | Included in balance, net-worth, asset, liability, receivable, payable, prepaid, and stored-value views. Positive balance means household asset/value due to the household. Negative balance means household liability/value owed by the household. | Checking, savings, cash, credit cards, mortgages, loans, gift cards, security deposits, `people:Jordan:balance`. |
| `flow` | External source, destination, or counterparty used to explain economic activity. The account completes double-entry records but its raw balance is not user-facing household state. | Excluded from household balance and net-worth views. Used for transaction history, counterparty grouping, spend, income, refund, and fee reporting. | Merchants, employers, bank-fee counterparties, bank-interest sources, `people:Jordan:merchant`. |
| `system` | Internal accounting account used to represent mechanics that are not real-world household accounts or counterparties. | Filtered out of regular user-facing views by account type. Excluded from household balance and net-worth views. Included in explicit accounting, adjustment, import, and reconciliation inspection. | Opening balance, suspense, rounding, reconciliation adjustment, FX gain/loss. |

Grouped views use FQN prefixes. `banks:Chase:*` shows Chase-owned
accounts, Chase fee flow accounts, and Chase interest flow accounts together.
`people:Jordan:*` shows Jordan relationship balances and Jordan-as-counterparty
activity together.

No separate account usage field is required for accounting correctness.

## Categories

Every journal record has exactly one category. Every category has exactly one
economic intent.

| Economic intent | Meaning | Reporting treatment |
| --- | --- | --- |
| `expense` | Consumed value or direct cost. | Included in spending totals. Standalone transactions classify as `spend`. |
| `fee` | Financial, service, interest, or operational charge attached to a balance movement or financial operation. | Included in spending totals. Standalone transactions classify as `spend`. Attached fees annotate the primary transaction class. |
| `income` | Earned or received value. | Included in income totals. |
| `refund` | Reversal or recovery of prior expense. | Included in refund totals and excluded from gross income. |
| `transfer` | Balance-sheet movement with no income, expense, refund, or gain/loss effect. Covers ordinary transfers, loan principal, receivable/payable settlement, deposits, prepaid value, and stored-value loads. | Excluded from spend and income totals. Included in cashflow and balance movement views. |
| `exchange` | Currency or asset exchange leg. | Excluded from spend and income totals. Included in exchange views. |
| `adjustment` | Opening balance, correction, reconciliation true-up, suspense resolution, or rounding correction. | Excluded from ordinary spend, income, transfer, and exchange totals. Included in adjustment views. |
| `fx_gain_loss` | Realized foreign-exchange or valuation difference. | Included in gain/loss reporting. Excluded from ordinary spend and income totals. |

Category hierarchy remains user-defined. Intent is explicit metadata and is not
inferred from category FQN.

## Journal Records

A journal record combines:

- an account and its account type,
- a category and its economic intent,
- signed amount and currency,
- optional USD value,
- member, tags, memo, dates, statuses, source, and external identifiers.

Transactions must balance to zero by currency across active records. USD values
are stored on records when supplied.

Cancellation is transaction-level. Among a transaction's active records, either
all posting statuses are `cancelled` or none are. Pending and posted records may
mix within the same transaction. Balance validation includes cancelled records;
aggregate surfaces such as account balances, month totals, and running balances
exclude cancelled records.

Record sign follows the existing journal convention: positive amounts debit an
account and negative amounts credit an account. For `balance` accounts, the
resulting account balance is interpreted directly as household state.

## Intent Shape Rules

The category intent determines the valid account-type and sign shape for each
record group.

| Economic intent | Valid record shape |
| --- | --- |
| `expense` | Positive `flow` counterparty records. Direct same-currency spends also include negative `balance` funding records. Cross-currency spends use `exchange` records for funding. |
| `fee` | Negative `balance` funding records and positive `flow` or `system` fee records. |
| `income` | Positive `balance` destination records and negative `flow` source records. |
| `refund` | Positive `balance` destination records and negative `flow` counterparty records. |
| `transfer` | `balance` records only. Transfer-only transactions require positive and negative `balance` transfer records. |
| `exchange` | Positive and negative `balance` records and at least one `flow` exchange-provider record across at least two currencies. |
| `adjustment` | At least one `system` record and at least one opposite non-system record. |
| `fx_gain_loss` | At least one `system` FX gain/loss record and at least one opposite non-system record. |

Records that violate the shape for their category intent are invalid
transaction data.

## Classification Components

Mina derives transaction components by grouping active records in a transaction
by category economic intent. Within each component, records are partitioned by
account type.

| Component | Required account participation | Component amount |
| --- | --- | --- |
| `expense` | At least one `flow` record. | Sum of `flow` expense records, displayed as a negative amount. |
| `fee` | At least one `flow` or `system` record. | Sum of `flow` and `system` fee records, displayed as a negative amount. |
| `income` | At least one `flow` record and at least one positive `balance` record. | Absolute sum of negative `flow` income records, displayed as a positive amount. |
| `refund` | At least one `flow` record and at least one positive `balance` record. | Absolute sum of negative `flow` refund records, displayed as a positive amount. |
| `transfer` | At least one `balance` record. Transfer-only transactions require positive and negative `balance` transfer records. | Movement amount by currency. For same-currency balance-to-balance transfers, the amount is the positive `balance` transfer total. |
| `exchange` | At least two currencies across `balance` records, at least one `balance` record, and at least one `flow` exchange-provider record. | Sold and bought amounts by currency from `balance` exchange records. Provider `flow` records are visible only as nested journal records. |
| `adjustment` | At least one `system` record and at least one non-system record. | Non-system adjustment amount by currency. |
| `fx_gain_loss` | At least one `system` FX gain/loss record and at least one affected non-system record. | Gain or loss amount by currency or base currency. |

## Transaction Classes

Mina derives one transaction class from the component set.

| Transaction class | Component set | Primary display amount |
| --- | --- | --- |
| `spend` | Only `fee` components, or one or more `expense` components with any number of `fee`, `transfer`, and `exchange` support components. No `income`, `refund`, `adjustment`, or `fx_gain_loss` component. | Sum of displayed `expense` and `fee` component amounts. |
| `income` | One or more `income` components with any number of `transfer` and `exchange` support components. No `expense`, `fee`, `refund`, `adjustment`, or `fx_gain_loss` component. | Positive income amount. |
| `refund` | One or more `refund` components with any number of `transfer` and `exchange` support components. No `expense`, `fee`, `income`, `adjustment`, or `fx_gain_loss` component. | Positive refund amount. |
| `transfer` | Only `transfer` components, or `transfer` plus attached `fee` components. | Neutral primary amount. Movement amount and attached fee are shown separately. |
| `currency_exchange` | One or more `exchange` components with any number of `fee` and `fx_gain_loss` components. No `expense`, `income`, `refund`, or `adjustment` component. | Neutral primary amount. Sold amount, bought amount, fee, and gain/loss are shown separately. |
| `adjustment` | One or more `adjustment` components with any number of `fx_gain_loss` components. No `expense`, `fee`, `income`, `refund`, `transfer`, or `exchange` component. | Adjustment amount by affected account. |
| `fx_gain_loss` | Only `fx_gain_loss` components. | Gain or loss amount. |
| `mixed` | Any component set not covered above. | Component summary. No single primary economic amount is implied. |

Support components do not change the primary class. A restaurant bill partially
assigned to a friend balance is a `spend`, not `mixed`, because the primary
economic component is `expense` and the friend balance record is a `transfer`
support component. A foreign-currency purchase with expense and exchange
components is a `spend`.

## Display Amounts

Transaction list views display class-specific amounts.

| Class | Display rule |
| --- | --- |
| `spend` | Show negative spend amount. |
| `income` | Show positive income amount. |
| `refund` | Show positive refund amount. |
| `transfer` | Show neutral transfer label plus moved amount. Show attached fee separately. |
| `currency_exchange` | Show sold amount and bought amount. Show fee and FX gain/loss separately. |
| `adjustment` | Show affected account and adjustment amount. |
| `fx_gain_loss` | Show gain or loss amount. |
| `mixed` | Show component amounts and no synthetic total. |

## Examples

Simple spend:

| Account | Type | Amount | Category intent |
| --- | --- | ---: | --- |
| `banks:Chase:credit_card:Sapphire` | `balance` | `-72.00` | `expense` |
| `merchants:Restaurant:Local` | `flow` | `72.00` | `expense` |

Class: `spend`. Display: `-72.00`.

Spend with friend split:

| Account | Type | Amount | Category intent |
| --- | --- | ---: | --- |
| `banks:Chase:credit_card:Sapphire` | `balance` | `-72.00` | `expense` |
| `merchants:Restaurant:Local` | `flow` | `54.00` | `expense` |
| `people:Jordan:balance` | `balance` | `18.00` | `transfer` |

Class: `spend`. Display: `-54.00`.
Jordan balance increases by `18.00`.

Jordan repayment:

| Account | Type | Amount | Category intent |
| --- | --- | ---: | --- |
| `banks:Chase:checking:Joint` | `balance` | `18.00` | `transfer` |
| `people:Jordan:balance` | `balance` | `-18.00` | `transfer` |

Class: `transfer`. Display: neutral transfer of `18.00`.
Jordan balance decreases by `18.00`.

Bank interest:

| Account | Type | Amount | Category intent |
| --- | --- | ---: | --- |
| `banks:Chase:checking:Joint` | `balance` | `2.15` | `income` |
| `banks:Chase:interest` | `flow` | `-2.15` | `income` |

Class: `income`. Display: `+2.15`.

Bank fee:

| Account | Type | Amount | Category intent |
| --- | --- | ---: | --- |
| `banks:Chase:checking:Joint` | `balance` | `-15.00` | `fee` |
| `banks:Chase:fees` | `flow` | `15.00` | `fee` |

Class: `spend`. Display: `-15.00`.

Transfer to savings:

| Account | Type | Amount | Category intent |
| --- | --- | ---: | --- |
| `banks:Chase:checking:Joint` | `balance` | `-500.00` | `transfer` |
| `banks:Ally:savings:Emergency` | `balance` | `500.00` | `transfer` |

Class: `transfer`. Display: neutral transfer of `500.00`.

Currency exchange:

| Account | Type | Amount | Currency | Category intent |
| --- | --- | ---: | --- | --- |
| `banks:Chase:checking:Joint` | `balance` | `-330.00` | `USD` | `exchange` |
| `banks:Chase:fx` | `flow` | `330.00` | `USD` | `exchange` |
| `banks:Chase:fx` | `flow` | `-300.00` | `EUR` | `exchange` |
| `cash:Travel:EUR` | `balance` | `300.00` | `EUR` | `exchange` |

Class: `currency_exchange`. Display: sold `330.00 USD`, bought
`300.00 EUR`.

Opening balance:

| Account | Type | Amount | Category intent |
| --- | --- | ---: | --- |
| `banks:Chase:checking:Joint` | `balance` | `1000.00` | `adjustment` |
| `system:opening_balance` | `system` | `-1000.00` | `adjustment` |

Class: `adjustment`. Display: checking opening balance `1000.00`.
