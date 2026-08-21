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
- **Square corners.** Only the Amrela canopy and Badge dots are rounded.
- Colour comes from tokens only — never a hex in a component.
- Dark mode is primary; every token is themed, so components switch automatically.

## Tokens

`--paper --surface --ink --ink-soft --ink-faint --rule --rule-ink --indigo --indigo-deep --indigo-wash --blood`

Type: `--font-display` Instrument Serif · `--font-ui` Inter · `--font-mono` JetBrains Mono
