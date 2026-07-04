Review UI rendering changes against the ground-truth design docs: `docs/webui-design.md` and `docs/webui-theme-arcade-cabinet.md`. Read both first; when the diff and the docs disagree, the docs win — flag the code, and never propose editing or reverting the docs themselves.

Flag problems when:

- Two visual treatments exist for the same element class — for example a custom tooltip while native `title` attributes survive elsewhere, or a second style of chip, badge, or overlay when the theme documents exactly one.
- A fix or treatment is applied to one variant of a rendering but not its siblings — for example amount containment or marker de-emphasis applied to the single-amount chip but not the mixed/compact chip. Check every variant that renders the same kind of content.
- Case transforms are applied to user-derived content (account names, titles, memos, tags); the theme reserves uppercase for static headings and labels.
- Hardcoded colors, shadows, or fonts appear where the theme defines tokens, or shadcn/Tailwind semantic tokens are bypassed.
- Long content escapes its container at supported viewport widths, or is truncated without the documented overflow affordance (single line, `…` indicator, full value reachable via tooltip). Amounts must never truncate digits.
- The UI renders fields the design explicitly defers to a later phase, or invents placeholder data the backend does not provide.
- Fixed neighboring elements (footers, rails, floating controls) use inconsistent insets or spacing where the design specifies a shared value.
- Library primitives are wired against their documented pattern — for example per-instance providers where the design relies on app-level grouping behavior.

Report problems only - no positive observations.
