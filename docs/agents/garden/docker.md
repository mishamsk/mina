# Docker Documentation Gardening

Edit the one target Docker document into the smallest accurate guide to Mina's supported image, Compose deployment, installer, initialization, and lifecycle contracts. Preserve its useful Docker-specific headings; do not force it into the Go package template.

Keep a statement only when it is true in current Dockerfiles, Compose files, scripts, workflows, or runtime behavior; owned by this deployment context; and useful for preventing an operator or maintainer mistake. Preserve or add non-obvious contracts involving durable versus rebuildable state, initialization and retry safety, secrets, permissions, identities, mounts, destructive operations, image contents, signals, networking, supported architectures, publication, and lifecycle verification.

Remove or replace:

- Invalid, unproven, or misplaced deployment claims.
- Historical comparison and transition prose. State only the supported current behavior, not how it differs from a former image or Compose design.
- Repeated hardening, persistence, initialization, or verification details that can be expressed once under the narrowest owning heading.
- Exhaustive command, flag, artifact, or test-step inventories when a durable contract states the same operational consequence.
- Implementation narration and generic testing prose.

Keep explicit carve-outs and negative decisions when they remain current and surprising: destructive boundaries, overwrite refusals, unsupported platforms or tag forms, absent environment surfaces, security exceptions, and operator responsibilities. Do not remove a safety rule merely because a broader architecture document states the general principle.

Compact aggressively without merging distinct security, durability, or recovery guarantees. Keep bullets short and evergreen, preserve only useful headings, and do not record audit evidence or reasoning in the target document. Leave it unchanged when no evidence-backed improvement exists or the only findings are stylistic.
