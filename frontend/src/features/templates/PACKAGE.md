# frontend/src/features/templates

## Purpose

- Owns transaction-template resource snapshots and management workflows.

## Implicit Contracts

- One transient complete template snapshot is shared by the command palette and unfiltered Templates-page rendering; entry selection and queried management results use independent current reads.
- The snapshot consumes server-derived compatible shorthand types; transaction entry filters by active tab and mechanically copies matching raw record defaults without classifying them in the browser.
- Successful template mutations update an existing complete snapshot synchronously, refresh it, and reload the current queried management tree; failed refreshes preserve previously loaded choices.
- Compatibility-changing account updates invalidate the snapshot so server-derived shorthand compatibility is reloaded before reuse.
- Pages own the `/templates` route, its search URL state, and restructure workflow; the app shell owns the route-independent editor launch. Create and edit drafts are never persisted or URL-backed.
- The Templates page sends its URL-owned query through the list API without also loading the complete snapshot, follows every result page, and passes backend-filtered canonical leaves to the shared reference tree without local matching or reordering; new-query loads stay independent from complete-snapshot identity and retain the last filtered tree while refetching, while retries and refresh failures also retain that tree. Rows retained across a successful mutation stay non-actionable until a matching filtered snapshot replaces them. A failed first query shows a load error without falling back to the complete snapshot, filtered Retry repeats the filtered request, and a removed focused row falls back to the visible search field or compact Controls trigger.
- Deferred initial focus yields to a control already used in the editor; lookup retries preserve that latest control across recovery.
- Template records are partial defaults: every field is independently optional; caller-retained selected options keep hidden current values displayable, while entity-specific ranked-search contexts exclude hidden fresh choices and tombstoned references.
- A failed broader lookup snapshot does not block saving reference IDs; existing per-entity detail reads resolve selected presentation independently, while ordinary mutation validation remains authoritative.
- Transaction capture maps active records in response order and copies only account, category, member, currency, native amount, tags, and memo; dates and transaction-only metadata never enter the draft.
- Create recurring copies each active template record's supplied defaults into a new definition draft without filling absent partial values.
- Edit preserves the FQN; hierarchy changes remain owned by restructure.

## Boundaries

- Owns template management UI, template-specific mutation refresh, and template summaries.
- Does not own the Templates route, hierarchy restructuring, transaction entry behavior, generated REST setup, or backend validation.
