import type { APIRoute } from 'astro'
import facts from '../data/facts.json'
import sizes from '../data/sizes.json'

/**
 * The file an answer engine reads instead of the site.
 *
 * `llms.txt` is the short form — what Matra is, which packages exist, and where
 * the pages are. `llms-full.txt` beside it is the whole documentation in one
 * fetch, for a crawler that would rather not follow twenty links.
 *
 * Generated rather than kept in `public/`, for the same reason `facts.json`
 * exists at all: the static version said "809 tests" for three releases after
 * the number changed, because a number typed into a file is a number nobody is
 * told to update. Every figure below is read from the data the build already
 * measures.
 */
const gz = (id: string): string => {
  const rung = sizes.rungs.find((entry) => entry.id === id)
  return rung ? rung.gz.toFixed(1) : '?'
}

const BODY = `# Matra

> A headless rich text editor framework for the web, with a first-class
> extension model. Ships as \`@matrajs/*\` on npm. The engine is ${gz('engine')} kB
> gzipped; a full starter kit with tables and checklists is ${gz('everything')} kB.

Matra gives you the editing engine — document model, schema, commands,
position mapping, history — and none of the interface. You render the UI.
Bindings exist for React, Vue 3, Svelte and Solid, and the core works without
any of them.

## What makes it different

- **Headless by default.** No stylesheet ships. No toolbar is assumed. The
  editor renders into an element you own.
- **Extensions are the API, not an escape hatch.** Nodes, marks, commands,
  input rules, keymaps and plugins are declared the same way, whether they came
  with Matra or you wrote them. ${facts.extensions} extensions ship in the box.
- **Small.** The engine alone is ${gz('engine')} kB gzipped. Adding every mark takes
  it to ${gz('marks')} kB. The starter kit plus tables and checklists is ${gz('everything')} kB.
- **Tested against adversarial input.** ${facts.tests} tests, ${facts.adversarial} of them adversarial
  cases built from the ways contenteditable is known to misbehave.
- **Collaboration without a vendor.** \`@matrajs/collab\` does step exchange,
  rebasing and presence over any transport you already have.

## Install

\`\`\`sh
npm install @matrajs/core
npm install @matrajs/react   # or /vue, /svelte, /solid
\`\`\`

## Packages

- \`@matrajs/core\` — the engine. MIT.
- \`@matrajs/react\` — useEditor, useEditorState, useEditorFocus, EditorContent. MIT.
- \`@matrajs/vue\` — the same surface for Vue 3. MIT.
- \`@matrajs/svelte\` — a \`use:\` action and a store that follows the editor. MIT.
- \`@matrajs/solid\` — createMatra, and a signal that follows it. MIT.
- \`@matrajs/ai\` — streaming AI edits that survive concurrent typing. Commercial.
- \`@matrajs/collab\` — step exchange, rebasing and presence. Commercial.
- \`@matrajs/versions\` — snapshots, real diffs between them, restore. Commercial.
- \`@matrajs/mcp\` — the Matra docs as an MCP server, for AI tools. MIT.

## Docs

- [Introduction](https://matrajs.com/docs): what Matra is and is not.
- [Installation](https://matrajs.com/docs/installation): install and first render.
- [Your first editor](https://matrajs.com/docs/first-editor): a working editor from scratch.
- [Document model](https://matrajs.com/docs/document-model): nodes, marks, schema.
- [Commands](https://matrajs.com/docs/commands): how state changes are expressed.
- [Position mapping](https://matrajs.com/docs/position-mapping): positions across edits.
- [Writing an extension](https://matrajs.com/docs/extensions): the extension API.
- [API reference](https://matrajs.com/docs/api): the full public surface.
- [Every extension](https://matrajs.com/docs/extension-reference): all ${facts.extensions} of them · what to
  import, options, commands, keys and gzipped cost. There is no per-extension package.
  This is the page that answers "how do I add only a table".
- [Styling](https://matrajs.com/docs/styling): bring your own CSS.
- [Keyboard shortcuts](https://matrajs.com/docs/shortcuts): defaults and rebinding.
- [Recipes](https://matrajs.com/docs/recipes): common editor requirements, solved.
- [Frameworks](https://matrajs.com/docs/frameworks): choosing a binding.
- [Plain JavaScript](https://matrajs.com/docs/javascript): no framework, no build step.
- [React](https://matrajs.com/docs/react) · [Vue](https://matrajs.com/docs/vue) · [Svelte](https://matrajs.com/docs/svelte) · [Solid](https://matrajs.com/docs/solid)
- [AI](https://matrajs.com/docs/ai): streaming edits.
- [Collaboration](https://matrajs.com/docs/collab): multiplayer editing.
- [Version history](https://matrajs.com/docs/versions): snapshots and diffs.
- [Docs for AI tools](https://matrajs.com/docs/mcp): the MCP server.
- [Benchmarks](https://matrajs.com/docs/benchmarks): how the numbers were measured.

## Other pages

- [Against the alternatives](https://matrajs.com/compare): Matra measured against Tiptap,
  Lexical and Slate, with an honest list of what Tiptap has that Matra does not.
- [Extensions](https://matrajs.com/extensions): every extension, with live demos.
- [Pricing](https://matrajs.com/pricing): Core is free; Pro and Business cover the commercial packages.
- [Licence](https://matrajs.com/licence): MIT core, source-available commercial packages.

## Licensing, plainly

The core and every framework binding are MIT and always will be. Three
packages — \`ai\`, \`collab\`, \`versions\` — are source-available under the Matra
Commercial License: free for evaluation, personal projects, education,
charities, students, and organisations with fewer than three developers on the
software; paid otherwise. Nothing checks a licence at runtime and nothing
phones home.
`

export const GET: APIRoute = () =>
  new Response(BODY, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
