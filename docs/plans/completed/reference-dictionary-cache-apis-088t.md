# Reference Dictionary Cache APIs 088t

## Plan Context

- Kata 088t adds service-owned, process-local reference dictionary cache APIs for accounts, categories, tags, and household members.
- Reference integrity belongs in services; store code should not own foreign-key-like active-reference prechecks.
- Current write flows validate member, tag, account, and category references through service-owned reference APIs.
- Hidden active accounts, categories, and tags remain valid for write references; missing or tombstoned references remain invalid.
- Credit-limit account-reference failures should preserve the current public `not_found` behavior.
- Related issue `arrf` remains the owner for adding new blocked-delete/tombstone-protection behavior unless this task is explicitly expanded.

## Tasks

### Commit 1: Add service-owned reference dictionary caches
- [x] Add exported reference DTOs and documented reference-validation methods to `internal/services/accounts`, `categories`, `tags`, and `members`.
- [x] Prefer plural validation APIs that deduplicate IDs and return maps keyed by ID; add single-ID wrappers only when they keep callers clearer.
- [x] Include semantic fields needed by write use cases:
  - [x] Accounts: account ID, account type, hidden state.
  - [x] Categories: category ID, economic intent, hidden state.
  - [x] Tags: tag ID, hidden state.
  - [x] Members: member ID.
- [x] Make hidden-resource rules explicit in the API, with current write use cases able to allow hidden active references.
- [x] Implement process-local caches owned by each service instance; do not add package-level globals.
- [x] Hydrate caches from repository reads/lists that can observe hidden and tombstoned rows, then validate active/tombstoned state in the service API.
- [x] Update caches write-through only after successful create/update/delete operations:
  - [x] Create inserts the active reference.
  - [x] Hidden updates refresh hidden state for accounts/categories/tags.
  - [x] Tombstone deletes invalidate or mark the cached reference inactive.
- [x] Return service sentinel errors suitable for callers to map to existing public API messages.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Commit changes

### Commit 2: Route write-use reference validation through cache APIs
- [x] Update runtime composition to construct account/category/tag/member services once and pass those services to dependent services instead of passing stores directly for reference validation.
- [x] Update `internal/services/transactions` constructor interfaces to consume account, category, tag, and member reference-validation APIs.
- [x] Replace transaction create/replace dictionary list scans with cached validation for all referenced account, category, member, and tag IDs.
- [x] Keep transaction semantic classification service-owned by using cached account types and category economic intents.
- [x] Update shorthand transaction creation to validate category intent through the category reference API and rely on normal transaction validation for account/member/tag references.
- [x] Update bulk record operations:
  - [x] Bulk categorize validates target category through the category reference API before semantic validation and repository update.
  - [x] Bulk reassign validates target account through the account reference API before semantic validation and repository update.
  - [x] Bulk tag updates validate add/remove tag IDs through the tag reference API before repository update.
  - [x] Active selected-record checks remain repository-owned because journal records are not reference dictionaries.
- [x] Update `internal/services/transactiontemplates` to replace rebuilt dictionary snapshots with account/category/tag/member reference APIs.
- [x] Update `internal/services/creditlimits` to validate active account references through the account reference API before create/list repository calls, while preserving existing `account not found` public errors.
- [x] Sweep `internal/store` and remove account/category/tag/member active-reference prechecks from transaction, template, bulk, and credit-limit repositories.
- [x] Keep store-owned uniqueness checks, affected-row checks, transaction boundaries, and database constraint/error mapping backstops.
- [x] Search for remaining `active*Exists`, `validate*Reference`, and `ErrInvalidReference` call sites and confirm any survivors are persistence backstops or non-dictionary record-selection checks.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes when JSON-over-HTTP behavior or public error mapping changes
  - [x] `just pre-commit` passes
  - [x] Commit changes

### Commit 3: Cover reference behavior and update package docs
- [x] Add or extend app-tests only under `internal/apptest/runtime`; do not add unit tests or store/service tests.
- [x] Cover gaps around transaction write references:
  - [x] Missing member/tag behavior remains `400`.
  - [x] Tombstoned member/tag references are rejected on create/replace.
  - [x] Hidden active account/category/tag references remain accepted where current behavior allows them.
- [x] Cover shorthand transaction gaps for shared member/tag validation where the generated normal transaction path is not already sufficient.
- [x] Cover bulk tag updates rejecting tombstoned tag IDs.
- [x] Cover credit-limit create/list behavior for a tombstoned account, preserving `404 not_found`.
- [x] Reuse existing template tests for missing/tombstoned/hidden references; only adjust them if the API refactor changes setup helpers.
- [x] Update short package docs where implicit contracts changed:
  - [x] Dictionary service package docs mention process-local write-through reference caches.
  - [x] Transaction, template, and credit-limit package docs mention reference validation through dictionary service APIs.
  - [x] Store package docs remove statements that repositories own dictionary active-reference checks.
- [x] Do not update `PROJECT_STATE.md` unless the implementation changes delivered product capability, not just internal API ownership.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated
  - [x] Kata 088t progress updated
  - [x] Commit changes

## Final Verification

- [x] `just init` passes on a clean checkout with required local tools available
- [x] `just fmt` passes
- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "088t reference dictionary cache APIs; service-owned reference validation; store prechecks removed except persistence backstops"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata issue 088t after the plan is moved to completed
