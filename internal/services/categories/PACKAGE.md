# github.com/mishamsk/mina/internal/services/categories

## Purpose

- Owns category lifecycle, hierarchy behavior, and category-reference validation.

## Implicit Contracts

- Each service instance keeps a process-local reference snapshot for hierarchy and reference checks. Category mutations and dependent writes must share `ReferenceSerializer`; direct persistence changes must invalidate the snapshot before later service use.
- References must be active; hidden categories require an explicit allowance.
- Groups derive state from active leaves. Path hide/unhide changes only existing active leaves and invalidates the reference snapshot.
- Restructure rewrites active category leaves and active budget paths in one transaction; a budget-path collision rejects both changes.
- List deleteability and delete use the same active journal-record, template-record, and recurring-definition dependency check; tombstoned categories are never deletable.

## Boundaries

- Owns: category lifecycle rules, hierarchy validation and derivation, economic-intent validation, reference validity, and category error mapping.
- Does not own: transaction classification, budget persistence, transport DTOs, SQL queries, database row types, or process configuration.
