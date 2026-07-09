# Personal Finance Management System - Business Requirements

## Vision & Purpose

A personal finance management system for a single household implementing strict double-entry bookkeeping principles. The system uses a full accounting data model to enable advanced analytics for technical users who understand and need more than simplified personal finance tools.

### Target Audience

Technical users who appreciate text-based accounting systems (like ledger-cli, hledger, beancount) but want a modern, user-friendly experience with visual interface.

### Core Principles

- **Single Household**: One household, single user, no multi-tenancy
- **Double-Entry Accounting**: Every transaction is a balanced set of debits and credits
- **Portable Data**: All state contained in a single database file
- **API-First**: Complete programmatic API with parity to any UI added later
- **No Period Locking**: Historical transactions remain fully editable

## Product Characteristics

### Deployment Mode

- **Local CLI**: Runs as a local command-line application serving a REST API on localhost
- Phase 2 adds a minimal local web UI served for local use
- The local database file is the only required accounting state

### Data Portability

- All financial data stored in a single database file
- Database file can be copied, backed up, and opened by the local CLI application
- No external dependencies for core functionality

### Programmatic Access

- Complete API covering all system functionality
- No UI-only operations; every action available via API
- Enables integration with external tools and custom scripts

## Development Phases

### Phase 1: Core Double-Entry System - Closed
Delivered REST API foundation with accounts, transactions, categories, tags, household members, basic search/filtering, and bulk operations.

### Phase 2: Minimal Web UI, Templates, and Recurring Transactions
Minimal local web UI transaction entry/search flows per `docs/webui-design.md`, development infrastructure for web UI iteration, hierarchical date-free transaction templates, and recurring transaction support.

### Phase 3: Basic Reporting
Requirements TBD. Candidate areas include saved searches, tag/category/member summaries, personal vs. shared expense views, richer summaries, and trend reporting.

### Phase 4: Budgeting
Monthly category-based budgeting.

### Phase 5: Bank Import & Reconciliation
Plaid integration for importing bank transactions and reconciliation with manual entries.

### Phase 6: Advanced Features
Cash flow forecasting and advanced analytical reporting.

---

# Phase 1 Requirements

## Accounts

### Chart of Accounts

A unified chart of accounts for all financial entities:
- Bank accounts (checking, savings)
- Credit cards
- Merchant accounts (spend destinations, income sources)
- Person accounts (tracking personal debts and loans)
- Catch-all account for unknown merchants during import

### Account Properties

- **Hierarchical naming**: Path-based names encoding parent-child relationships (e.g., `checking:Chase:Primary`)
- **Currency**: Accounts may specify a single currency or support multiple currencies (common for counterparties like merchants)
- **External identifiers**: Links to external systems (Plaid, IBAN, etc.)
- **Hidden state**: Hidden accounts are excluded from input dropdowns and default queries, but remain selectable when explicitly searching
- **Featured state**: Featured accounts can be promoted in UI/account-picker workflows without changing accounting semantics

### Credit Limits

- Track credit limits on credit card accounts
- Maintain history of credit limit changes over time

## Transactions & Records

### Transaction Structure

A transaction is a collection of records whose amounts must sum to zero within each currency.

### Record Properties

Each record within a transaction contains:
- **Account**: The account affected
- **Amount**: In the record's currency (positive for debits, negative for credits)
- **Amount in USD**: Optional converted value when an exchange rate is available at recording time, or back-filled later
- **Household member**: Optional attribution to a specific member; when unspecified, represents a whole-household transaction
- **Category**: Single category assignment
- **Tags**: Multiple tags for flexible grouping
- **Memo**: Description or notes

### Record Dates

Three dates track the lifecycle:
- **Initiated date**: When the transaction occurred in the physical world
- **Pending date**: When it appeared in bank systems
- **Posted date**: When it settled per banking rules

### Record Status

- **Posting status**: Expected, Pending, Posted, or Cancelled
- **Reconciliation status**: Reconciled or Unreconciled (for matching with imports)
- **Source**: How the record was created (manual entry in Phase 1)

### Transaction Entry

- Manual entry through the REST API
- Support for complex multi-account transactions
- Full editing of historical transactions with no period locking
- Bulk operations for categorization, tagging, and account reassignment

## Categories & Tags

### Categories

- **Hierarchical structure**: Path-based names (e.g., `Food:Restaurants:FastFood`)
- **One category per record**: Each record has exactly one category assignment
- **Budget integration**: Categories serve as budget line items (Phase 4)
- **Hidden state**: Hidden categories excluded from input and default queries, but selectable for explicit queries

### Tags

- **Hierarchical structure**: Path-based names (e.g., `Trips:Vacation:Summer2024`)
- **Multiple tags per record**: Used for flexible grouping
- **Flexible usage**: Suitable for trips, projects, tax items, or any custom grouping
- **Hidden state**: Same behavior as categories

### Household Members

- Named members of the household
- Used for attributing individual records within transactions

## Currency

### Multi-Currency Support

- Records can be in any currency
- Each record stores the original currency amount and may store a USD equivalent
- USD serves as the base currency for cross-currency comparison

### Exchange Rates

- Historical exchange rates for currency conversion
- Rates stored by effective date for accurate historical conversions

## Search & Filtering

### Record Search

API search supports tabular clients:
- Sortable fields
- Filterable fields
- Text search

### Transaction & Record Display

- **Aggregate view**: Show transactions with inferred properties (transaction type based on records)
- **Expandable records**: Drill into nested records within a transaction
- **Account view**: View records for a specific account while maintaining connection to containing transaction

### Search Criteria

Search and filter records by:
- Amount and amount range
- Date range (initiated, pending, or posted)
- Description/memo text
- Account
- Category
- Tags
- Household member
- Posting status
- Reconciliation status

### Design Goals

- Focus on simplicity and efficiency
- Quick access to common queries (e.g., all transactions from a specific merchant in the last month)

### Bulk Operations

- Bulk categorization
- Bulk tagging
- Bulk account reassignment
- Bulk status updates

---

# Future Phases

## Phase 2: Minimal Web UI, Templates, and Recurring Transactions
- Local web UI development infrastructure and minimal transaction entry/search flows per `docs/webui-design.md`.
- Transaction templates are hierarchical, date-free, category-bearing manual-entry defaults.
- Transaction templates are separate from recurring transactions and do not include schedules, cadence, due dates, or generated transaction source state.
- Recurring transaction scheduling, occurrence review, and generated-transaction rules are defined in `docs/recurring-transactions-semantics.md`.

## Phase 3: Basic Reporting
*Requirements TBD. Candidate areas include saved searches, tag/category/member summaries, personal vs. shared expense views, richer summaries, and trend reporting.*

## Phase 4: Budgeting
*Requirements TBD*

## Phase 5: Bank Import & Reconciliation
*Requirements TBD*

## Phase 6: Advanced Features
*Requirements TBD*

---

## Out of Scope

The following are explicitly not planned:
- Mobile applications
- Multi-user or multi-household support
- Investment tracking and portfolio management
- Tax preparation integration
- Real-time notifications and alerts
- Third-party integrations beyond Plaid
