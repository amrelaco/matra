# Matra

A headless rich text editor framework with a first-class extension API.

- **No engine leakage** — the document model is plain JSON; no internals in public types
- **Plain objects, plain functions** — no `this`, no classes, no inheritance chains
- **Inferred types** — adding an extension adds its commands, fully typed, with no module augmentation
- **Async-safe** — position mapping is built in, so AI and collaboration don't corrupt documents

> Status: early development. Package names are reserved; the implementation is in progress.

See [DESIGN.md](./DESIGN.md) for the API rationale.

## Packages

| Package | Purpose |
|---|---|
| `@matra/core` | Document model, extension API, command context |
| `matra` | Convenience meta-package |

## License

MIT © Nahim Hossain Shohan
