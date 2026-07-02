# Backend Transaction Templates

## Plan Context

- Kata issue: `ga4g` "Create transaction templates".
- Backend-only capability for hierarchical, date-free reusable transaction record defaults used by manual entry.
- Transaction templates are not recurring transactions: no schedule, cadence, due date, next-run state, or generated transaction source belongs in this model.
- Store template records as normalized child rows instead of a JSON blob so future imported-transaction matching can query existing account, category, tag, memo, currency, and optional amount defaults without adding matching-only fields now.
- Template records intentionally omit concrete transaction dates, banking dates, source, external IDs, and matching rules.
- A template is not required to be a complete transaction. It may contain one side of a transaction, partial records, missing amounts, missing accounts, missing tags, or other omitted defaults.
- Each template owns a unique hierarchical `fqn`, using the same colon-separated organization pattern as categories and tags.
- Each template must contain at least one record default. Each record default must have a category; every other record field is optional and independently nullable.
- Template records do not store `amount_usd`; USD conversion is inferred when an actual transaction is created or updated.

## Proposed DDL

```sql
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

CREATE TABLE transaction_template_record (
    transaction_template_record_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    transaction_template_id INTEGER NOT NULL,
    -- Category is the minimum record default required for manual-entry templates.
    category_id INTEGER NOT NULL,
    account_id INTEGER,
    member_id INTEGER,
    currency TEXT,
    amount DECIMAL(18,8),
    tag_ids INTEGER[] NOT NULL DEFAULT [],
    memo TEXT,
    posting_status posting_status,
    reconciliation_status reconciliation_status,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP
);

COMMENT ON COLUMN transaction_template.fqn IS 'Colon-separated hierarchical template path, e.g. Utilities:Electric.';
COMMENT ON COLUMN transaction_template.parent_fqn IS 'Parent template path derived from fqn, or NULL for root templates.';
COMMENT ON COLUMN transaction_template.name IS 'Leaf template name derived from fqn.';
COMMENT ON COLUMN transaction_template.level IS 'Zero-based template depth derived from fqn.';
COMMENT ON COLUMN transaction_template_record.category_id IS 'Category is the minimum record default required for manual-entry templates.';

CREATE UNIQUE INDEX transaction_template_active_fqn_unique
ON transaction_template ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));
```

## Tasks

### Commit 1: Add Transaction-Template Domain And Storage

- [x] Add `internal/services/transactiontemplates`.
  - [x] Define `Template`, `TemplateRecord`, create/replace inputs, list options, repository contract, and service methods for create, get, list, replace, and delete.
  - [x] Use `FQN`, `ParentFQN`, `Name`, and `Level` fields on `Template`, matching the category/tag hierarchy response shape.
  - [x] Reuse existing transaction status domain types for optional default `posting_status` and `reconciliation_status`.
  - [x] Validate template `fqn` as a non-empty colon-separated path without empty segments or surrounding whitespace, matching category/tag FQN rules.
  - [x] Validate each template has at least one record.
  - [x] Require `category_id` on every record and validate it is positive.
  - [x] Treat `account_id`, `member_id`, `currency`, `amount`, `tag_ids`, `memo`, `posting_status`, and `reconciliation_status` as independent optional defaults.
  - [x] Validate optional account/member/tag IDs as positive and tag IDs as unique per record when present.
  - [x] Validate optional currency with existing value helpers when present.
  - [x] Validate optional `amount` values as non-zero decimals when present.
  - [x] Validate optional memo whitespace and optional status enum values when present.
  - [x] Do not require balanced amounts, two-sided records, account/category semantic classification, or a complete journal-record shape.
- [x] Add store migration `internal/store/migrations/00010_create_transaction_template.sql`.
  - [x] Create `transaction_template` with `transaction_template_id`, `fqn`, audit timestamps, and `tombstoned_at`.
  - [x] Add generated virtual `parent_fqn`, `name`, and `level` columns to `transaction_template`, matching category/tag hierarchy derivation.
  - [x] Create `transaction_template_record` with `transaction_template_record_id`, `transaction_template_id`, required `category_id`, nullable `account_id`, nullable `member_id`, nullable `currency`, nullable `amount`, `tag_ids INTEGER[] NOT NULL DEFAULT []`, nullable `memo`, nullable `posting_status`, nullable `reconciliation_status`, audit timestamps, and `tombstoned_at`.
  - [x] Add active-FQN uniqueness for non-tombstoned templates, using the existing active-row expression-index pattern only as an integrity constraint.
  - [x] Do not add lookup/performance indexes for template records; expected cardinality is tiny and deterministic scans are simpler.
  - [x] Add short column comments only where they clarify hierarchical FQN, date-free templates, required category, or optional partial-record defaults.
- [x] Update `docs/data-model.md` with the implemented transaction-template DDL.
- [x] Add `internal/store` repository implementation.
  - [x] Create templates and records atomically.
  - [x] Replace templates atomically by updating template metadata, tombstoning active record rows, and inserting the replacement record set.
  - [x] List active templates in deterministic FQN order with nested active records.
  - [x] Get active templates with nested active records.
  - [x] Tombstone templates and active child records.
  - [x] Recheck active account/category/member/tag references inside write transactions.
  - [x] Map active-FQN conflicts and missing references to stable service errors.
