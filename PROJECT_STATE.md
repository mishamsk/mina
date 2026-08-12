# Project State

## Accounting and reference data

- REST implements the household chart: hierarchical accounts, categories, tags, transaction templates, and flat household members; each supports the applicable create, read, update, list, delete, visibility, featured, and FQN restructure flows. Group visibility derives from active leaves, restructures rewrite whole subtrees atomically, and category moves also rewrite active budget category paths.
- Accounts have `owned`, `party`, `flow`, or fixed `system` types; categories have `expense` or `income` intent. System accounts are readable but immutable. Accounts may be single- or multi-currency, and only single-currency accounts carry credit-limit history.
- Applicable reads and list defaults are tombstone-aware and exclude hidden resources unless requested. Delete eligibility is surfaced rather than assumed, and all write-time reference and accounting-semantic checks remain service-owned.
- REST provides account balances, prefix registers, journal-record search, and server-derived month spend/income totals. Balances include native amounts, approximate USD aggregation, unconverted counts, and current credit-limit standing; month totals cover categorized flow records only.
- REST provides configurable household, Category, and Tag flow reports with scope-specific net semantics, movable anchored month/year windows, a separate global accounting-history range, ranked Account/Category breakdowns, stable server-applied contributor filters, selectable rolling trends, conversion disclosure, transfer exclusion, and fixed entity transaction previews.

## Ledger, rates, and lifecycle

- REST supports balanced journal transactions as full entries and as spend, income, refund, transfer, and two-currency exchange shortcuts. Writes can infer non-USD `amount_usd` from stored USD-pair rates; unresolved amounts remain unconverted.
- Transactions support record-currency and other record/transaction filters, pagination, date anchoring, and free-text search; full replacement; independent derived class, shape, role, and display metadata; dry-run classification; and record-level bulk category, tag, member, account, settlement, and reconciliation updates.
- Active transactions can be cancelled and restored; deletion is a separate tombstone action. Owned and party records carry pending/posted settlement dates. Expected recurring transactions are excluded from ordinary lists unless explicitly selected.
- Source exchange rates have CRUD and a read-only dense daily USD-rate snapshot. Loading identifies needed currencies, refreshes the snapshot, and backfills resolvable missing USD values.
- Refund and reimbursement record links are metadata-only pairwise associations. Imported-record storage retains provider-neutral metadata, raw provider payload, and external provenance; it does not imply a delivered import workflow.

## Reusable and scheduled transactions

- Transaction templates are hierarchical, versioned through full replacement, and stored as active/tombstoned templates with partial journal-record defaults. Template moves preserve the template FQN.
- Recurring definitions support schedule creation/replacement, pause/resume, defer, confirmation, cancellation, and occurrence review. Materialized occurrences are permanent, create linked EXPECTED transactions, and can be confirmed or dismissed.

## REST and client surfaces

- The REST API is OpenAPI-defined, exposes the implemented accounting, reference, template, recurring, rates, operation, settings, demo, health, and authentication contracts, and serves its generated spec at `/api/openapi.json`. Transport validation and stable machine-readable JSON errors are in place.
- Generated REST-backed CLI and MCP catalogs independently select exposure for every OpenAPI operation. Both expose the delivered accounting/reference, rate, template, recurring, journal-record, settings, and background-operation flows; browser authentication is REST/UI-only, demo seeding and health are CLI-only, and MCP deliberately omits per-rate-ID reads.
- `mina client --server URL` is a remote JSON CLI with optional `MINA_API_KEY`. `mina client --db PATH` runs the same selected REST operations against a one-shot in-process app: it has no listener, authentication, startup validation, or automatic operations, but waits for its manually-triggered exchange-rate or backup run to finish.
- `mina mcp stdio --server URL` is remote-only and uses an API key when authentication is enabled. `mina serve` also hosts the same registry as API-key-only Streamable HTTP MCP at `/mcp`; its origin policy permits no `Origin` but rejects non-loopback origins. Both transports publish shared accounting and mutation-safety instructions. No hand-written client-surface extensions ship.

