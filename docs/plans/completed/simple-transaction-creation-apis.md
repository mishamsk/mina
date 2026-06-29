# Simple Transaction Creation APIs

## Plan Context

- Kata gxdv scope: add focused create APIs for common transaction input patterns.
- Additive API only: keep `POST /api/transactions` as the complete multi-record write path.
- Shorthand creates should return the existing `Transaction` response and persist ordinary journal records.
- Scope is same-currency two-record creates for spend, income, refund, and transfer.
- Explicitly exclude exchange, fees, adjustment, imports, and replace shorthand.
- Shorthand `amount` inputs are positive absolute values; the backend applies debit/credit signs.
- Shorthand APIs never accept `amount_usd`.
- Delegate signed `amount_usd` generation to a new exchange-rate service API. Initial behavior only copies signed USD record amounts; non-USD records return empty until proper exchange-rate inference and backfill is implemented separately in Kata 56ee.
- Default shorthand records to `source=manual`, `posting_status=posted`, and `reconciliation_status=reconciled`; allow status/date overrides only where they map cleanly to both generated records.

## Tasks

### Commit 1: Add Service-Owned Shorthand Builders And USD Derivation

- [x] Add exported transaction service input types for:
  - [x] spend: funding balance account, counterparty flow account, expense category
  - [x] income: destination balance account, source flow account, income category
  - [x] refund: destination balance account, counterparty flow account, refund category
  - [x] transfer: source balance account, destination balance account, transfer category
- [x] Add `Service` create methods that build existing `CreateInput` values and delegate to `Create`.
- [x] Add a narrow exchange-rate service API for signed `amount_usd` generation.
  - [x] USD record: signed `amount_usd` equals signed `amount`
  - [x] Non-USD record: `amount_usd` is unset
  - [x] Do not read stored exchange rates or trigger external exchange-rate loading from transaction creation
  - [x] Leave a TODO pointing to Kata 56ee for non-USD inference, backfill, and rate-selection semantics
- [x] Add a narrow transaction-service dependency on that exchange-rate service API and use it while constructing shorthand records.
- [x] Keep shorthand validation domain-owned:
  - [x] require positive `amount`
  - [x] reject equal source/destination accounts for transfer
  - [x] rely on existing active-reference and semantic-shape validation after record construction
- [x] Apply common fields consistently to both generated records: category, member, tags, memo, currency, dates, statuses, and manual source.
- [x] Do not change transaction persistence, migrations, or full transaction creation behavior.
- [x] Update transaction package docs only if the shorthand builder contract is not obvious from exported API docs.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required package docs updated if needed
  - [x] Commit changes

### Commit 2: Add REST Contract And Handlers

- [x] Add OpenAPI paths:
  - [x] `POST /api/transactions/spend`
  - [x] `POST /api/transactions/income`
  - [x] `POST /api/transactions/refund`
  - [x] `POST /api/transactions/transfer`
- [x] Add request schemas with minimal UI-facing fields:
  - [x] `initiated_date`
  - [x] endpoint-specific account IDs
  - [x] `category_id`
  - [x] `currency`
  - [x] positive `amount`
  - [x] optional `member_id`, `tag_ids`, `memo`, `pending_date`, `posted_date`, `posting_status`, and `reconciliation_status`
- [x] Keep `amount_usd`, `external_id`, `external_system`, `source`, and record arrays out of shorthand requests; callers needing those use full transaction creation.
- [x] Regenerate generated clients and server types:
  - [x] `just openapi`
  - [x] `just frontend-openapi`
- [x] Implement thin strict-server handlers in `internal/httpapi` that parse DTOs and call the new service methods.
- [x] Add app-test coverage through the generated REST client:
  - [x] spend creates `spend` transactions with negative funding and positive counterparty records
  - [x] income creates `income` transactions with positive destination and negative source records
  - [x] refund creates `refund` transactions with positive destination and negative counterparty records
  - [x] transfer creates `transfer` transactions with negative source and positive destination records
  - [x] default statuses/source are applied to both records
  - [x] optional member, tags, memo, dates, and statuses are mapped to generated records with correct signs
  - [x] `amount_usd` is copied for USD records and omitted for non-USD records
  - [x] created transactions are readable through get/list/search using the existing response shapes
  - [x] invalid positive-amount, duplicate transfer account, missing reference, and wrong semantic-shape requests return standard JSON invalid-request errors
- [x] Keep existing full transaction create/replace tests passing unchanged.
- [x] Verification
  - [x] `just openapi-check` passes
  - [x] `just frontend-openapi-check` passes
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just pre-commit` passes
  - [x] Commit changes

### Commit 3: Update Project State

- [x] Add a short `PROJECT_STATE.md` API capability bullet for shorthand transaction create endpoints.
- [x] Do not change architecture or business requirements docs unless implementation discovers a real evergreen contract gap.
- [x] Add a Kata progress comment with the implemented endpoint set and verification summary.
- [x] Verification
  - [x] `just pre-commit` passes if docs-only hooks require it
  - [x] Commit changes

## Final Verification

- [x] `just init` passes on a clean checkout with required local tools available
- [x] `just openapi-check` passes
- [x] `just frontend-openapi-check` passes
- [x] `just fmt` passes
- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Run `just test-frontend-e2e` only if implementation wires these APIs into frontend runtime behavior (not required; no frontend runtime wiring)
- [x] Commit final changes
- [x] Run `just review-loop "simple transaction creation APIs; additive spend income refund transfer endpoints; exchange shorthand explicitly excluded; amount_usd delegated to exchange-rate service with USD-only initial behavior; full transaction creation remains canonical"`
- [x] Address unresolved review comments without re-running review
- [x] Close Kata gxdv with commit and verification evidence
- [x] Move this plan to `docs/plans/completed/`
