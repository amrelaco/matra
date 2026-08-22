# Component map — .pen ↔ code

Every page in `pencil-new.pen` is composed from these reusable components.
The Pencil name is the intended React component name.

| Pencil component | id | Overridable slots (id) | React |
|---|---|---|---|
| Button/Primary | `K4ig8R` | Label `CI96v` | `<Button variant="primary">` |
| Button/Secondary | `w003Ad` | Label `F8eNLb` | `<Button variant="secondary">` |
| Button/Ghost | `JQ9Cq` | Label `o0fWT` | `<Button variant="ghost">` |
| Button/Code | `jRiOq` | Label `BTgvn` | `<CopyButton>` |
| Badge | `xbr6W` | Dot `I44Jip`, Label `Cwkop` | `<Badge>` |
| Badge/Solid | `ZDHCG` | Label `bU6NH` | `<Badge tone="solid">` |
| Kicker | `Ud7Y0` | Num `G0WdMm`, Label `z9xZP` | `<Kicker>` |
| Input | `HquHF` | Icon `YzOyX`, Placeholder `ZPLJW` | `<Input>` |
| Mark/Matra | `h21Ba` | — | `<Mark brand="matra">` |
| Mark/Amrela | `Og78o` | — | `<Mark brand="amrela">` |
| Mark/Rooktoo | `SWIHl` | — | `<Mark brand="rooktoo">` |
| Card | `pI0Vu` | Icon `X0idR`, Title `d0cOS`, Body `qPjTf` | `<Card>` |
| FeatureRow | `CvKI2` | Label `S9iH4f` | `<FeatureRow>` |
| StatBlock | `PGp7Q` | Value `s4XFq5`, Label `Eq9Nv` | `<StatBlock>` |
| CodeBlock | `hoWY6` | Filename `R6jmxs`, Lines `lab3b` | `<CodeBlock>` |
| Blood Drop | `htM7u` | path `ZzjiG` (fill) | `<BloodDrop/>` svg |

## Rules baked into every component

- **No shadows.** Anywhere. Separate surfaces with `--rule` borders or a `--surface` step.
- **Square corners everywhere.** `--radius` and `--radius-sm` are both `0`. The only round things are badge dots, avatars (circles) and the Amrela canopy (a semicircle) — those are shapes, not corners.
- Colour comes from tokens only — never a hex in a component.
- Dark mode is primary; every token is themed, so components switch automatically.

## Tokens

`--paper --surface --surface-2 --ink --ink-soft --ink-faint --rule --rule-strong --rule-ink`
`--indigo --indigo-deep --indigo-wash --blood`
`--invert-bg --invert-fg --invert-soft`  → dark in BOTH themes, for inverted sections
`--code-bg --code-chrome --code-fg --code-key --code-str --code-com --code-rule` → follow the theme
`--presence-a --presence-b --presence-c` → collaboration cursors

**The one trap:** `--ink` is a *text* colour. In dark mode it is near-white. Never use
it as a background — that is what `--invert-bg` is for. Code panels use `--code-bg`,
which follows the theme, so light mode gets a cream panel with dark syntax.

Type: `--font-display` Instrument Serif · `--font-ui` Inter · `--font-mono` JetBrains Mono


## Section labels

Kickers carry a label only — no `01 —` numbering. Numbers imply a sequence the
sections do not have, and structural devices should encode something true.

## Canvas layout in `pencil-new.pen`

Ten labelled rows, top to bottom. Dark is the primary theme; each dark row is
followed by its light equivalent.

| Row | Contents |
|---|---|
| Brand | logo system — Matra, Amrela, Rooktoo, each Primary / Reversed / Monochrome / 16px |
| System | component library, style guide |
| Matra — product | landing, pricing, extensions, playground, checkout, account, changelog, blog, sign in, sign up, 404, editor UI |
| Matra — docs | 14 content pages |
| Amrela | company, products, what we do, approach, contact |

79 frames, zero overlaps, every colour a token.

## V2 — "Aurora" (second design language, for comparison)

Lives to the right of everything in `pencil-new.pen` (x ≥ 25000). Fully separate
token namespace — nothing in V1 was touched. References: Linear, NestJS, Next.js,
Nuxt, Notion.

- **Shape:** rounded everywhere — cards 20–24, buttons/badges/nav pill 999.
- **Colour:** deep indigo-black `--v2-bg #0A0A12`, glass surfaces (`#FFFFFF08/10`
  over dark), aurora gradient `--v2-ga #6C8CFF → --v2-gb #A06CFF → --v2-gc #FF6CB5`,
  cyan pop `#5CE1E6`. Gradient is used for: primary buttons, headline spans,
  featured-card borders (1.5px gradient wrap), check dots, active pills.
- **Type:** `Bricolage Grotesque` display (700/800, tight), `Inter` body,
  `JetBrains Mono` code. Wordmark stays serif in V1 only; V2 wordmark is Bricolage.
- **Texture:** `grain.glsl` noise layer at 10–16% on heroes and gradient CTA boxes;
  in code use an SVG feTurbulence data URI.
- **Imagery:** AI-generated set in `images/` — glass orbs (auth aside), caret
  nebula (404 background), glass umbrella (Amrela hero). Mac-dot window chrome,
  floating rotated chips, avatar stacks, icon tiles with per-feature colour washes.
- **Marks:** same construction, rounded ends + gradient bar (V2/Mark/*).

V2 components: `V2/Button/{Primary,Secondary,Code}`, `V2/Badge`, `V2/Kicker`
(pill+icon), `V2/IconTile`, `V2/Avatar`, `V2/Input`, `V2/Mark/{Matra,Amrela,Rooktoo}`.
