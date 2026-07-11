# Mina Scope

`VISION.md` defines Mina's destination. This file defines durable product
boundaries, not planned work, sequencing, or implementation status.

## In Scope

- A true double-entry ledger: every accounting transaction is a balanced set of journal records.
- Fully editable historical accounting data; Mina does not lock accounting periods.
- A local browser UI plus REST, MCP, and CLI interfaces.
- Portable household accounting state in one database file. `docs/architecture.md` owns the boundary between accounting and operational state.

## Out of Scope

- Native mobile applications.
- Multi-user or multi-household SaaS behavior.
- Tax preparation or tax-filing integrations.
- Real-time notification and alerting systems.