## Web UI

- `mina serve` embeds the React UI at `/`; canonical root routes replace the legacy `/ui/` prefix. The shell resolves authentication status before rendering, uses server `HttpOnly` cookie sessions, and returns to login after a protected-request `401`.
- The browser provides an overview with configurable household flow, active owned/party balances, and monthly activity; a persistent featured-account strip; searchable account, category, tag, and member management; account/group registers; configurable Category/Tag flow overviews; member transaction drill-downs; and a Status screen for health, settings, and background operations. Account display-label overrides affect presentation only; hierarchy, navigation, and disambiguation remain FQN-based.
- Transaction browsing and account/group registers share one URL-addressable full transaction detail with native/USD display, lifecycle and settlement indicators, and the same actions. Transaction browsing focuses changing detail, while registers retain record-row focus for arrow-key browsing. Transaction browsing adds filters, date navigation, and selection-based reference/status edits; transaction entry is a route-independent modal for spend, income, refund, transfer, exchange, and advanced balanced entries, including pending creation, compatible template defaults, draft clearing, edit/duplicate, split, post, and cancel flows.
- The UI manages hierarchical templates and recurring definitions/occurrence review, including template use and reusable partial defaults. Hierarchical pickers support FQN navigation, intent-aware account/category selection, exact-path fallback, batching, and eligible leaf creation.
- UI data remains REST-backed. IndexedDB holds only UI preferences, UI caches, and draft state; it never stores credentials or accounting data. The browser exposes substantial human workflows, not a claim of full REST parity.

## Runtime, operations, and deployment

- One long-running app instance composes REST, embedded UI, and embedded MCP. It opens/migrates accounting state before serving, starts configured background and startup work without blocking readiness, records app-local operation status, and cancels and joins work during shutdown.
- Exchange-rate loading starts from the configured Frankfurter cache and supports scheduled and manual targeted refreshes. Database backup runs manually, and on a schedule when configured; they copy only file-backed accounting databases to configured local targets and preserve database encryption.
- Startup demo seeding can provision realistic, date-anchored transactions, templates, recurring definitions, and expected occurrences in new state only. File-backed startup refuses demo seeding when the selected accounting schema already exists.
- Long-running file-backed startup runs configured `none`, `shallow`, or `full` validation after migration (`shallow` by default). `mina db validate` is a separate offline, read-only CLI diagnostic; neither is a REST capability. Runtime settings report the immutable resolved startup values, sources, and config-file location.
- Optional file-backed authentication is loaded once at startup from a separate, CLI-administered file. REST accepts browser sessions or revocable API keys; external MCP accepts API keys only. Authentication administration, auth state, API-key secrets, and database encryption keys are outside the accounting database and absent from ordinary settings output.
- The Docker image and Compose deployment support a noninteractive fresh installer, private generated bootstrap credentials and automation API key, authenticated encrypted storage, host UID/GID operation, read-only root filesystem, separate config/backup binds, named database/cache volumes, and localhost-only publishing by default. Mina serves plain HTTP, so non-loopback exposure requires a trusted network or TLS-terminating reverse proxy.

## Storage and process boundaries

- Accounting state is DuckDB in a selected schema, either attached from one portable database file or held in the process in-memory database. Upgrade-only migrations and schema-version tracking apply to that accounting location; multi-row ledger changes persist atomically.
- File-backed databases are plaintext unless `MINA_DATABASE_ENCRYPTION_KEY` is supplied, when DuckDB AES-256-GCM is used. The key is environment-only; Status reports encryption state without revealing it.
- Each app also owns an opaque in-memory runtime schema for disposable operation runs and dense exchange-rate data. It is outside portable accounting state, migrations, backups, and database validation.
- Store code owns DuckDB lifecycle mechanics, qualified SQL, migrations, transactions, repository conversion, dynamic query allowlists, and database-error mapping. Accounting semantics, validation, and transport mappings remain outside the store.
