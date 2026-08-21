# frontend/src/features/templates

## Purpose

- Owns transaction-template resource snapshots and management workflows.

## Implicit Contracts

- One transient template snapshot is shared by the Templates page, transaction entry, and command palette.
- The snapshot consumes server-derived compatible shorthand types; transaction entry filters by active tab and mechanically copies matching raw record defaults without classifying them in the browser.
- Successful template mutations update an existing snapshot synchronously, then refresh it; failed refreshes preserve previously loaded choices.
- Compatibility-changing account updates invalidate the snapshot so server-derived shorthand compatibility is reloaded before reuse.
- Pages own the `/templates` route, its search URL state, and restructure workflow; the app shell owns the route-independent editor launch. Create and edit drafts are never persisted or URL-backed.
- Deferred initial focus yields to a control already used in the editor; lookup retries preserve that latest control across recovery.
- Template records are partial defaults: every field is independently optional, active hidden references already selected on a record remain resolvable, fresh choices exclude hidden references, and tombstoned references are unavailable.
- Transaction capture maps active records in response order and copies only account, category, member, currency, native amount, tags, and memo; dates and transaction-only metadata never enter the draft.
- Create recurring copies each active template record's supplied defaults into a new definition draft without filling absent partial values.
- Edit preserves the FQN; hierarchy changes remain owned by restructure.

## Boundaries

- Owns template management UI, template-specific mutation refresh, and template summaries.
- Does not own the Templates route, hierarchy restructuring, transaction entry behavior, generated REST setup, or backend validation.
