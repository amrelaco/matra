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