- [x] Update package docs only where implicit contracts changed.
  - [x] Add `internal/services/transactiontemplates/PACKAGE.md`.
  - [x] Update `internal/services/PACKAGE.md` to list the new service package.
  - [x] Update `internal/store/PACKAGE.md` for normalized template storage and reference checks if needed.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated
  - [x] Commit changes

### Commit 2: Expose Transaction-Template REST APIs

- [x] Extend `api/openapi.yaml`.
  - [x] Add `GET /api/transaction-templates`.
  - [x] Add `POST /api/transaction-templates`.
  - [x] Add `GET /api/transaction-templates/{transaction_template_id}`.
  - [x] Add `PUT /api/transaction-templates/{transaction_template_id}` for full replacement.
  - [x] Add `DELETE /api/transaction-templates/{transaction_template_id}`.
  - [x] Add request/response schemas for templates and template records.
  - [x] Require `fqn` on template create/replace requests and return `fqn`, `parent_fqn`, `name`, and `level` in template responses.
  - [x] Require `category_id` on template record requests.
  - [x] Make all other template record fields optional or nullable, including account, member, currency, amount, tags, memo, posting status, and reconciliation status.
  - [x] Keep template record schemas date-free and omit source, external IDs, and recurring fields.
  - [x] Use nullable decimal strings for optional `amount` defaults.
  - [x] Add typed list params for `sort`, `sort_dir`, `limit`, and `offset`; allow `fqn`, `created_at`, and `updated_at`, defaulting to `fqn`.
- [x] Regenerate API clients and server contracts.
  - [x] Run `just openapi`.
  - [x] Run `just frontend-openapi`.
- [x] Add HTTP adapter wiring.
  - [x] Add transaction-template service dependency to `internal/httpapi.Dependencies`.
  - [x] Add strict-server handlers and DTO mappers in `internal/httpapi`.
  - [x] Parse nullable decimal fields in the adapter and keep domain validation in the service.
  - [x] Preserve absent-vs-null optional fields only where generated DTOs expose that distinction; service semantics treat both as omitted defaults.
  - [x] Map service errors to existing JSON error envelopes through existing error handling.
- [x] Wire runtime composition.
  - [x] Construct the store and service in `internal/runtime`.
  - [x] Pass the service into HTTP dependencies.
- [x] Verification
  - [x] `just openapi-check` passes
  - [x] `just frontend-openapi-check` passes
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just pre-commit` passes
  - [x] Commit changes

### Commit 3: Cover Runtime Behavior And Product Docs

- [x] Add `app-tests` in `internal/apptest/runtime/transaction_template_test.go`.
  - [x] Create, read, and list a template with hierarchical FQN and one record containing only the required category.
  - [x] Create, read, and list a partial one-sided template with category, merchant account, amount, memo, and tags.
  - [x] Create, read, and list a fuller two-record template to prove rich defaults are still stored without requiring balance.
  - [x] Replace a template and verify previous active records are no longer returned.
  - [x] Delete a template and verify subsequent active reads return not found.
  - [x] Verify duplicate active FQNs return conflict.
  - [x] Verify hierarchy response fields `parent_fqn`, `name`, and `level`.
  - [x] Verify invalid IDs, duplicate tag IDs, invalid currency, whitespace FQNs/memos, unsupported statuses, missing records, and missing record category return invalid request.
  - [x] Verify unbalanced amounts, one-sided records, and mixed present/missing fields are accepted when each provided field is individually valid.
  - [x] Verify required category references and any provided account/member/tag references return invalid request when missing or tombstoned.
  - [x] Verify hidden but active account/category/tag references remain selectable.
  - [x] Verify generated-client transport validation for missing required fields, unknown fields, bad path IDs, and invalid list query values.
- [x] Add `internal/apptest` scenario helpers only if at least two tests need the same setup.
- [x] Update docs for the delivered capability.
  - [x] Update `PROJECT_STATE.md` with transaction-template API and storage behavior.
  - [x] Update `docs/business-requirements.md` Phase 2 wording to define templates as hierarchical, date-free, category-bearing manual-entry defaults and separate from recurring transactions.
  - [x] Update package docs for any new implicit contracts discovered during implementation.
- [x] Verification
  - [x] `just openapi-check` passes
  - [x] `just frontend-openapi-check` passes
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just test-frontend-e2e` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated
  - [x] Commit changes

## Final Verification

- [x] `just init` passes on a clean checkout with required local tools available
- [x] `just openapi-check` passes
- [x] `just frontend-openapi-check` passes
- [x] `just fmt` passes
- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just test-frontend-e2e` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "implement backend transaction templates; flexible hierarchical category-bearing defaults; not recurring transactions; no matching-only fields"`
- [x] Move this plan to `docs/plans/completed/`
