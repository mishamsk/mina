# Mina Base Theme: Arcade Cabinet

This document is the specification of Mina's base web UI theme. It owns visual styling: color tokens, typography, shape, depth, motion, and iconography. Structure, content, and interaction behavior are owned by `docs/webui-design.md`; this theme must satisfy its Theme-Agnostic Presentation Rules. Implementation plans for theming derive from this file.

## Direction

**Arcade Cabinet**: a dark arcade cabinet with a bright, readable screen — near-black indigo chrome around white data surfaces, candy-colored accents used as information, everything chunky: ink outlines, hard offset shadows, chip-shaped markers, banded tables, and a bold monospace voice. No bitmap fonts anywhere.

- Differentiator: unapologetically playful chrome around a ledger that is *more* readable than a conventional one — banded rows, chip markers, and bold mono labels do legibility work, not decoration.
- Doctrine: **dark cabinet, bright screen**. App chrome (sidebar, page header, grounds) is dark and saturated; every data surface is white/near-white with ink text. Long reading always happens ink-on-light.
- Color is information, never decoration: accents appear only with semantic meaning (money direction, transaction class, status, interaction, danger). Banding and chips are structure, not color-coding.

## Color System

All colors ship as CSS custom properties consumed through Tailwind v4 / shadcn semantic tokens (per `docs/frontend-architecture.md`). Values below are the contract; implementation may tune them only toward higher contrast.

### Grounds and ink

| Token | Value | Use |
| --- | --- | --- |
| `--frame` | `#1B1430` | Cabinet chrome: sidebar, top-level app frame. |
| `--ground` | `#262046` | Content-area ground behind cards/tables. A subtle pixel-grid texture is allowed here (chrome only, never behind data). |
| `--card` | `#FFFFFF` | Data surfaces: cards, panels, table bodies, inputs, chips. |
| `--band` | `#F3EFFB` | Alternating (banded) table rows and quiet secondary fills on light surfaces. |
| `--foreground` / ink | `#0F0D16` | Primary ink on light surfaces; also the universal border and shadow color. |
| `--muted-foreground` | `#6B667F` | Secondary text on light surfaces: meta, currency codes, de-emphasized path segments. |
| `--frame-foreground` | `#EDEAF7` | Primary text on `--frame`/`--ground`. |
| `--frame-muted` | `#9A94B8` | Secondary text on `--frame`/`--ground`: inactive nav, group labels. |
| `--border-ink` | `#0F0D16` | Component outlines (2px) and hard shadows. |
| `--hairline` | `#E3DEEF` | Optional light hairlines inside data surfaces (group boundaries); banding is the primary row separation. |

### Arcade accents

Every accent is a pair: an **ink form** (dark enough for text on white/band surfaces, ≥ 4.5:1) and a **bright form** (candy fill that always carries ink text). Never use a bright form as text or an ink form as a large fill.

| Accent | Ink form | Bright form | Meaning |
| --- | --- | --- | --- |
| Yellow | `#7A5D00` | `#F7E17A` | Highlights, avatar/initial tiles, adjustment class, warnings. |
| Mint | `#0E7D52` | `#6FE3B8` | Money in: income amounts and class; success states. |
| Teal | `#0A7A6E` | `#5BE0D2` | Refund class. |
| Sky | `#1A56C4` | `#92C7F5` | Transfer class, table header band, informational fills. |
| Magenta | `#A81C86` | `#EA5FD3` | Exchange class, attention accents. |
| Coral | `#B4451D` | `#F08A5C` | Secondary emphasis (e.g. outflow summaries in future reporting). |
| Red | `#C81E1E` | `#FF7A7A` | Errors and destructive actions only — never ordinary negative amounts. |
| Focus | `#D1179E` | — | Focus ring only; ≥ 3:1 against both white surfaces and the dark frame. Reserved so focus is findable anywhere. |

### shadcn token mapping

