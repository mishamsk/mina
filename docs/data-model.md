# Data Model

This file is the target accounting-state data model. Keep it aligned with implemented migrations.

## Full SQL Schema of the Core Entities

```sql
-- Sequence for global unique ID generation
CREATE SEQUENCE primary_key_gen_seq START 1;

-- ENUM types for status tracking
CREATE TYPE posting_status AS ENUM (
    'EXPECTED',
    'PENDING',
    'POSTED',
    'CANCELLED'
);

CREATE TYPE reconciliation_status AS ENUM (
    'RECONCILED',
    'UNRECONCILED'
);

CREATE TYPE source AS ENUM (
    'MANUAL',
    'IMPORTED',
    'RECURRING_TEMPLATE'
);

CREATE TYPE account_type AS ENUM (
    'BALANCE',
    'FLOW',
    'SYSTEM'
);

CREATE TYPE category_economic_intent AS ENUM (
    'EXPENSE',
    'FEE',
    'INCOME',
    'REFUND',
    'TRANSFER',
    'EXCHANGE',
    'ADJUSTMENT',
    'FX_GAIN_LOSS'
);

-- Category table with hierarchical FQN and virtual columns
CREATE TABLE category (
    category_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    -- Colon-separated hierarchical category path, e.g. Food:Restaurants.
    fqn TEXT NOT NULL,
    -- Explicit economic meaning used for transaction classification.
    economic_intent category_economic_intent NOT NULL,
    -- Excludes active rows from default lists while keeping them selectable by explicit query.
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    -- Parent category path derived from fqn, or NULL for root categories.
    parent_fqn TEXT GENERATED ALWAYS AS (
        CASE
            WHEN instr(fqn, ':') > 0
            THEN regexp_replace(fqn, ':[^:]+$', '')
            ELSE NULL
        END
    ) VIRTUAL,

    -- Leaf category name derived from fqn.
    name TEXT GENERATED ALWAYS AS (
        regexp_extract(fqn, '[^:]+$')
    ) VIRTUAL,

    -- Zero-based category depth derived from fqn.
    level INTEGER GENERATED ALWAYS AS (
        ARRAY_LENGTH(SPLIT(fqn, ':')) - 1
    ) VIRTUAL,

    UNIQUE(fqn, tombstoned_at)
);

COMMENT ON COLUMN category.fqn IS 'Colon-separated hierarchical category path, e.g. Food:Restaurants.';
COMMENT ON COLUMN category.economic_intent IS 'Explicit economic meaning used for transaction classification.';
COMMENT ON COLUMN category.is_hidden IS 'Excludes active rows from default lists while keeping them selectable by explicit query.';
COMMENT ON COLUMN category.parent_fqn IS 'Parent category path derived from fqn, or NULL for root categories.';
COMMENT ON COLUMN category.name IS 'Leaf category name derived from fqn.';
COMMENT ON COLUMN category.level IS 'Zero-based category depth derived from fqn.';

-- Tag table with hierarchical FQN and virtual columns
CREATE TABLE tag (
    tag_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    -- Colon-separated hierarchical tag path, e.g. Trips:Vacation.
    fqn TEXT NOT NULL,
    -- Excludes active rows from default lists while keeping them selectable by explicit query.
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    -- Parent tag path derived from fqn, or NULL for root tags.
    parent_fqn TEXT GENERATED ALWAYS AS (
        CASE
            WHEN instr(fqn, ':') > 0
            THEN regexp_replace(fqn, ':[^:]+$', '')
            ELSE NULL
        END
    ) VIRTUAL,

    -- Leaf tag name derived from fqn.
    name TEXT GENERATED ALWAYS AS (
        regexp_extract(fqn, '[^:]+$')
    ) VIRTUAL,

    -- Zero-based tag depth derived from fqn.
    level INTEGER GENERATED ALWAYS AS (
        ARRAY_LENGTH(SPLIT(fqn, ':')) - 1
    ) VIRTUAL,

    UNIQUE(fqn, tombstoned_at)
);

COMMENT ON COLUMN tag.fqn IS 'Colon-separated hierarchical tag path, e.g. Trips:Vacation.';
COMMENT ON COLUMN tag.is_hidden IS 'Excludes active rows from default lists while keeping them selectable by explicit query.';
COMMENT ON COLUMN tag.parent_fqn IS 'Parent tag path derived from fqn, or NULL for root tags.';
COMMENT ON COLUMN tag.name IS 'Leaf tag name derived from fqn.';
COMMENT ON COLUMN tag.level IS 'Zero-based tag depth derived from fqn.';

-- Member table for household member tracking
CREATE TABLE member (
    member_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    UNIQUE(name, tombstoned_at)
);

-- Account table with FQN hierarchy and virtual columns
CREATE TABLE account (
    account_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    -- Colon-separated hierarchical account path, e.g. banks:Chase:checking:Joint.
    fqn TEXT NOT NULL,
    -- Explicit semantic account type used for balances and transaction classification.
    account_type account_type NOT NULL,
    -- Excludes active rows from default lists while keeping them selectable by explicit query.
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    -- Marks active rows for prominent UI/account-picker placement without changing accounting semantics.
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    -- ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.
    currency TEXT,
    -- Identifier assigned by an external system when this account is linked outside Mina.
    external_id TEXT,
    -- External system namespace for external_id, e.g. plaid.
    external_system TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    -- Parent account path derived from fqn, or NULL for root accounts.
    parent_fqn TEXT GENERATED ALWAYS AS (
        CASE
            WHEN instr(fqn, ':') > 0
            THEN regexp_replace(fqn, ':[^:]+$', '')
            ELSE NULL
        END
    ) VIRTUAL,

    -- Leaf account name derived from fqn.
    name TEXT GENERATED ALWAYS AS (
        regexp_extract(fqn, '[^:]+$')
    ) VIRTUAL,

    -- Zero-based account depth derived from fqn.
    level INTEGER GENERATED ALWAYS AS (
        ARRAY_LENGTH(SPLIT(fqn, ':')) - 1
    ) VIRTUAL,

    UNIQUE(fqn, tombstoned_at)
);

COMMENT ON COLUMN account.fqn IS 'Colon-separated hierarchical account path, e.g. banks:Chase:checking:Joint.';
COMMENT ON COLUMN account.account_type IS 'Explicit semantic account type used for balances and transaction classification.';
COMMENT ON COLUMN account.is_hidden IS 'Excludes active rows from default lists while keeping them selectable by explicit query.';
COMMENT ON COLUMN account.is_featured IS 'Marks active rows for prominent UI/account-picker placement without changing accounting semantics.';
COMMENT ON COLUMN account.currency IS 'ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.';
COMMENT ON COLUMN account.external_id IS 'Identifier assigned by an external system when this account is linked outside Mina.';
COMMENT ON COLUMN account.external_system IS 'External system namespace for external_id, e.g. plaid.';
COMMENT ON COLUMN account.parent_fqn IS 'Parent account path derived from fqn, or NULL for root accounts.';
COMMENT ON COLUMN account.name IS 'Leaf account name derived from fqn.';
COMMENT ON COLUMN account.level IS 'Zero-based account depth derived from fqn.';

-- Transaction table for double-entry transaction metadata
CREATE TABLE "transaction" (
    transaction_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    -- Human-facing calendar date the transaction happened, distinct from formal banking timestamps on records that may be future dated.
    initiated_date DATE NOT NULL,
    -- Occurrence this transaction was generated from; NULL for non-recurring transactions; the definition is reached via the occurrence.
    recurring_occurrence_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP
);

COMMENT ON COLUMN "transaction".initiated_date IS 'Human-facing calendar date the transaction happened, distinct from formal banking timestamps on records that may be future dated.';
COMMENT ON COLUMN "transaction".recurring_occurrence_id IS 'Occurrence this transaction was generated from; NULL for non-recurring transactions; the definition is reached via the occurrence.';

-- Journal record table for individual debit/credit entries
CREATE TABLE journal_record (
    record_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    transaction_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    member_id INTEGER,

    -- ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.
    currency TEXT NOT NULL,
    -- Signed debit or credit amount in the record currency.
    amount DECIMAL(18,8) NOT NULL,
    -- Signed USD conversion at recording time; NULL when no exchange rate is available.
    amount_usd DECIMAL(18,8),

    category_id INTEGER NOT NULL,
    -- Tag IDs assigned to this record for flexible grouping.
    tag_ids INTEGER[] NOT NULL DEFAULT [],

    -- Optional record note or description.
    memo TEXT,

    -- UTC banking transaction timestamp, such as a card hold; for non-bank records, initiated_date as a full timestamp.
    pending_date TIMESTAMP NOT NULL,
    -- UTC timestamp when the record posted; equal to pending_date for manual non-bank records and NULL until posted.
    posted_date TIMESTAMP DEFAULT NULL,

    -- Banking lifecycle state for this record.
    posting_status posting_status NOT NULL,
    -- Import/reconciliation matching state.
    reconciliation_status reconciliation_status NOT NULL DEFAULT 'RECONCILED',

    -- Origin of this record.
    source source NOT NULL,

    -- Identifier assigned by an external system when this record is linked outside Mina.
    external_id TEXT,
    -- External system namespace for external_id.
    external_system TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP
);

COMMENT ON COLUMN journal_record.currency IS 'ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.';
COMMENT ON COLUMN journal_record.amount IS 'Signed debit or credit amount in the record currency.';
COMMENT ON COLUMN journal_record.amount_usd IS 'Signed USD conversion at recording time; NULL when no exchange rate is available.';
COMMENT ON COLUMN journal_record.tag_ids IS 'Tag IDs assigned to this record for flexible grouping.';
COMMENT ON COLUMN journal_record.memo IS 'Optional record note or description.';
COMMENT ON COLUMN journal_record.pending_date IS 'UTC banking transaction timestamp, such as a card hold; for non-bank records, initiated_date as a full timestamp.';
COMMENT ON COLUMN journal_record.posted_date IS 'UTC timestamp when the record posted; equal to pending_date for manual non-bank records and NULL until posted.';
COMMENT ON COLUMN journal_record.posting_status IS 'Banking lifecycle state for this record.';
COMMENT ON COLUMN journal_record.reconciliation_status IS 'Import/reconciliation matching state.';
COMMENT ON COLUMN journal_record.source IS 'Origin of this record.';
COMMENT ON COLUMN journal_record.external_id IS 'Identifier assigned by an external system when this record is linked outside Mina.';
COMMENT ON COLUMN journal_record.external_system IS 'External system namespace for external_id.';

-- Transaction template table for date-free manual-entry defaults
CREATE TABLE transaction_template (
    transaction_template_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    -- Colon-separated hierarchical template path, e.g. Utilities:Electric.
    fqn TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    -- Parent template path derived from fqn, or NULL for root templates.
    parent_fqn TEXT GENERATED ALWAYS AS (
        CASE
            WHEN instr(fqn, ':') > 0
            THEN regexp_replace(fqn, ':[^:]+$', '')
            ELSE NULL
        END
    ) VIRTUAL,

    -- Leaf template name derived from fqn.
    name TEXT GENERATED ALWAYS AS (
        regexp_extract(fqn, '[^:]+$')
    ) VIRTUAL,

    -- Zero-based template depth derived from fqn.
    level INTEGER GENERATED ALWAYS AS (
        ARRAY_LENGTH(SPLIT(fqn, ':')) - 1
    ) VIRTUAL,

    UNIQUE(fqn, tombstoned_at)
);

COMMENT ON COLUMN transaction_template.fqn IS 'Colon-separated hierarchical template path, e.g. Utilities:Electric.';
COMMENT ON COLUMN transaction_template.parent_fqn IS 'Parent template path derived from fqn, or NULL for root templates.';
COMMENT ON COLUMN transaction_template.name IS 'Leaf template name derived from fqn.';
COMMENT ON COLUMN transaction_template.level IS 'Zero-based template depth derived from fqn.';

-- Transaction template records for normalized partial defaults
CREATE TABLE transaction_template_record (
    transaction_template_record_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    transaction_template_id INTEGER NOT NULL,
    -- Category is the minimum record default required for manual-entry templates.
    category_id INTEGER NOT NULL,
    -- Optional account default for partial manual-entry templates.
    account_id INTEGER,
    -- Optional household-member default for partial manual-entry templates.
    member_id INTEGER,
    -- Optional currency default; templates do not store converted amount_usd.
    currency TEXT,
    -- Optional signed amount default; templates do not need to balance.
    amount DECIMAL(18,8),
    tag_ids INTEGER[] NOT NULL DEFAULT [],
    memo TEXT,
    posting_status posting_status,
    reconciliation_status reconciliation_status,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP
);

COMMENT ON COLUMN transaction_template_record.category_id IS 'Category is the minimum record default required for manual-entry templates.';
COMMENT ON COLUMN transaction_template_record.account_id IS 'Optional account default for partial manual-entry templates.';
COMMENT ON COLUMN transaction_template_record.member_id IS 'Optional household-member default for partial manual-entry templates.';
COMMENT ON COLUMN transaction_template_record.currency IS 'Optional currency default; templates do not store converted amount_usd.';
COMMENT ON COLUMN transaction_template_record.amount IS 'Optional signed amount default; templates do not need to balance.';

-- Exchange rate table for historical currency conversion
CREATE TABLE exchange_rate (
    exchange_rate_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    -- ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.
    from_currency TEXT NOT NULL,
    -- ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.
    to_currency TEXT NOT NULL,
    -- Multiplicative conversion rate from from_currency to to_currency.
    rate DECIMAL(18,8) NOT NULL,
    -- UTC timestamp when the exchange rate becomes effective.
    effective_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    UNIQUE(from_currency, to_currency, effective_date, tombstoned_at)
);

COMMENT ON COLUMN exchange_rate.from_currency IS 'ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.';
COMMENT ON COLUMN exchange_rate.to_currency IS 'ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.';
COMMENT ON COLUMN exchange_rate.rate IS 'Multiplicative conversion rate from from_currency to to_currency.';
COMMENT ON COLUMN exchange_rate.effective_date IS 'UTC timestamp when the exchange rate becomes effective.';

-- Budget table for monthly category budgets
CREATE TABLE budget (
    budget_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    -- Category path this monthly budget applies to.
    category_fqn TEXT NOT NULL,
    -- Budget month, stored as the first calendar date of that month.
    month DATE NOT NULL,
    -- Budgeted amount for category_fqn during month.
    amount DECIMAL(18,8) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    UNIQUE(category_fqn, month, tombstoned_at)
);

COMMENT ON COLUMN budget.category_fqn IS 'Category path this monthly budget applies to.';
COMMENT ON COLUMN budget.month IS 'Budget month, stored as the first calendar date of that month.';
COMMENT ON COLUMN budget.amount IS 'Budgeted amount for category_fqn during month.';

-- Credit limit history table for tracking limit changes over time
CREATE TABLE credit_limit_history (
    credit_limit_history_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    account_id INTEGER NOT NULL,
    -- Credit limit amount effective for the account.
    credit_limit DECIMAL(18,8) NOT NULL,
    -- Calendar date when this credit limit starts applying.
    effective_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    UNIQUE(account_id, effective_date, tombstoned_at)
);

COMMENT ON COLUMN credit_limit_history.credit_limit IS 'Credit limit amount effective for the account.';
COMMENT ON COLUMN credit_limit_history.effective_date IS 'Calendar date when this credit limit starts applying.';

-- Active-row uniqueness uses expression indexes because DuckDB treats NULL values
-- as distinct inside UNIQUE constraints.
CREATE UNIQUE INDEX category_active_fqn_unique
ON category ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));

CREATE UNIQUE INDEX tag_active_fqn_unique
ON tag ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));

CREATE UNIQUE INDEX member_active_name_unique
ON member ((CASE WHEN tombstoned_at IS NULL THEN name ELSE NULL END));

CREATE UNIQUE INDEX account_active_fqn_unique
ON account ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));

CREATE UNIQUE INDEX transaction_template_active_fqn_unique
ON transaction_template ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));

CREATE UNIQUE INDEX credit_limit_history_active_account_date_unique
ON credit_limit_history ((CASE WHEN tombstoned_at IS NULL THEN CAST(account_id AS VARCHAR) || ':' || CAST(effective_date AS VARCHAR) ELSE NULL END));

CREATE UNIQUE INDEX exchange_rate_active_pair_date_unique
ON exchange_rate ((CASE WHEN tombstoned_at IS NULL THEN from_currency || ':' || to_currency || ':' || CAST(effective_date AS VARCHAR) ELSE NULL END));

CREATE UNIQUE INDEX budget_active_category_month_unique
ON budget ((CASE WHEN tombstoned_at IS NULL THEN category_fqn || ':' || CAST(month AS VARCHAR) ELSE NULL END));
```

## Hierarchical Names Encoding

Accounts, categories, tags, and transaction templates use hierarchical naming with colon-separated paths:

- `banks:Chase:checking:Joint`
- `people:Jordan:balance`
- `system:opening_balance`
- `Food:Restaurants`
- `Trips:Vacation:Summer2024`
- `Utilities:Electric`

Hierarchy is encoded directly in the name string. Tree structure is derived at query time when needed.
Account type and category economic intent are explicit metadata; they are not inferred from FQN prefixes.
Group/leaf semantics, hierarchy invariants, and restructuring rules are owned by `docs/hierarchy-semantics.md`.
