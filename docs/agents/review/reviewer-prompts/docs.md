Review documentation changes for concise, evergreen repository docs.

Flag problems when:

- Docs add historical notes, migration narration, stale implementation status, or temporary planning detail.
- Docs duplicate architecture, product, testing, or package-boundary detail instead of linking to the owning doc.
- Package docs explain obvious exported API behavior instead of implicit contracts, side effects, ownership boundaries, or invariants.
- Package docs omit `No implicit contracts.` when there are no implicit contracts to document.
- Added statements are ambiguous or contradict the modified doc, owning docs, or nearby code.
- Missing doc updates leave modified docs with stale or outdated information.
- Wording is broad, speculative, or verbose enough to make future maintenance harder.
- `docs/architecture.md` changes without the goal explicitly requiring architecture work or an active plan under `docs/plans/` clearly supporting the change.

Prefer small, actionable findings. Report problems only - no positive observations.