| shadcn token | Value |
| --- | --- |
| `--background` | `#262046` (content ground) |
| `--card` / `--card-foreground` | `#FFFFFF` / `#0F0D16` |
| `--primary` / `--primary-foreground` | `#0F0D16` / `#FFFFFF` (primary actions are ink-filled, prototype-style) |
| `--secondary` / `--secondary-foreground` | `#FFFFFF` / `#0F0D16` (white chip with ink outline) |
| `--muted` / `--muted-foreground` | `#F3EFFB` / `#6B667F` |
| `--destructive` / `--destructive-foreground` | `#C81E1E` / `#FFFFFF` |
| `--ring` | `#D1179E` |
| `--radius` | `0` |

Extended theme namespace (theme-owned, used by domain components): `--color-money-in` (`#0E7D52`), `--color-class-<class>` ink/bright pairs per the accent table, `--shadow-pixel`, `--shadow-chip`, `--frame`, `--frame-foreground`, `--frame-muted`, `--band`, `--hairline`.

### Domain color rules

- Spend amounts and ordinary negative numbers: ink with explicit minus sign. Red never marks spend.
- Income/refund display amounts: mint/teal ink forms as text; in transaction lines, money-in amount chips use the mint bright fill with ink text.
- Class badges/chips: bright-form fill, ink text, ink outline; `spend` uses a white/`--band` neutral chip; `mixed` is outlined-only with no fill; `fx_gain_loss` uses a `--muted-foreground` outline with sign-colored amount.
- Pending: `--muted-foreground` text plus the pending indicator; cancelled: strikethrough + `--muted-foreground`.
- Status chips (posted, pending, reconciliation when relevant): mint bright for settled/positive states, yellow bright for in-flight states, ink text always.

## Typography

Two families, bundled locally (local-first app; no CDN fetches). No bitmap/pixel font — headings must be bold and instantly legible.

| Role | Family | License | Use |
| --- | --- | --- | --- |
| Voice (mono) | IBM Plex Mono | OFL | Page and section headings (SemiBold/Bold, uppercase, slightly letterspaced), table headers (uppercase), nav labels, buttons, chips, all data cells, amounts, FQNs, dates, kbd hints. |
| Prose | IBM Plex Sans | OFL | Multi-sentence reading: help paragraphs, empty-state explanations, form hints, error prose, dialogs. |

Rules:

- Scale: page title 20–24 mono bold uppercase; section heading 16 mono bold uppercase; table header 12 mono uppercase; data cells 13–14 mono regular; secondary/meta 12; prose 14 sans.
- Emphasis within data comes from weight (mono SemiBold) and chips, not from color or italics.
- Amounts always mono, tabular numerals, right-aligned (per webui-design rules).
- Uppercase is reserved for headings, table headers, nav, and chip micro-labels — never for user-entered content.

## Shape & Depth

- Radius `0` everywhere. Checkboxes, inputs, cards, dialogs, chips, avatars: all square. Member and merchant initial tiles are square yellow-bright tiles with ink initials.
- Ink outlines: 2px `--border-ink` on landmark components (cards, panels, dialogs, buttons, inputs, the entry panel); 1–2px on in-table chips.
- Hard shadows, never blurred: `--shadow-pixel: 4px 4px 0 var(--border-ink)` on raised landmarks (cards, dialogs, panels, primary buttons); `--shadow-chip: 2px 2px 0 var(--border-ink)` on chips and small controls — including in-table markers.
- Press feedback: active buttons translate by their shadow offset and drop the shadow — the control physically presses in. Signature interaction, unchanged.
- Banded tables: row separation comes from alternating `--card`/`--band` rows; the header row is a sky-bright band with ink uppercase mono labels. Hairlines are optional and only for group boundaries.
- In-table markers: in transaction lines, category, tags, and member render as square chips (ink outline + `--shadow-chip`); amounts render as chips too — white with ink text, mint bright fill for money-in; tag chips drop to the micro size on a single ellipsis-truncated line. Records subtables render as plain undecorated table text for all columns (no chips, badges, or shadows) for now.
- Dark-frame navigation: nav items are chip-shaped rows on `--frame` with `--frame-muted` text; the active item is an ink-filled chip with white text and a visible outline; hover lightens one step, instantly.
- Focus: 2px solid `--ring` outline with 2px offset, on everything focusable. Never removed, never restyled per component.
- Texture: a subtle pixel-grid may texture `--ground`; halftone/dither motifs are allowed in empty states and the logo area. Never any texture behind data surfaces.

## Iconography

