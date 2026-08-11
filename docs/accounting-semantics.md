# Accounting Semantics and Transaction Classification

This document defines Mina's business semantics for accounts, categories, journal records, record roles, transaction classes, and display amounts. It explains how user-facing accounting meaning is derived from double-entry records within the product stance defined in [`checkbook-accounting.md`](checkbook-accounting.md). It does not define SQL migrations, REST DTO shapes, import matching, reconciliation workflow, report layouts, or UI screens.

Mina stores transactions as balanced journal records. Meaning is derived from three explicit signals on those records: **account type**, **record sign**, and **category economic intent**. Users never declare a transaction class, a record role, or a transfer flavor; Mina derives all of them.

## Accounts

Accounts use hierarchical FQNs for organization and prefix grouping. Accounts that represent the same real-world entity share a prefix.

Examples:

- `banks:Chase:checking:Joint`
- `banks:Chase:credit_card:Sapphire`
- `banks:Chase:fees`
- `banks:Chase:interest`
- `people:Jordan:balance`
- `people:Jordan:merchant`
- `system:opening_balance`

Each account has exactly one account type.

| Account type | Meaning | Balance treatment | Examples |
| --- | --- | --- | --- |
| `owned` | Money the household can spend, and revolving institutional accounts it settles. | Included in tracked-balance views. Positive is value held; negative is value owed to the institution. | Checking, savings, cash, credit cards, gift cards, transit passes, stored value. |
| `party` | A named counterparty balance the household tracks, which may swing either way over time. | Included in tracked-balance views, reported separately from `owned`. Positive means owed to the household; negative means owed by the household. | `people:Jordan:balance`, a tracked cash loan, a security deposit held by a landlord, an employer balance for business expenses paid personally. |
| `flow` | External source, destination, or counterparty that explains economic activity. Completes double-entry records; its raw balance is not household state. | Excluded from tracked-balance views. Used for transaction history, counterparty grouping, and spend/income reporting. | Merchants, employers, lenders, bank-fee and bank-interest accounts, `people:Jordan:merchant`. |
| `system` | Mina-owned accounts that complete records without naming a real-world entity, either because there is none or because Mina deliberately declines to model it. | Excluded from tracked balances and ordinary reports. Included in explicit adjustment, exchange, import, and reconciliation inspection. | The fixed accounts listed below. |

### Cash in and cash out is an account-type choice

Movement against a `flow` account is spending or income. Movement against a `party` account is neither — it is a balance movement that nets to zero over the life of the relationship.

Choosing `party` or `flow` for a counterparty is therefore the user's choice of whether money moving there counts as spending:

- A mortgage or car loan the household wants to see as monthly household spending uses `flow` accounts. Its payments are ordinary spend.
- A personal balance the household wants to see as a tracked amount owed, formal or informal, uses a `party` account. Its movements are transfers.

Credit cards are `owned`, not `party`: a card purchase is spending at the merchant, and paying the card is an internal transfer.

### System accounts

System accounts are installed by Mina and are readable but not user configurable. Users cannot create, rename, change, hide, feature, externally link, or delete them.

| System account | Purpose |
| --- | --- |
| `system:suspense` | Temporarily balances a record whose correct counterpart is not known yet. Its balance should be resolved back to zero. |
| `system:correction` | Records an accepted correction or reconciliation difference without pretending it was ordinary spending or income. |
| `system:opening_balance` | Establishes the starting value of a tracked balance without pretending it was income or spending. |
| `system:exchange` | Stands in for the counterparty of a currency exchange, whose identity Mina does not model. |

The first three should trend toward zero or stay one-shot; `system:exchange` instead accumulates a permanent balance in every currency ever traded, which is expected and never needs resolving.

Grouped views use FQN prefixes. `banks:Chase:*` shows Chase-owned accounts, Chase fee accounts, and Chase interest accounts together. `people:Jordan:*` shows Jordan relationship balances and Jordan-as-counterparty activity together.

