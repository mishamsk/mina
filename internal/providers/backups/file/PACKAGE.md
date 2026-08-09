# github.com/mishamsk/mina/internal/providers/backups/file

## Purpose

- Implements the local-filesystem destination for database backups.

## Implicit Contracts

- Copies write to a unique temp file in the destination directory, then rename it to a UTC timestamped `mina-backup-…Z.duckdb` name; final-named backups are never partial copies.
- A failed copy or finalization removes the temp file it created.
- Zero retention disables pruning. Positive retention removes the oldest matching backup names while preserving the backup just finalized, even if its requested timestamp sorts older.
- Pruning identifies candidates only by the provider filename pattern, so matching files in the destination directory are eligible for removal regardless of provenance.
- Source-copy errors pass through; configuration and destination failures use the backup service's provider error taxonomy.

## Boundaries

- Owns filesystem destination lifecycle, filename policy, and retention pruning.
- Delegates database copying to the service-owned `backups.Source`; it does not access the store or choose whether backups run.