- Icon set: `pixelarticons` (MIT) — pixel-grid glyphs at 16px or 24px integer sizes only (no fractional scaling).
- Gaps may fall back to Lucide when no pixel glyph exists, while still following the same size, color, label, and tooltip rules.
- Icons follow text color tokens; icons never carry meaning alone (per webui-design rules).
- The page-help affordance renders as a small chip-styled icon button.
- Transaction classes and record statuses are icon-encoded in transaction lines: each class gets a distinct pixel glyph in its accent ink form, each status a distinct glyph in its status color; both always carry tooltips naming the value.

## Motion

Sprite motion: stepped, instant, purposeful. No easing curves that imply physical inertia.

- Timing function `steps(2)` or `steps(3)`, durations 100–150ms, for overlays and expansion where a transition exists at all.
- Table row hover: instant fill change (one step beyond the band color), no transition.
- Skeletons: checkerboard dither blocks stepping through 2 frames — shaped like final content per webui-design rules.
- Signature moment: in batched entry, a saved transaction "stamps" into the list (single-step appear) and the session tally increments like a score counter (mono digits, stepped roll).
- `prefers-reduced-motion`: all stepped animations collapse to state changes with no intermediate frames; the score counter updates instantly.

## Component Notes

Theme treatments for the shared component inventory in `docs/webui-design.md`:

- Buttons: 2px ink outline, pixel shadow, press-in active state. Primary = ink fill with white text; secondary = white fill with ink text; accent-filled buttons only for semantic emphasis (e.g. mint on a money-in action); destructive = red fill, used sparingly.
- `ClassIcon` / `StatusIcon`: pixel glyph in the class accent ink form / status color, no chip frame, tooltip required; lines use icons, `ClassBadge` chips are for detail headers.
- `ClassBadge` / marker chips: square, ink outline, `--shadow-chip`, bright-form fill with ink text, 11–12px mono uppercase micro-label.
- `DataTable`: white body on the dark ground, framed as a card (ink outline + pixel shadow); banded rows; sky-bright header band; stable fixed column widths per webui-design table rules; instant hover.
- `AmountText`: IBM Plex Mono, tabular; color per domain color rules; in transaction lines wrapped as an amount chip (mint bright for money-in).
- `FqnPath`: de-emphasized ancestors + emphasized leaf in mono; dense-cell leaf-chip variant per webui-design display rules.
- `BalanceMeter`: segmented block bar per currency — mint ink when balanced, yellow while unbalanced.
- `EntryPanel` / dialogs / `CommandPalette`: landmark treatment — white surface, ink outline, pixel shadow, mono bold uppercase title; internal scrolling with the title and submit row always visible.
- `BalanceStrip`: mono amounts in `--frame-foreground` on the frame; no accent fills so the strip stays glanceable.
- Toasts: landmark treatment, one-line, auto-dismiss; success uses mint ink text, not a mint fill.
- Empty states: small pixel-art sprite (inline SVG, ≤ 4 colors from the accent palette), mono bold uppercase headline, sans explanation, primary action button.

## Accessibility & Verification

- Contract: every ink-form-on-white/band text pair ≥ 4.5:1; ink text on every bright-form fill ≥ 4.5:1; `--frame-foreground` on `--frame` and `--ground` ≥ 4.5:1; `--frame-muted` on `--frame` ≥ 4.5:1; `--ring` ≥ 3:1 against both `--card` and `--frame`; `--muted-foreground` on `--band` ≥ 4.5:1. Implementation must verify every pair with a contrast checker and adjust values only toward higher contrast.
- Uppercase mono headings stay ≥ 12px; no essential text below 12px.
- All theme behavior (focus ring, press states, stepped motion) works identically for keyboard users.

## Implementation Notes

- Tokens live as CSS custom properties in `frontend/src/styles.css`, wired through the Tailwind v4 theme and shadcn variables; components consume semantic tokens only, never raw hex (per `docs/frontend-architecture.md`).
- Fonts and icons are bundled into the build (embedded assets); no runtime network fetches. Bitmap-font dependencies are not allowed.
- Arcade Cabinet is the default theme. Alternate themes swap the token layer and font assignments only; anything a theme cannot express through tokens and the component notes above is a design-system bug to fix, not to fork.
