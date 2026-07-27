# Checkbook Accounting

Mina uses **checkbook accounting**: a cash-first household model backed by
balanced double-entry records. The name is a familiar informal description,
not a formal accounting standard; this document defines what it means in Mina.

The boundary is money and debt the household actively tracks. Double-entry
keeps that picture complete and reconcilable, but Mina does not try to build a
household balance sheet.

## Questions Mina Answers

- How much did the household spend or receive this month or year?
- What was the money spent on, and by whom?
- Do cash, bank, card, stored-value, and tracked debt balances match reality?
- How did money move between accounts, people, and currencies?
- What recurring commitments, budgets, and likely future balances matter?

## What Mina Models Fully

- Every transaction is a balanced set of records, not one opaque bank row.
- One physical bank or card posting remains one record while its other side can
  split into any number of purposes.
- Cash, bank accounts, cards, stored value, and useful personal receivables or
  debts retain their own balances.
- Currencies remain native amounts. Exchanges record exactly what was sold and
  bought, so their effective rates and their effect on tracked balances remain
  visible. Spreads and conversion charges are already inside that rate and are
  never posted as separate legs.

For example, a supermarket debit that includes groceries, a service charge, and
cash back has one bank record plus separate merchant-spend, charge, and
cash-balance records. The bank statement still reconciles while reports preserve
what actually happened.

## Deliberate Simplifications

Mina's `spend` is money leaving the household, not the narrower "expense" of
formal financial statements. You decide which it is per counterparty, once, when
you create the account.

A mortgage payment is money gone. Mina records the whole thing as spending,
split across principal and interest so you can see both, and never pretends to
know what the house is worth.

Money you lend a friend is not gone. It sits on their balance until they pay you
back, and neither direction counts as spending. Interest they pay you is income.

You can keep a periodically updated value for something Mina does not track, but
it stays a number you maintain — Mina will not reconstruct what is behind it.

The cost of this is one report Mina cannot produce: a household-wide split of
money lent, borrowed, repaid, and returned. You get each balance's running total
and what moved through it, which is what a checkbook was ever for.

## What Mina Does Not Model

- Houses, cars, possessions, depreciation, appreciation, or current market
  values.
- Exact household net worth. Mina reports tracked balances, not a claim about
  everything the household owns and owes.
- Securities, portfolio performance, unrealized gains, tax accounts, or
  standards-compliant financial statements.

[`accounting-semantics.md`](accounting-semantics.md) defines the technical
account, category, journal-record, classification, and display rules that
implement this stance.
