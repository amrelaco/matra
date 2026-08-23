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

## Final visual rules

- **No gradients.** Solid colour only. The CTA band is solid `--invert-bg` + 12% grain.
- **Every section carries a dashed top border** — that is the only separator.
  Sections never carry bottom borders (it produced doubled rules), and the first
  section on a page has none because the nav's own bottom rule already separates it.
- **Dashes are 1px** with a compact rhythm (~5px dash / 4px gap). In production
  this is `border-top: 1px dashed var(--rule-strong)` — the segment construction
  in the design file is a tool workaround, not something to ship.
- **1200px content grid, never exceeded.** 120px gutters at 1440. App shells
  (docs, editor, playground, account, auth) are full-width by design; every
  marketing section is measured against the 120→1320 band.
- **Shaped backgrounds are rare.** Only 5 sections in the whole design carry a
  `ShapeBG` layer (landing quote band, pricing head, extensions head, Amrela
  contact, Amrela what-we-do). 1.2px outlined circles/arcs in `--rule`, clipped
  by the section. Used as punctuation on otherwise quiet sections — never on
  dense ones. No images anywhere.
- **Mac-dot window chrome** on all code windows (`--dot-r/--dot-y/--dot-g`).
- **Icons are load-bearing** — section kickers, hero facts, FAQ topics,
  comparison rows, pricing tiers, changelog kinds, blog rows, docs sidebar
  groups, footer columns, info rails, approach principles.
- **No two adjacent sections share a layout.** Amrela's Approach uses the
  heading-left / titled-list-right pattern; The Problem next to it was the same
  shape with different words, so it is now a 2x2 failure grid — full-width head
  (heading left, lede right), four cards each with an outlined icon tile in
  `--blood` and a mono consequence line. When a new section repeats its
  neighbour's skeleton, change the skeleton, not the copy.
- **Every section must earn its place.** The Amrela structure band is a labelled
  canopy diagram (Amrela over Matra / Rooktoo / next), not decoration.

## Control heights

One scale, no exceptions:

| control | height |
|---|---|
| Button (primary / secondary / ghost / code) | 43 |
| Input, search field, select | 43 |
| Segmented control (tab group **and** each cell) | 43 |
| Badge / status pill | 24 (label, not a control — never matched to controls) |
| Kicker | 15 |

Anything sitting in the same row as a button or input is 43. Segmented cells use
`height: fill_container` inside their 43px group so the active cell's fill lands
exactly inside the group border, and the last cell drops its right divider so it
doesn't double with the group's own border.

## Responsive

Three breakpoints. The design file holds the 1440 and 390 ends; 768 interpolates.

| | mobile | tablet | desktop |
|---|---|---|---|
| viewport | ≤ 640 | 641–1023 | ≥ 1024 |
| gutters | 20px | 40px | 120px (1200 max) |
| columns | 1 | 2 | up to 4 |

**Rules applied to every mobile frame (390px):**

1. **Every multi-column row stacks.** Two-column splits and 3–4-up card grids
   become a single column; the vertical dividers are dropped and each item gets
   a dashed bottom rule instead — separation stays, direction rotates.
2. **Nav collapses** to brand + search + menu icon. The link row is a sheet.
3. **Type steps down**: 54→32, 44→28, 32→24, 26→20, 18→17. Body stays 16.5.
4. **App shells lose their rails.** Docs drops sidebar and TOC (they become the
   menu); the editor drops the sidebar and AI panel and gains a bottom toolbar;
   the playground stacks code over preview.
5. **Comparison tables become labelled cards** — each feature is a heading with
   `Matra / Tiptap / Lexical` prefixed lines. Never a horizontally scrolling table.
6. **Code windows clip and scroll horizontally**; they never force page width.
7. **Nothing exceeds the viewport.** Every mobile frame is audited to 390px:
   0 nodes overflow across all 20.

Mobile frames exist for all 20 unique screens. The 16 remaining docs pages share
the Introduction shell exactly, so they inherit its mobile layout.
Light mode is not duplicated at mobile size — every colour is a token, so the
light theme follows automatically.

## Package names

The `@matra` npm scope belongs to an unrelated project (`matralang/matra`), so:

- the engine ships as the unscoped **`matra`** — which is what every code sample
  already says to install
- bindings and official extensions live under **`@matrajs/*`**, matching matrajs.com
- extension packages in the directory read `@matrajs/extension-bold`, not `@matra/…`

Any mockup showing a package name must use these. The canvas was swept once;
keep it swept.

## Amrela is not an editor company

Amrela sells AI product work; Matra is one product, not the thesis. The service
list is four items and only one is editor-specific:

1. AI features that hold up — streaming, retries, cost ceilings, failure states
2. **Agents that touch real systems** — tool calling, server-derived identity, audit trail
3. Editors and document systems — the deep specialism, not the whole offer
4. Hardening what already exists — the fixed-price audit

If a future edit leaves editors as the loudest thing on amrela.co, the balance
has drifted.
