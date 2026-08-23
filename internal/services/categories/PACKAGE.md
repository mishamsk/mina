# github.com/mishamsk/mina/internal/services/categories

## Purpose

- Owns category lifecycle, hierarchy behavior, and category-reference validation.

## Implicit Contracts

- Each service instance keeps a process-local reference snapshot for hierarchy and reference checks. Category mutations hold the app-wide exclusive reference lease through persistence and cache publication; dependent writes use the corresponding shared lease, and direct persistence changes must invalidate the snapshot.
- References must be active; both ID and exact-FQN validation require an explicit allowance for hidden categories. Returned references retain FQN plus economic intent for dependent projections.
- Groups derive state from active leaves. Path hide/unhide changes only existing active leaves and invalidates the reference snapshot.
- Group intent inspection includes every active descendant, including hidden leaves, independently of transaction activity.
- Restructure rewrites active category leaves and active budget paths in one transaction; a budget-path collision rejects both changes.
- List deleteability and delete use the same active journal-record, template-record, and recurring-definition dependency check; tombstoned categories are never deletable.

## Boundaries

- Owns: category lifecycle rules, hierarchy validation and derivation, economic-intent validation, reference validity, and category error mapping.
- Does not own: transaction classification, budget persistence, transport DTOs, SQL queries, database row types, or process configuration.
