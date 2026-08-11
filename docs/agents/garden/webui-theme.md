# Web UI Theme Gardening

Edit the one target `docs/webui-theme-arcade-cabinet.md` into the smallest accurate specification of Mina's current Arcade Cabinet theme. Preserve its ownership of visual direction, color tokens, typography, shape, depth, motion, iconography, and theme-specific treatments; keep page structure, content, and interaction behavior in `docs/webui-design.md` and technical boundaries in `docs/frontend-architecture.md`.

Verify consequential rules against the implemented frontend styles and components, `docs/frontend-architecture.md`, and the theme-agnostic presentation rules in `docs/webui-design.md`. Keep a statement only when it is current, implemented or enforced by the theme, owned by this specification, and useful for preventing visual drift or an accessibility regression.

Remove or replace:

- Invalid, unproven, stale, or duplicated theme rules.
- Phase, sequence, delivery-status, migration, implementation-history, and historical comparison language.
- Page structure, workflow, domain semantics, technical package rules, and component behavior that the design or architecture documents own.
- Exhaustive token, component, selector, file, or screen inventories when a narrower visual contract states the same consequence.
- Implementation narration and generic testing prose.

Preserve explicit contrast requirements, semantic-color restrictions, focus and reduced-motion behavior, asset constraints, and deliberate exceptions when they remain current and consequential. Keep theme-specific component notes only where a shared token or visual rule cannot express the treatment without ambiguity.

Keep the document concise and evergreen. Prefer links to owning design and architecture documents over duplicated rules, and never turn the theme specification into an implementation history or screen/component inventory. Do not record audit evidence or reasoning in the target document. Leave it unchanged when no evidence-backed improvement exists or the only findings are stylistic.
