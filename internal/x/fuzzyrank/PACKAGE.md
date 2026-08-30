# github.com/mishamsk/mina/internal/x/fuzzyrank

## Purpose

- Provides pure, entity-neutral text matching for list membership and deterministic candidate ordering for ranked discovery.

## Implicit Contracts

- Queries and terms are trimmed and case-folded for exact, prefix, substring, and edit-distance comparison; subsequence matching additionally uses the wrapped library's Unicode normalization.
- Typo tolerance grows with normalized query length: one edit through four runes, two edits from five through eight runes, and three edits from nine runes onward.
- Entity terms consist of the effective title plus, for hierarchical entities, the complete FQN and each segment. Ranked search and unordered list membership use the same best tier across those terms: exact, prefix, substring, ascending accepted edit distance, then normalized case-folded subsequence. Multi-token subsequences match distinct whitespace-delimited words or FQN segments in order; empty queries retain every candidate.
- Equal tiers order by title, qualified name, then stable string ID; bounded results retain a literal exact-FQN candidate even when equal-tier ordering would otherwise truncate it.

## Boundaries

- Owns: normalization, entity-term construction, the `github.com/lithammer/fuzzysearch/fuzzy` wrapper, match-tier classification and membership, entity-neutral deterministic ordering, and exact-FQN-preserving result bounds.
- Does not own: Mina entity kinds, data loading, consuming surfaces, eligibility, hierarchy derivation, service errors, relevance inputs, or transport mapping.