No separate account usage field is required for accounting correctness.

### Account currency

Account currency is a record constraint, not a balance or display default.

- `account.currency = NULL` means the account is multi-currency; its records may use any valid currency.
- A non-`NULL` currency means the account is single-currency; every active, non-tombstoned journal and recurring-definition record on the account must use that currency.
- Credit-limit history has no currency of its own. It is valid only for a single-currency account, and every active credit-limit value inherits that account's currency.
- While any active, non-tombstoned credit-limit history exists, the account's currency cannot change: it cannot become multi-currency or switch to a different currency. Omitting currency or setting its current value is not a change.
- A tombstoned credit-limit row retains its numeric audit value but no durable denomination. If its account later changes currency, clients must not reinterpret the old value in the new currency.
- Without active credit-limit history, a single-currency account may become multi-currency. A multi-currency account may become single-currency, and a single-currency account may change currency, only when no active journal or recurring-definition record on the account uses a different currency.

Record and balance amounts remain authoritative in their own currencies. Tombstoned records, journal records in tombstoned transactions, and records in tombstoned recurring definitions do not constrain currency transitions. Tombstoned credit-limit history does not constrain them either. Fixed system accounts are multi-currency and immutable.

## Categories

A category answers one question: **what was this spending or income for.**

| Economic intent | Meaning | Reporting treatment |
| --- | --- | --- |
| `expense` | Consumed value or direct cost. Positive records are spending; negative records are refunds, returns, or rebates against that same category. | Included in spending totals; negative records net against them and are also reported separately as refunds. |
| `income` | Earned or received value. Negative records are receipts; positive records are clawbacks or reversals. | Included in income totals. |

Categories attach to `flow` records only. Every other record — the bank leg of a spend, both legs of a transfer, an adjustment, an exchange — carries no category because its meaning is already implied by account type and sign.

Tags are the free-form labeling dimension and attach to any record. Label transfers, adjustments, and exchanges with tags.

Category hierarchy remains user-defined. Intent is explicit metadata and is never inferred from a category FQN. Renaming or reorganizing categories never changes classification.

## Journal Records

A journal record combines:

- an account and its account type,
- signed amount and currency,
- an optional category and its economic intent,
- optional USD value,
- member, tags, memo, lifecycle-independent event dates, source, and external identifiers.

**Category rule:** a record has a category if and only if it is a `flow` record. Records violating this are invalid. The rule has no exceptions and does not depend on anything outside the record itself.

Transactions must balance to zero by currency across active records. USD values are stored on records when supplied. Any missing USD value is inferred at the transaction's `initiated_date` for every record; pending and posted event dates do not change valuation.

Record sign follows the journal convention: positive amounts debit an account and negative amounts credit an account. For `owned` and `party` accounts, the resulting balance is interpreted directly as household state.

## Transaction Lifecycle and Balance Settlement

Lifecycle belongs to the transaction:

- `ACTIVE` is ordinary accounting activity and is the only lifecycle accepted by generic create and replace workflows.
- `EXPECTED` is an unconfirmed recurring occurrence. Recurring materialization is its only creator.
- `CANCELLED` is preserved history that no longer affects accounting. It is reached only by cancelling an active transaction.

Lifecycle is separate from tombstoning. Tombstoning deletes a transaction from active persistence views; cancellation keeps it reviewable and reversible. Expected and cancelled transactions remain structurally balanced, but balances, running balances, month totals, and reports include only active transactions. Default transaction and record listings omit expected transactions; explicit lifecycle filters may request any lifecycle.

Settlement applies only to `owned` and `party` records and is derived from event dates:

- `posted_date != NULL` is `posted`, including when `pending_date` is retained.
- Otherwise `pending_date != NULL` is `pending`.
- If both dates exist, posted cannot precede pending.
- `flow` and `system` records always have neither date and no settlement.

