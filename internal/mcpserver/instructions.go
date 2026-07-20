package mcpserver

const serverInstructions = `Mina is a local-first, double-entry personal finance system for one household. Its tools operate on accounts, categories, tags, and household members; accounts, categories, and tags use colon-separated fully qualified name (FQN) hierarchies. Transactions are balanced journals made of debit and credit records. Prefer read and list tools before mutating household state. Destructive tools are annotated and may tombstone entities or permanently alter household state.

Preferred workflows:
- Search or list before creating or mutating so you can reuse existing entities, resolve IDs, and avoid duplicates.
- For simple entries, use the transactions_create_spend, transactions_create_income, transactions_create_refund, and transactions_create_transfer shorthand tools. Use transactions_create and transactions_replace for complete multi-record journals.
- Use server-computed totals and balances, including transactions_month_totals and accounts_list_balances, instead of aggregating records client-side.
- Keep list and search calls bounded with their limit and server-side filter parameters. Prefer narrow filters and the documented defaults.
- Send monetary amounts as decimal strings, not JSON numbers. Send dates and timestamps in ISO 8601 format.
- Use recurring_list_occurrences as the recurring-occurrence review queue, then recurring_confirm_occurrence or recurring_dismiss_occurrence for each expected transaction.

Safety rules:
- Never call a destructive or bulk-mutating tool without explicit user intent.
- Hidden resources are excluded by default. Include hidden entities only when the user or workflow explicitly requires them.`
