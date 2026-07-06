# internal/services/dbvalidation

## Purpose

- Orchestrates offline and startup accounting database validation.
- Owns validation findings, severities, layer gating, and report formatting.

## Implicit Contracts

- Embedded migration SQL hash mismatch is a validator-internal exit-2 failure.
- Validation layers run schema, referential, SQL invariants, classification; only error findings stop later layers.
- Missing table `UNIQUE` constraints are warnings because active-row uniqueness is guarded by partial unique indexes; primary-key presence is reported by table diff.
- Startup validation supports `none`, `shallow`, and `full`; the default is owned by `internal/appconfig`.
- Non-checks: posted date/status consistency; record currency vs account currency; exchange-rate self-pairs; parent FQN existence; budget month/sign rules; amount_usd derivation correctness.

## Boundaries

- Owns: validation orchestration and user-facing diagnostic reports.
- Does not own: DuckDB catalog queries, migration embeds, or raw database SQL.

## Testing Notes

- Covered through `cmd/mina/testdata/script/mina_db_validate.txt`.