Every balance record on an active transaction has a valid pending or posted settlement. Balance records on an expected transaction have neither date. Settlement intent is therefore supplied only when an expected transaction is confirmed or when active balance records are created or changed. Exact provider event times are preserved; omitted manual times use the transaction initiated date on creation and the operation time on later settlement changes.

A transaction's derived settlement summary is `pending` when all settled balance records are pending, `posted` when all are posted, `mixed` when both are present, and `not_applicable` when no record has settlement. The last case includes transactions with no balance records and expected transactions.

Cancellation is idempotent and valid only for an active transaction whose settlement is wholly pending. Expected, posted, mixed, and no-balance transactions cannot be cancelled; posted activity is corrected by a reversal. Cancellation preserves event dates and reconciliation. Restoration is an explicit transaction operation that changes only lifecycle back to `ACTIVE`. Generic replacement is limited to active transactions.

## Currencies and Exchanges

Native record amounts are authoritative. Each record holds one amount in one currency, each transaction balances independently in every currency, and mixed-currency amounts are never added together as if they were one balance. Optional USD values support comparable historical reports; they do not replace native amounts or create revaluation entries.

**An exchange is a transaction containing `system:exchange` records, and nothing else is.** Currency count classifies nothing: a transaction may mix currencies freely, so grouping a EUR purchase and a USD charge under one transaction is ordinary spending, not an exchange. Conversely an exchange may contain nothing but the conversion — the exclusivity rules are under [Transaction Shapes](#exchanges-are-exclusive).

Mina does not model who performed an exchange. The funding and receiving accounts are already named on the `owned` or `party` legs; the counterparty between them is `system:exchange`. Providers worth remembering belong in a tag or memo.

Mina posts no separate FX gain or loss and no exchange fee legs. An exchange records the actual amount sold and bought, so any spread or fee is already inside the effective rate its legs encode. Buying `100 EUR` for `110 USD` and later selling the same `100 EUR` for `120 USD` records two exchanges:

| Account           | Type     | First exchange | Later exchange |
| ----------------- | -------- | -------------: | -------------: |
| USD balance       | `owned`  |     `-110 USD` |     `+120 USD` |
| `system:exchange` | `system` |     `+110 USD` |     `-120 USD` |
| `system:exchange` | `system` |     `-100 EUR` |     `+100 EUR` |
| EUR balance       | `owned`  |     `+100 EUR` |     `-100 EUR` |

The effective rates are `1.10` and `1.20 USD/EUR`; the resulting `10 USD` remains visible in the tracked USD balance. No FX gain/loss account and no FX category are needed.

The effective rate is not stored. Mina derives it from the sold and bought amounts and returns it with the `exchange` shape, so every surface showing an exchange can show the rate it was actually done at.

Purchases are normally recorded in a single currency: either the currency of the card or account that paid, or the native currency when paid from an account in that currency. Mina does not track the original-currency cost of a purchase settled in another currency. A charge related to an exchange but billed separately is an ordinary expense record in whatever currency it was billed.

## Record Roles

Mina derives one role per active record and returns it on read. Clients render the derived role; they never compute it.

**Every role is a pure function of the record itself** — its account type, the account's identity when that account is a system account, its category intent, and its sign. No role depends on sibling records, so a record's role never changes because something else in the transaction changed.

| Role | Derived from |
| --- | --- |
| `expense` | Positive `flow` record with an `expense` category. |
| `refund` | Negative `flow` record with an `expense` category. |
| `income` | Negative `flow` record with an `income` category. |
| `clawback` | Positive `flow` record with an `income` category. |
| `exchange` | `system:exchange` record. |
| `adjustment` | `system:suspense`, `system:correction`, or `system:opening_balance` record. |
| `balance` | `owned` or `party` record. |

Only `expense`, `refund`, `income`, and `clawback` roles are reportable as spending or income. `balance` records never appear in spend or income totals, which is what allows one physical bank record to balance any number of categorized counterparty records without double counting.

`balance` covers both the funding side of a purchase and the legs of a transfer. Mina does not try to say which a given record is: a `-100.00` card record that funds `60.00` of spending and lends `40.00` to a friend is one record with one role, and the transaction shapes below report that both things happened.

## Transaction Shapes

A shape answers "is this kind of activity present in this transaction." Each is an independent test for the presence of a record role, so shapes never need a precedence table and any combination is legal.

| Shape | Present when | Amount |
| --- | --- | --- |
| `spend` | Any `expense` record. | Sum of those records, displayed as a negative amount. |
| `refund` | Any `refund` record. | Absolute sum of those records, displayed as a positive amount. |
| `income` | Any `income` record. | Absolute sum of those records, displayed as a positive amount. |
| `clawback` | Any `clawback` record. | Sum of those records, displayed as a negative amount. |
| `adjustment` | Any `adjustment` record. | Negated sum of the `adjustment` records, by currency. |
| `exchange` | Any `exchange` record. | Sold and bought amounts by currency from the `balance` records, plus the effective rate they encode. |
| `transfer` | `balance` records of both signs. | With no `party` records, the sum of the positive `balance` records. With `party` records, the negated sum of the `party` records. |

Two amounts need explaining. An `adjustment` reads its own records rather than their counterparts, because a counterpart record may carry an adjustment and something else at once and cannot be attributed to one shape. A `transfer` with `party` records reports the household's net cash effect — negative when value left the household, and zero when a balance simply moved from one party to another and nothing really changed.

`spend`, `refund`, `income`, `clawback`, `adjustment`, and `exchange` are **economic** shapes: each states an effect on household spending, income, or position. `transfer` is a **movement** shape: it states that value moved between tracked balances, which is true alongside almost any economic shape and is never an economic claim on its own.

Mina returns the full shape list on every transaction. Reporting reads shapes and their amounts directly, so no aggregate is needed to sum spending correctly.

### Exchanges are exclusive

An exchange is the one shape Mina validates rather than merely observes. A transaction containing any `system:exchange` record must:

- span exactly two currencies,
- contain only `owned`, `party`, and `system:exchange` records — no `flow` records and no adjustment system records,
- hold `balance` records of one sign in one currency and the opposite sign in the other, and
- balance to zero in each currency, as every transaction must.

A transaction with a `system:exchange` record that breaks any of these is invalid. The `exchange` shape is therefore always the only shape present, and currency conversion can never hide inside a purchase or a transfer.

## Transaction Classes

The class is a single-value summary of the shape list, for surfaces that need one label and one amount.

- Exactly one economic shape → that shape is the class.
- More than one economic shape → `mixed`.
- No economic shape → `transfer`.

The `transfer` movement shape never makes a transaction `mixed`. A restaurant bill partly assigned to a friend is `spend`; a savings transfer that cost a wire charge is `spend` of the charge; cash back at a supermarket is `spend`.

| Transaction class | Primary display amount |
| --- | --- |
| `spend` | Sum of the `spend` shape amount, negative. |
| `income` | Positive income amount. |
| `refund` | Positive refund amount. |
| `clawback` | Negative clawback amount. |
| `currency_exchange` | Neutral primary amount. Sold and bought amounts shown separately. |
| `adjustment` | Adjustment amount by affected account. |
| `transfer` | Neutral primary amount. Moved amount shown separately. |
| `mixed` | Shape amounts, with no synthetic total. |

Every persisted display amount also carries a nullable USD equivalent derived from exactly the records contributing to its native amount and with the same sign transformation. Mina sums stored journal-record `amount_usd` values only; if any contributor is missing that stored value or the final aggregate is outside the supported decimal range, the display amount's `amount_usd` is null rather than partial or out of range. Dry-run classification and date-free recurring-definition amounts have no stored valuation and therefore expose no USD equivalent.

Transaction titles use effective account display labels for directional, adjustment, and dominant-counterparty summaries. This presentation choice does not participate in record roles, shapes, classes, or amounts.

`mixed` now means a genuine conflict — spending and income in the same transaction, for example — rather than any transaction with more than one moving part.

`clawback` mirrors `refund`: a refund reverses spending inside its expense category, and a clawback reverses income inside its income category, so both net against their own category totals without a join.

## What Mina Does Not Derive

Mina reports principal moving out to and in from `party` accounts, plus each counterparty's running balance. It does not split those movements into money lent, money borrowed, principal repaid, and principal returned: with one swinging balance per counterparty, that split is only answerable from the balance at a point in time, and it would be noise for informal running tabs.

A household that wants a loan counted in cashflow models the lender as a `flow` account, which makes its payments ordinary spending.

## Examples

Simple spend:

| Account                            | Type    |   Amount | Category           |
| ---------------------------------- | ------- | -------: | ------------------ |
| `banks:Chase:credit_card:Sapphire` | `owned` | `-72.00` | —                  |
| `merchants:Restaurant:Local`       | `flow`  |  `72.00` | `Food:Restaurants` |

Class: `spend`. Display: `-72.00`.

Mortgage payment on an untracked house:

| Account | Type | Amount | Category |
| --- | --- | --: | --- |
| `banks:Chase:checking:Joint` | `owned` | `-2400.00` | — |
| `banks:FannieMay` | `flow` | `1800.00` | `Housing:Mortgage:Principal` |
| `banks:FannieMay` | `flow` | `400.00` | `Housing:Mortgage:Interest` |
| `banks:FannieMay` | `flow` | `150.00` | `Housing:Insurance` |
| `banks:FannieMay` | `flow` | `50.00` | `Housing:Mortgage:Servicing` |

Class: `spend`. Display: `-2400.00`. One unchanged bank record balances four categorized counterparty records. The counterparty is one account — the servicing bank — repeated with a different category per leg; splitting a payment is a category question, not an account question.

Spend with friend split:

| Account                            | Type    |   Amount | Category           |
| ---------------------------------- | ------- | -------: | ------------------ |
| `banks:Chase:credit_card:Sapphire` | `owned` | `-72.00` | —                  |
| `merchants:Restaurant:Local`       | `flow`  |  `54.00` | `Food:Restaurants` |
| `people:Jordan:balance`            | `party` |  `18.00` | —                  |

Shapes: `spend` `54.00`, `transfer` `18.00`. Class: `spend`. Display: `-54.00`. Jordan balance increases by `18.00`. The card record is one `balance` record with one role even though it both funds spending and lends.

Jordan repayment:

| Account                      | Type    |   Amount | Category |
| ---------------------------- | ------- | -------: | -------- |
| `banks:Chase:checking:Joint` | `owned` |  `18.00` | —        |
| `people:Jordan:balance`      | `party` | `-18.00` | —        |

Class: `transfer`. Display: neutral transfer of `18.00`.

Grocery return:

| Account                            | Type    |   Amount | Category         |
| ---------------------------------- | ------- | -------: | ---------------- |
| `banks:Chase:credit_card:Sapphire` | `owned` |  `30.00` | —                |
| `merchants:Supermarket`            | `flow`  | `-30.00` | `Food:Groceries` |

Class: `refund`. Display: `+30.00`. The same category carries the purchase and the return, so category totals net without a join.

Supermarket debit with cash back:

| Account                      | Type    |    Amount | Category         |
| ---------------------------- | ------- | --------: | ---------------- |
| `banks:Chase:checking:Joint` | `owned` | `-120.00` | —                |
| `merchants:Supermarket`      | `flow`  |  `100.00` | `Food:Groceries` |
| `cash:Wallet`                | `owned` |   `20.00` | —                |

Shapes: `spend` `100.00`, `transfer` `20.00`. Class: `spend`. Display: `-100.00`.

Transfer to savings with a wire charge:

| Account                        | Type    |    Amount | Category       |
| ------------------------------ | ------- | --------: | -------------- |
| `banks:Chase:checking:Joint`   | `owned` | `-525.00` | —              |
| `banks:Ally:savings:Emergency` | `owned` |  `500.00` | —              |
| `banks:Chase:fees`             | `flow`  |   `25.00` | `Banking:Fees` |

Shapes: `spend` `25.00`, `transfer` `500.00`. Class: `spend`. Display: `-25.00`, with the `500.00` movement shown alongside.

Bank interest:

| Account                      | Type    |  Amount | Category           |
| ---------------------------- | ------- | ------: | ------------------ |
| `banks:Chase:checking:Joint` | `owned` |  `2.15` | —                  |
| `banks:Chase:interest`       | `flow`  | `-2.15` | `Banking:Interest` |

Class: `income`. Display: `+2.15`.

Currency exchange:

| Account                      | Type     |    Amount | Currency | Category |
| ---------------------------- | -------- | --------: | -------- | -------- |
| `banks:Chase:checking:Joint` | `owned`  | `-330.00` | `USD`    | —        |
| `system:exchange`            | `system` |  `330.00` | `USD`    | —        |
| `system:exchange`            | `system` | `-300.00` | `EUR`    | —        |
| `cash:Travel:EUR`            | `owned`  |  `300.00` | `EUR`    | —        |

Shapes: `exchange` only — the exclusivity rules forbid anything else, so no `transfer` shape appears despite the opposite-signed `balance` records. Class: `currency_exchange`. Display: sold `330.00 USD`, bought `300.00 EUR`. The user states only the two accounts and the two amounts; Mina supplies the `system:exchange` records.

Purchase abroad from a EUR cash balance:

| Account | Type | Amount | Currency | Category |
| --- | --- | --: | --- | --- |
| `cash:Travel:EUR` | `owned` | `-60.00` | `EUR` | — |
| `merchants:Travel:Dining:Lisbon` | `flow` | `60.00` | `EUR` | `Travel:Dining` |

Class: `spend`. Display: `-60.00 EUR`. No `system:exchange` record, so this is spending regardless of currency; a USD charge could join the same transaction without changing that.

Bonus clawed back by an employer:

| Account                      | Type    |    Amount | Category       |
| ---------------------------- | ------- | --------: | -------------- |
| `banks:Chase:checking:Joint` | `owned` | `-500.00` | —              |
| `employers:Acme`             | `flow`  |  `500.00` | `Income:Bonus` |

Class: `clawback`. Display: `-500.00`. The reversal nets inside `Income:Bonus` rather than appearing as spending.

Paycheck that also settles a business expense paid personally:

| Account                      | Type    |     Amount | Category        |
| ---------------------------- | ------- | ---------: | --------------- |
| `banks:Chase:checking:Joint` | `owned` |  `3200.00` | —               |
| `employers:Acme`             | `flow`  | `-3000.00` | `Income:Salary` |
| `employers:Acme:balance`     | `party` |  `-200.00` | —               |

Shapes: `income` `3000.00`, `transfer` `200.00`. Class: `income`. Display: `+3000.00`. Paying a business expense on the employer's behalf lends them money, so the expense sits on a `party` balance and settling it is a transfer, not a refund — the household never spent that money.

Salary deposited net of a wire fee:

| Account                      | Type    |     Amount | Category        |
| ---------------------------- | ------- | ---------: | --------------- |
| `banks:Chase:checking:Joint` | `owned` |  `2985.00` | —               |
| `employers:Acme`             | `flow`  | `-3000.00` | `Income:Salary` |
| `banks:Chase:fees`           | `flow`  |    `15.00` | `Banking:Fees`  |

Shapes: `income` `3000.00`, `spend` `15.00`. Class: `mixed`. Display: both amounts, no total. Two economic shapes genuinely conflict, so no single number describes the transaction.

Opening balance:

| Account                      | Type     |     Amount | Category |
| ---------------------------- | -------- | ---------: | -------- |
| `banks:Chase:checking:Joint` | `owned`  |  `1000.00` | —        |
| `system:opening_balance`     | `system` | `-1000.00` | —        |

Class: `adjustment`. Display: checking opening balance `1000.00`.
