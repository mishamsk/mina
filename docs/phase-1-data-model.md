# Target Data Model

This file represents the anticipated data model for phase 1 of the project and should be eventually superseded by an actual in-source database schema scripts and migrations.

## Full SQL Schema of the Core Entities

```sql
-- Sequence for global unique ID generation
CREATE SEQUENCE primary_key_gen_seq START 1;

-- ENUM types for status tracking
CREATE TYPE posting_status AS ENUM (
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

-- Category table with hierarchical FQN and virtual columns
CREATE TABLE category (
    category_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    fqn TEXT NOT NULL,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    parent_fqn TEXT GENERATED ALWAYS AS (
        CASE
            WHEN instr(fqn, ':') > 0
            THEN regexp_replace(fqn, ':[^:]+$', '')
            ELSE NULL
        END
    ) VIRTUAL,

    name TEXT GENERATED ALWAYS AS (
        regexp_extract(fqn, '[^:]+$')
    ) VIRTUAL,

    level INTEGER GENERATED ALWAYS AS (
        ARRAY_LENGTH(SPLIT(fqn, ':')) - 1
    ) VIRTUAL,

    UNIQUE(fqn, tombstoned_at)
);

-- Tag table with hierarchical FQN and virtual columns
CREATE TABLE tag (
    tag_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    fqn TEXT NOT NULL,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    parent_fqn TEXT GENERATED ALWAYS AS (
        CASE
            WHEN instr(fqn, ':') > 0
            THEN regexp_replace(fqn, ':[^:]+$', '')
            ELSE NULL
        END
    ) VIRTUAL,

    name TEXT GENERATED ALWAYS AS (
        regexp_extract(fqn, '[^:]+$')
    ) VIRTUAL,

    level INTEGER GENERATED ALWAYS AS (
        ARRAY_LENGTH(SPLIT(fqn, ':')) - 1
    ) VIRTUAL,

    UNIQUE(fqn, tombstoned_at)
);

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
    fqn TEXT NOT NULL,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    currency TEXT,
    external_id TEXT,
    external_system TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    kind TEXT GENERATED ALWAYS AS (
        regexp_extract(fqn, '^[^:]+')
    ) VIRTUAL,

    parent_fqn TEXT GENERATED ALWAYS AS (
        CASE
            WHEN instr(fqn, ':') > 0
            THEN regexp_replace(fqn, ':[^:]+$', '')
            ELSE NULL
        END
    ) VIRTUAL,

    name TEXT GENERATED ALWAYS AS (
        regexp_extract(fqn, '[^:]+$')
    ) VIRTUAL,

    level INTEGER GENERATED ALWAYS AS (
        ARRAY_LENGTH(SPLIT(fqn, ':')) - 1
    ) VIRTUAL,

    UNIQUE(fqn, tombstoned_at)
);

-- Transaction table for double-entry transaction metadata
CREATE TABLE "transaction" (
    transaction_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    initiated_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP
);

COMMENT ON COLUMN "transaction".initiated_date IS 'Calendar date the transaction happened, independent of time zone.';

-- Journal record table for individual debit/credit entries
CREATE TABLE journal_record (
    record_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    transaction_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    member_id INTEGER,

    currency TEXT NOT NULL,
    amount DECIMAL(18,8) NOT NULL,
    amount_usd DECIMAL(18,8) NOT NULL,

    category_id INTEGER NOT NULL,
    tag_ids INTEGER[] NOT NULL DEFAULT [],

    memo TEXT,

    pending_date TIMESTAMP,
    posted_date TIMESTAMP,

    posting_status posting_status NOT NULL,
    reconciliation_status reconciliation_status NOT NULL DEFAULT 'RECONCILED',

    source source NOT NULL,

    external_id TEXT,
    external_system TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP
);

COMMENT ON COLUMN journal_record.pending_date IS 'UTC timestamp when the record appeared as pending.';
COMMENT ON COLUMN journal_record.posted_date IS 'UTC timestamp when the record posted.';

-- Exchange rate table for historical currency conversion
CREATE TABLE exchange_rate (
    exchange_rate_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate DECIMAL(18,8) NOT NULL,
    effective_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    UNIQUE(from_currency, to_currency, effective_date, tombstoned_at)
);

COMMENT ON COLUMN exchange_rate.effective_date IS 'UTC timestamp when the exchange rate becomes effective.';

-- Budget table for monthly category budgets
CREATE TABLE budget (
    budget_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    category_fqn TEXT NOT NULL,
    month DATE NOT NULL,
    amount DECIMAL(18,8) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    UNIQUE(category_fqn, month, tombstoned_at)
);

COMMENT ON COLUMN budget.month IS 'Budget month, stored as the first calendar date of that month.';

-- Credit limit history table for tracking limit changes over time
CREATE TABLE credit_limit_history (
    credit_limit_history_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    account_id INTEGER NOT NULL,
    credit_limit DECIMAL(18,8) NOT NULL,
    effective_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    UNIQUE(account_id, effective_date, tombstoned_at)
);

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

CREATE UNIQUE INDEX credit_limit_history_active_account_date_unique
ON credit_limit_history ((CASE WHEN tombstoned_at IS NULL THEN CAST(account_id AS VARCHAR) || ':' || CAST(effective_date AS VARCHAR) ELSE NULL END));

CREATE UNIQUE INDEX exchange_rate_active_pair_date_unique
ON exchange_rate ((CASE WHEN tombstoned_at IS NULL THEN from_currency || ':' || to_currency || ':' || CAST(effective_date AS VARCHAR) ELSE NULL END));

CREATE UNIQUE INDEX budget_active_category_month_unique
ON budget ((CASE WHEN tombstoned_at IS NULL THEN category_fqn || ':' || CAST(month AS VARCHAR) ELSE NULL END));
```

## Hierarchical Names Encoding

Accounts, categories, and tags use hierarchical naming with colon-separated paths:

- `checking:Chase:Primary`
- `Food:Restaurants:FastFood`
- `Trips:Vacation:Summer2024`

Hierarchy is encoded directly in the name string. Tree structure is derived at query time when needed.
