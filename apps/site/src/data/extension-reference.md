# Every extension

All 81 extensions live in `@matrajs/core` and carry 137 commands between them. There is no separate package to install for any one of them.

## Installing only what you want

There is no `@matrajs/table` package. You already have the table; you turn it on by importing it.

```sh
npm install @matrajs/core
```

A table and nothing else:

```ts
import { createEditor, document, paragraph, text, tableKit } from '@matrajs/core'

const editor = createEditor({
  extensions: [document, paragraph, text, ...tableKit],
  element: document.querySelector('#editor'),
})
```

`document`, `paragraph` and `text` are the floor: every document is a `document` holding blocks, and a table cell holds blocks, so a table without them has nothing legal to contain. Extensions you do not import are not in the build — ordinary tree-shaking, not a plugin system.

## Kits

A kit is an array of definitions, spread with `...`.

- `columnsKit` — `columnList`, `column`
- `detailsKit` — `details`, `detailsSummary`
- `starterKit` — `document`, `paragraph`, `text`, `heading`, `blockquote`, `codeBlock`, `bulletList`, `orderedList`, `listItem`, `horizontalRule`, `hardBreak`, `bold`, `italic`, `strike`, `code`, `link`, `history`
- `tableKit` — `table`, `tableRow`, `tableCell`, `tableHeader`

## Nodes

### blockquote

*in starterKit · 0.33 kB gzipped*

```ts
import { blockquote } from '@matrajs/core'
```

**Commands** — `editor.commands.toggleBlockquote()`, `editor.commands.exitBlockquote()`

**Keys** — `Mod-Shift-b` toggleBlockquote, `Enter` exitBlockquote

**HTML** — parses `blockquote` · renders `blockquote`

### bulletList

*in starterKit · 0.49 kB gzipped*

```ts
import { bulletList } from '@matrajs/core'
```

**Commands** — `editor.commands.toggleBulletList()`

**Keys** — `Mod-Shift-8` toggleBulletList

**HTML** — parses `ul` · renders `ul`

### callout

*0.64 kB gzipped*

A callout — a Notion block, an admonition, an aside with a colour.

Holds blocks, so a callout can carry a list or a code sample, and carries a type for the colour and an optional emoji for the icon. The icon is outside the editable content, so the caret cannot land in it.

```ts
import { callout } from '@matrajs/core'
```

**Commands** — `editor.commands.toggleCallout()`, `editor.commands.setCalloutType()`, `editor.commands.setCalloutEmoji()`, `editor.commands.exitCallout()`

**Keys** — `Enter` exitCallout

**Attributes** — `type = "info"`, `emoji`

**HTML** — parses `div[data-callout]` · renders `div`

**Styles** — `import { calloutCSS } from '@matrajs/core'`, a stylesheet string.

### codeBlock

*in starterKit · 0.14 kB gzipped*

```ts
import { codeBlock } from '@matrajs/core'
```

**Commands** — `editor.commands.toggleCodeBlock()`

**Keys** — `Mod-Alt-c` toggleCodeBlock

**Attributes** — `language`

**HTML** — parses `pre` · renders `pre`

### column

*in columnsKit · 0.04 kB gzipped*

One column of a column list. Holds blocks, so a column can carry a list, a table or an image rather than only text.

```ts
import { column } from '@matrajs/core'
```

**HTML** — parses `div[data-column]` · renders `div`

### columnList

*in columnsKit · 0.66 kB gzipped*

Side-by-side columns.

Two nodes, deliberately plain: a list holds columns and a column holds blocks, which is the whole of the structure. The layout is a CSS grid on the list, so the document says how many columns there are and the page decides how wide each one is.

Wrapping a block into columns keeps that block as the first column and makes the rest empty, and taking the columns away lays every column's blocks out in order — so a document that was put into columns and taken out again reads as it did.

```ts
editor.commands.setColumns(3)
editor.commands.addColumn()
editor.commands.removeColumn()
editor.commands.unsetColumns()
```

```ts
import { columnList } from '@matrajs/core'
```

**Commands** — `editor.commands.setColumns()`, `editor.commands.unsetColumns()`, `editor.commands.addColumn()`, `editor.commands.removeColumn()`

**HTML** — parses `div[data-columns]` · renders `div`

### details

*in detailsKit · 0.57 kB gzipped*

A collapsible block — a Notion toggle, an HTML `<details>`.

Rendered as the real element, so open and closed are what the browser already knows how to do. The node view keeps the document in step with the disclosure triangle: clicking it writes `open` to the attribute, and an `open` that arrives from elsewhere — undo, a peer, a loaded document — is written back to the element.

```ts
import { details } from '@matrajs/core'
```

**Commands** — `editor.commands.insertDetails()`, `editor.commands.toggleDetails()`, `editor.commands.setDetailsOpen()`, `editor.commands.unsetDetails()`

**Keys** — `Enter` (ctx) => {
      const { tr } = engine(ctx);
      const $from = tr.selection.$from;
      if ($from.parent.type.name !== "detailsSummary") return false;
      tr.selectAt($from.after($from.depth) + 1);
      return true;
    }

**Attributes** — `open = true`

**HTML** — parses `details` · renders `details`

**Styles** — `import { detailsCSS } from '@matrajs/core'`, a stylesheet string.

### detailsSummary

*in detailsKit · 0.03 kB gzipped*

The title line of a toggle.

```ts
import { detailsSummary } from '@matrajs/core'
```

**HTML** — parses `summary` · renders `summary`

### document

*in starterKit*

```ts
import { document } from '@matrajs/core'
```

### embed

*takes options · 1.04 kB gzipped*

Anything with an embed page, in a frame.

The frame is the dangerous part of a document, so the allowlist is not optional: a `src` is checked when a command sets it, when HTML is parsed, and again when the node renders — because a document loaded from JSON skipped the first two, and that is how every real application loads documents. A frame that fails the check at render time is withheld and the wrapper stays, so the document keeps its data and fetches nothing.

Every frame is sandboxed. Scripts and same-origin are allowed because most embed pages stop working without them; navigating the top page is not.

```ts
import { embed } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `allow` | `EmbedAllow` | Left off, a short list of well-known players and tools applies. |

**Commands** — `editor.commands.insertEmbed()`, `editor.commands.setEmbedAspect()`

**Attributes** — `src`, `title`, `aspect = "16/9"`

**HTML** — parses `div[data-embed]`, `iframe[src]` · renders `div`

**Styles** — `import { embedCSS } from '@matrajs/core'`, a stylesheet string.

### field

*0.55 kB gzipped*

A blank in a template.

`{{name}}` in a letter is a promise that something will be put there, and as text it is a promise the editor cannot keep: it can be half-deleted into `{{nam}}`, spell-checked, bolded from the middle, and nothing will notice until the letter goes out with braces in it. As an atom it is one thing — the caret steps over it, backspace removes all of it — and filling it is a command rather than a search and replace.

`fillFields` fills the fields in the editor; `fillFieldsIn` does the same to a document as JSON, with no editor and no DOM, which is where a mail merge actually runs.

```ts
import { field } from '@matrajs/core'
```

**Commands** — `editor.commands.insertField()`, `editor.commands.fillFields()`

**Attributes** — `name`, `label`

**HTML** — parses `span[data-field]` · renders `span`

### footnote

*0 kB gzipped*

The note itself: blocks, under the id its marker carries.

```ts
import { footnote } from '@matrajs/core'
```

**Attributes** — `id`

**HTML** — parses `li[data-footnote]` · renders `li`

### footnoteRef

*0 kB gzipped*

The marker in the text.

It carries an id and nothing else. Its number is a decoration computed from where it stands, so moving a paragraph renumbers every note without a single change to the document, and two people looking at the same document see the same numbers. The element is empty in HTML; the number is drawn by `footnotesCSS` from the decoration's attribute.

```ts
import { footnoteRef } from '@matrajs/core'
```

**Attributes** — `id`

**HTML** — parses `sup[data-footnote-ref]` · renders `sup`

### footnotes

*0.04 kB gzipped*

The list the notes live in, kept as the last block by `insertFootnote`.

```ts
import { footnotes } from '@matrajs/core'
```

**HTML** — parses `ol[data-footnotes]` · renders `ol`

**Styles** — `import { footnotesCSS } from '@matrajs/core'`, a stylesheet string.

### footnotesKit

*takes options · 0 kB gzipped*

Footnotes: a marker in the text, a note at the end, numbered by position.

```ts
editor.commands.insertFootnote()      // a marker here, a note below, caret in the note
editor.commands.removeFootnote(id)    // both halves
editor.commands.goToFootnote(id)      // and back with goToFootnoteRef(id)
```

The numbers are never in the document. They are decorations, recomputed per block when the document changes and not at all when only the caret moves, so deleting a marker renumbers the rest as you watch and an undo puts the old numbers back. A note whose marker is gone is left in place and marked `matra-footnote-orphan`, rather than deleted behind your back.

```ts
import { footnotesKit } from '@matrajs/core'
```

**Attributes** — `id`

**HTML** — parses `sup[data-footnote-ref]` · renders `sup`

### hardBreak

*in starterKit · 0.06 kB gzipped*

```ts
import { hardBreak } from '@matrajs/core'
```

**Commands** — `editor.commands.insertHardBreak()`

**Keys** — `Shift-Enter` insertHardBreak

**HTML** — parses `br` · renders `br`

### hashtag

*takes options · 0.24 kB gzipped*

A hashtag, as a node rather than styled text.

The same argument as `mention`: an atom cannot be half-deleted into `#mat`, and a document that stores the tag as an attribute can be asked for its tags without anyone parsing prose. Typing `#word` and a space makes one; `#` inside a word — `a#b`, a colour, a URL fragment — is left alone.

```ts
import { hashtag } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `name` | `string` | Node name, if you need two kinds of tag in one editor. |
| `render` | `(tag: string) => string` | What appears in the document. Defaults to `#tag`. |

**Commands** — `editor.commands.insertHashtag()`

**Attributes** — `tag`

**HTML** — parses `span[data-hashtag]` · renders `span`

### heading

*in starterKit · 0 kB gzipped*

```ts
import { heading } from '@matrajs/core'
```

**Commands** — `editor.commands.setHeading()`, `editor.commands.toggleHeading()`

**Keys** — `Mod-Alt-1` (ctx) => ctx.setBlockType("heading", { level }), `Mod-Alt-2` (ctx) => ctx.setBlockType("heading", { level }), `Mod-Alt-3` (ctx) => ctx.setBlockType("heading", { level }), `Mod-Alt-4` (ctx) => ctx.setBlockType("heading", { level }), `Mod-Alt-5` (ctx) => ctx.setBlockType("heading", { level }), `Mod-Alt-6` (ctx) => ctx.setBlockType("heading", { level })

**Attributes** — `level = 1`

**HTML** — parses `h1`, `h2`, `h3`, `h4`, `h5`, `h6` · renders `h1`

### horizontalRule

*in starterKit · 0.07 kB gzipped*

```ts
import { horizontalRule } from '@matrajs/core'
```

**Commands** — `editor.commands.insertHorizontalRule()`

**HTML** — parses `hr` · renders `hr`

### image

*0.2 kB gzipped*

```ts
import { image } from '@matrajs/core'
```

**Commands** — `editor.commands.insertImage()`

**Attributes** — `src`, `alt`, `title`

**HTML** — parses `img[src]` · renders `img`

### listItem

*in starterKit · 0.51 kB gzipped*

```ts
import { listItem } from '@matrajs/core'
```

**Commands** — `editor.commands.splitListItem()`, `editor.commands.liftListItem()`, `editor.commands.sinkListItem()`

**Keys** — `Enter` splitListItem, `Tab` sinkListItem, `Shift-Tab` liftListItem

**HTML** — parses `li` · renders `li`

### mathBlock

*takes options · 0.42 kB gzipped*

A formula on a line of its own.

The same node as `mathInline` in every way but where it sits: a block, so `ctx.insert` splits the paragraph around it and `$$E=mc^2$$ ` typed at the start of a paragraph replaces the paragraph with it.

```ts
import { mathBlock } from '@matrajs/core'
```

**Commands** — `editor.commands.insertBlockMath()`

**Attributes** — `latex`

**HTML** — parses `div[data-math]` · renders `div`

### mathInline

*takes options · 0.79 kB gzipped*

A formula in the run of text.

Only the source is stored. It is rendered into the element by whatever the application supplies — the editor carries no typesetting library, and a document never depends on one: the HTML keeps the source as the element's text, so an export reads as `E=mc^2` with no script on the page at all.

An atom, so the caret steps over it and backspace takes the whole thing. `$E=mc^2$ ` typed into a paragraph becomes one; `setMath` rewrites the one the caret is on, inline or display.

```ts
import { mathInline } from '@matrajs/core'
```

**Commands** — `editor.commands.insertInlineMath()`, `editor.commands.setMath()`

**Attributes** — `latex`

**HTML** — parses `span[data-math]` · renders `span`

### mathKit

*takes options · 0.79 kB gzipped*

Both nodes, sharing one renderer.

```ts
import { mathKit } from '@matrajs/core'
```

**Commands** — `editor.commands.insertInlineMath()`, `editor.commands.setMath()`

**Attributes** — `latex`

**HTML** — parses `span[data-math]` · renders `span`

### mention

*takes options · 0.21 kB gzipped*

A mention, as a node rather than styled text.

An atom: the caret steps over it, backspace removes the whole thing, and it cannot be half-deleted into `@Nahi`. That is the entire argument for making it a node — styled text looks identical until someone edits it, and then it quietly stops being a reference to anybody.

The id travels with it, so the document keeps a reference rather than a name that was true when it was typed.

```ts
import { mention } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `render` | `(attrs: { id: string` | What appears in the document. Defaults to `@label`. |
| `label` (required) | `string` |  |
| `name` | `string` | Node name, if you need two kinds of mention in one editor. |

**Commands** — `editor.commands.insertMention()`

**Attributes** — `id`, `label = ""`

**HTML** — parses `span[data-mention-id]` · renders `span`

### orderedList

*in starterKit · 0.55 kB gzipped*

```ts
import { orderedList } from '@matrajs/core'
```

**Commands** — `editor.commands.toggleOrderedList()`

**Keys** — `Mod-Shift-9` toggleOrderedList

**Attributes** — `start = 1`

**HTML** — parses `ol` · renders `ol`

### pageBreak

*0.07 kB gzipped*

A page break.

A block atom with nothing inside, like a horizontal rule: the caret steps over it, Backspace removes the whole thing, and inserting one at a caret in the middle of a paragraph cuts the paragraph around it. On screen it is a labelled dashed line; in print it is where the page ends and nothing else.

The element is marked non-editable in its own DOM, as the YouTube embed is, so an empty `<div>` inside the editor never becomes a line the caret can sit on.

```ts
editor.commands.insertPageBreak()
```

```ts
import { pageBreak } from '@matrajs/core'
```

**Commands** — `editor.commands.insertPageBreak()`

**HTML** — parses `div[data-page-break]` · renders `div`

**Styles** — `import { pageBreakCSS } from '@matrajs/core'`, a stylesheet string.

### paragraph

*in starterKit*

```ts
import { paragraph } from '@matrajs/core'
```

**Commands** — `editor.commands.setParagraph()`

**Keys** — `Mod-Alt-0` setParagraph

**HTML** — parses `p` · renders `p`

### table

*in tableKit · 1.84 kB gzipped*

```ts
import { table } from '@matrajs/core'
```

**Commands** — `editor.commands.insertTable()`, `editor.commands.deleteTable()`, `editor.commands.addRowAfter()`, `editor.commands.addRowBefore()`, `editor.commands.deleteRow()`, `editor.commands.addColumnAfter()`, `editor.commands.addColumnBefore()`, `editor.commands.deleteColumn()`, `editor.commands.toggleHeaderRow()`, `editor.commands.goToNextCell()`, `editor.commands.goToPreviousCell()`

**Keys** — `Tab` goToNextCell, `Shift-Tab` goToPreviousCell

**HTML** — parses `table` · renders `table`

### tableCell

*in tableKit · 0.19 kB gzipped*

```ts
import { tableCell } from '@matrajs/core'
```

**Attributes** — `colspan = 1`, `rowspan = 1`, `colwidth`

**HTML** — parses `td` · renders `td`

### tableHeader

*in tableKit · 0.19 kB gzipped*

```ts
import { tableHeader } from '@matrajs/core'
```

**Attributes** — `colspan = 1`, `rowspan = 1`, `colwidth`

**HTML** — parses `th` · renders `th`

### tableRow

*in tableKit · 0.04 kB gzipped*

```ts
import { tableRow } from '@matrajs/core'
```

**HTML** — parses `tr` · renders `tr`

### taskItem

*0.92 kB gzipped*

```ts
import { taskItem } from '@matrajs/core'
```

**Commands** — `editor.commands.splitTaskItem()`, `editor.commands.liftTaskItem()`, `editor.commands.sinkTaskItem()`, `editor.commands.toggleTaskItem()`

**Keys** — `Mod-Enter` toggleTaskItem, `Enter` splitTaskItem, `Tab` sinkTaskItem, `Shift-Tab` liftTaskItem

**Attributes** — `checked = false`

**HTML** — parses `li[data-checked]` · renders `li`

### taskList

*0.57 kB gzipped*

A checklist.

The checkbox is real DOM rather than a `::before`, because a checklist people cannot tick with the mouse is a bulleted list with extra steps. It carries `contenteditable="false"` so the caret never lands inside it.

```ts
import { taskList } from '@matrajs/core'
```

**Commands** — `editor.commands.toggleTaskList()`

**Keys** — `Mod-Shift-7` toggleTaskList

**HTML** — parses `ul[data-type="taskList"]` · renders `ul`

**Styles** — `import { taskListCSS } from '@matrajs/core'`, a stylesheet string.

### text

*in starterKit*

```ts
import { text } from '@matrajs/core'
```

### youtube

*0.77 kB gzipped*

A YouTube video, embedded.

Only the id is stored. The frame's address is built from it here, on the privacy-preserving domain, so a document can never carry a frame pointing anywhere else — an embed whose `src` is trusted from JSON is an `<iframe>` to any page an attacker likes.

```ts
import { youtube } from '@matrajs/core'
```

**Commands** — `editor.commands.insertYoutube()`

**Attributes** — `src`, `width = 640`, `height = 360`, `start = 0`

**HTML** — parses `div[data-youtube-video]`, `iframe[src]` · renders `div`

**Styles** — `import { youtubeCSS } from '@matrajs/core'`, a stylesheet string.

## Marks

### bold

*in starterKit · 0.13 kB gzipped*

```ts
import { bold } from '@matrajs/core'
```

**Commands** — `editor.commands.toggleBold()`, `editor.commands.setBold()`, `editor.commands.unsetBold()`

**Keys** — `Mod-b` toggleBold

**HTML** — parses `strong`, `b`, `[style: font-weight]` · renders `strong`

### code

*in starterKit · 0.05 kB gzipped*

```ts
import { code } from '@matrajs/core'
```

**Commands** — `editor.commands.toggleCode()`

**Keys** — `Mod-e` toggleCode

**HTML** — parses `code` · renders `code`

### comment

*0.33 kB gzipped*

Threaded comments, anchored to ranges.

The thread itself — author, body, replies, resolution — belongs to the host application, not the document. All that lives here is the anchor: a mark carrying a thread id. That separation is deliberate. Comment bodies in the document would travel with every copy, paste and export of the text, and would need migrating whenever the comment schema changed.

Because the anchor is a mark, position mapping keeps it correct for free: edit the paragraph around a comment and the highlight follows the words.

```ts
import { comment } from '@matrajs/core'
```

**Commands** — `editor.commands.addComment()`, `editor.commands.removeComment()`

**Attributes** — `threadId`

**HTML** — parses `span[data-comment]` · renders `span`

**Styles** — `import { commentCSS } from '@matrajs/core'`, a stylesheet string.

### highlight

*0.15 kB gzipped*

```ts
import { highlight } from '@matrajs/core'
```

**Commands** — `editor.commands.toggleHighlight()`, `editor.commands.unsetHighlight()`

**Keys** — `Mod-Shift-h` toggleHighlight

**Attributes** — `color`

**HTML** — parses `mark` · renders `mark`

### italic

*in starterKit · 0.08 kB gzipped*

```ts
import { italic } from '@matrajs/core'
```

**Commands** — `editor.commands.toggleItalic()`

**Keys** — `Mod-i` toggleItalic

**HTML** — parses `em`, `i`, `[style: font-style]` · renders `em`

### kbd

*0.05 kB gzipped*

A key on the keyboard, as in "press <kbd>Ctrl</kbd>".

Its own mark rather than `code` with a class: a key name is not code, a screen reader announces the two differently, and a stylesheet wants one drawn as a keycap and the other as monospace text. The two never overlap — `code` already refuses every other mark, and refusing `code` back means toggling kbd over code text swaps one for the other instead of doing nothing and looking broken.

```ts
import { kbd } from '@matrajs/core'
```

**Commands** — `editor.commands.toggleKbd()`

**Keys** — `Mod-Alt-k` toggleKbd

**HTML** — parses `kbd` · renders `kbd`

### link

*in starterKit · 0.23 kB gzipped*

```ts
import { link } from '@matrajs/core'
```

**Commands** — `editor.commands.setLink()`, `editor.commands.unsetLink()`

**Attributes** — `href`, `target = "_blank"`, `rel = "noopener noreferrer"`

**HTML** — parses `a[href]` · renders `a`

### strike

*in starterKit · 0.08 kB gzipped*

```ts
import { strike } from '@matrajs/core'
```

**Commands** — `editor.commands.toggleStrike()`

**Keys** — `Mod-Shift-x` toggleStrike

**HTML** — parses `s`, `del`, `[style: text-decoration]` · renders `s`

### subscript

*0.05 kB gzipped*

```ts
import { subscript } from '@matrajs/core'
```

**Commands** — `editor.commands.toggleSubscript()`

**HTML** — parses `sub` · renders `sub`

### superscript

*0.05 kB gzipped*

```ts
import { superscript } from '@matrajs/core'
```

**Commands** — `editor.commands.toggleSuperscript()`

**HTML** — parses `sup` · renders `sup`

### textStyle

*0.6 kB gzipped*

Colour, background, font family and font size, as one mark.

Tiptap ships these as four extensions layered on a `textStyle` mark; here they are one mark with four attributes, so a coloured, resized word is one `<span>` rather than a nest of them. Setting one attribute keeps the others: `setColor('red')` on text already in a different font leaves the font alone.

```ts
import { textStyle } from '@matrajs/core'
```

**Commands** — `editor.commands.setColor()`, `editor.commands.unsetColor()`, `editor.commands.setBackgroundColor()`, `editor.commands.unsetBackgroundColor()`, `editor.commands.setFontFamily()`, `editor.commands.unsetFontFamily()`, `editor.commands.setFontSize()`, `editor.commands.unsetFontSize()`, `editor.commands.unsetTextStyle()`

**Attributes** — `color`, `backgroundColor`, `fontFamily`, `fontSize`

**HTML** — parses `span` · renders `span`

### underline

*0.07 kB gzipped*

```ts
import { underline } from '@matrajs/core'
```

**Commands** — `editor.commands.toggleUnderline()`

**Keys** — `Mod-u` toggleUnderline

**HTML** — parses `u`, `[style: text-decoration]` · renders `u`

## Behaviour

### autolink

*takes options · 0.35 kB gzipped*

URLs become links as they are typed and as they are pasted.

Typing: once a space follows something that looks like a URL, the URL gets the link mark and the space is inserted as usual. Pasting a URL over a selection links the selection to it; pasting one with nothing selected inserts it already linked. Needs the `link` mark in the editor.

```ts
import { autolink } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `onPaste` | `boolean` | Turn a pasted URL into a link, or link the selection to it. Default true. |
| `onType` | `boolean` | Turn a URL into a link once a space is typed after it. Default true. |

### autosave

*takes options · 0.81 kB gzipped*

Save the document once typing pauses.

Every change marks the document dirty and starts the clock; the save runs `delay` after the last one, so a sentence costs one save rather than one per letter. `save()` saves now. When the page is hidden or unloaded a dirty document is saved before it goes, since a pause that never comes is the usual way an autosave loses the last paragraph.

The state is reduced from transactions like any other: a change marks it dirty, and the save reports back through `markSaved`, which is a command so that the report is a transaction too. A save that fails leaves the document dirty with `error` set and is not retried on its own — the next change, or `save()`, tries again — because retrying a server that is down every second is how a server that is down stays down.

A save runs outside any command, after the transaction that asked for it has landed, because `save` is application code and may do anything at all. `editor.can.save()` asks without saving. One `autosave()` per editor: it holds the editor it was mounted in.

```ts
autosave({
  delay: 800,
  save: (doc) => localStorage.setItem('draft', JSON.stringify(doc)),
  restore: () => JSON.parse(localStorage.getItem('draft') ?? 'null'),
})
```

```ts
import { autosave } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `save` (required) | `(doc: DocNode, editor: Editor) => void | Promise<void>` | Persist the document. A returned promise is waited for; whatever it rejects with, or the function throws, is reported and never thrown on. |
| `delay` | `number` | How long typing has to pause before a save. Default 1000ms. |
| `restore` | `() => DocNode | string | null | undefined` | Content to load when the editor mounts — what the last save left behind. Loading it is not an edit: the document is not dirty afterwards. |
| `onError` | `(error: unknown) => void` | Told about every save that failed. |
| `flushOnHide` | `boolean` | Save at once when the page is hidden or unloaded. Default true. |

**Commands** — `editor.commands.save()`, `editor.commands.markSaved()`

### blockColor

*takes options · 0.37 kB gzipped*

Colour on the block itself, the way Notion means it.

`textStyle` already colours *text*: a mark on a run of characters, which is the right model for colouring three words in a sentence. It is the wrong model for colouring a paragraph — mark every character and the background still stops at the last one, so what you get is a band around the words rather than a band across the block, and it breaks apart the moment someone types at the end.

This is an attribute on the block instead. It survives being dragged somewhere else, it covers the full measure, and an empty paragraph can hold a colour and still show it — none of which a mark can do.

Built the way alignment and line height are, so a paragraph that knows nothing about colour still keeps, renders and parses it:

```ts
editor.commands.setBlockBackground('#fdecc8')
editor.commands.setBlockColor('rgb(212, 76, 71)')
editor.commands.unsetBlockColors()
```

The palette is deliberately not here. Notion ships ten named colours and stores the name, which is how a document follows a theme; this stores the value it was given and leaves naming to the application, because a headless editor that decides your ten colours has decided your design.

```ts
import { blockColor } from '@matrajs/core'
```

**Commands** — `editor.commands.setBlockColor()`, `editor.commands.unsetBlockColor()`, `editor.commands.setBlockBackground()`, `editor.commands.unsetBlockBackground()`, `editor.commands.unsetBlockColors()`

**Styles** — `import { blockColorCSS } from '@matrajs/core'`, a stylesheet string.

### bubbleMenu

*takes options · 0.65 kB gzipped*

A menu that appears over the selection.

You bring the element; this shows it when something is selected, places it above the selection, and hides it when the selection collapses or focus leaves both the editor and the menu. Buttons inside it should prevent the default on `mousedown`, so pressing one does not take the selection away from the text it is about to format.

```ts
import { bubbleMenu } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `element` (required) | `HTMLElement` | The element to show. Positioned absolutely by this extension, hidden when not needed. |
| `shouldShow` | `(editor: Editor) => boolean` | When to show it. Default: the selection is not empty and the editor, or the menu, has focus. |
| `placement` | `'top' | 'bottom'` | Above or below the selection. Default `top`. |
| `offset` | `number` | Pixels between the selection and the menu. Default 8. |

### characterCount

*takes options · 0.28 kB gzipped*

Live character and word counts, with an optional hard limit.

The limit is enforced by refusing the command rather than truncating: silently cutting a user's paste in half is worse than telling them it did not fit.

Counted only when the document changes. The count used to be taken on every transaction — a caret move, a click, an arrow key — by serialising the whole document to JSON and walking that, so a toolbar showing a word count made every click cost the length of the document.

```ts
import { characterCount } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `limit` | `number` | Refuse edits that would take the document past this many characters. |

**Commands** — `editor.commands.countCharacters()`

### clearFormatting

*0.24 kB gzipped*

Back to plain text: every mark off the selection, every block a paragraph.

The toolbar button labelled with a crossed-out T. One command rather than a call per mark, so the host does not have to know which marks the editor was built with — and one undo step, because that is what the person pressing it expects to get back.

```ts
import { clearFormatting } from '@matrajs/core'
```

**Commands** — `editor.commands.unsetAllMarks()`, `editor.commands.clearBlocks()`, `editor.commands.clearFormatting()`

**Keys** — `Mod-\` clearFormatting

### codeHighlight

*takes options · 0.63 kB gzipped*

Syntax highlighting for code blocks, as decorations.

The tokens never enter the document — a code block's content stays plain text, which is what copying it out and saving it both want. Each block is tokenised when it changes and remembered until it does again, keyed on the block node itself; typing in one code block does not re-colour another.

```ts
import { codeHighlight } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `highlight` | `Highlighter` | Tokenise code. Left off, a small built-in tokeniser colours comments, strings, numbers and the keywords most languages share. Plug in lowlight, Prism or Shiki here for the real thing. |
| `types` | `readonly string[]` | Which node types are code. Default `codeBlock`. |

**Styles** — `import { codeHighlightCSS } from '@matrajs/core'`, a stylesheet string.

### core

The primitives every editor needs, exposed as commands.

Always loaded by createEditor — an editor that cannot move its own selection is not useful, and making callers remember to add it would be a papercut.

```ts
import { core } from '@matrajs/core'
```

**Commands** — `editor.commands.select()`, `editor.commands.insert()`, `editor.commands.replace()`, `editor.commands.remove()`, `editor.commands.moveBlock()`, `editor.commands.focus()`

### dictation

*takes options · 0.85 kB gzipped*

Speak, and the words arrive at the caret.

Built on the browser's own speech recognition, so nothing is sent anywhere the browser does not already send it and nothing is downloaded. Words the recogniser is still deciding on are drawn after the caret as a decoration, and become document text only once it settles — so a half-heard phrase is never in the undo history.

`startDictation` needs a mounted editor and a browser that can listen; `editor.can.startDictation()` says whether both are true without turning the microphone on. Where the API is missing, every command returns false.

```ts
import { dictation } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `lang` | `string` | BCP 47 tag. Defaults to the browser's language. |
| `continuous` | `boolean` | Keep listening after a pause. Default true. |
| `interim` | `boolean` | Show what is being said before it is final. Default true. |
| `className` | `string` | Class on the provisional text. Default `matra-dictation-interim`. |

**Commands** — `editor.commands.startDictation()`, `editor.commands.stopDictation()`, `editor.commands.toggleDictation()`, `editor.commands.setDictation()`

**Styles** — `import { dictationCSS } from '@matrajs/core'`, a stylesheet string.

### dragHandle

*takes options · 1.01 kB gzipped*

A grip that appears beside the block under the pointer, and drags it.

One element, moved, rather than a widget decoration per block. A decoration per block would put a handle in the document's decoration set for every paragraph — thousands on a long document, all recomputed whenever anything changes — to show one at a time.

The handle sits outside the editable element and is `contenteditable="false"` regardless, so it can never take the caret or become part of the document.

```ts
import { dragHandle } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `render` | `() => HTMLElement` | Build your own handle. Default is a six-dot grip. |
| `offset` | `number` | Distance from the block's left edge, in pixels. |

**Styles** — `import { dragHandleCSS } from '@matrajs/core'`, a stylesheet string.

### emoji

*takes options · 0.94 kB gzipped*

Emoji as you type: `:tada:` becomes 🎉 the moment the closing colon lands.

Detection only, like mentions and slash commands — a picker is an interface, and `suggestion({ char: ':' })` plus `searchEmoji` are what one is built on.

```ts
import { emoji } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `emojis` | `Record<string, string>` | Your own shortcodes, added to or overriding the built-in set. |
| `emoticons` | `boolean` | Also replace `:)`, `:(`, `<3` and friends as they are typed. Default false. |

### fileHandler

*takes options · 0.14 kB gzipped*

Files dropped on or pasted into the editor.

The editor cannot know where a file should go — an upload endpoint, a data URL, a placeholder while the request runs — so it hands the files over with a position that survives the wait. A screenshot pasted from the clipboard arrives here as a file, the same as one dragged from the desktop.

```ts
fileHandler({
  accept: ['image/'],
  async onDrop({ editor, files, pos, marker }) {
    for (const file of files) {
      const src = await upload(file)
      editor.commands.insert({ type: 'image', attrs: { src } }, pos && marker.map(pos))
    }
  },
})
```

```ts
import { fileHandler } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `accept` | `readonly string[]` | MIME types or prefixes to take: `['image/']`. Left off, every file. |
| `onDrop` | `(event: FileEvent) => void` |  |
| `onPaste` | `(event: FileEvent) => void` |  |

### floatingMenu

*takes options · 0.67 kB gzipped*

A menu that appears on an empty line.

The "what goes here" affordance: a plus in the margin, or a row of block types beside the caret. Shown when the caret sits in an empty top-level paragraph in a focused editor, and nowhere else.

```ts
import { floatingMenu } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `element` (required) | `HTMLElement` |  |
| `shouldShow` | `(editor: Editor) => boolean` | When to show it. Default: the caret is in an empty top-level paragraph and the editor has focus. |
| `placement` | `'start' | 'left'` | At the start of the line, or in the margin to its left. Default `start`. |
| `offset` | `number` |  |

### focus

*takes options · 0.15 kB gzipped*

A class on the block the caret is in.

What a focus mode dims everything else against, and what a block toolbar anchors to. A decoration rather than an attribute, so the document never knows which block was being looked at.

```ts
import { focus } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `className` | `string` | The class put on the block the caret is in. Default `has-focus`. |
| `ancestors` | `boolean` | Also mark every ancestor block — the list around the item. Default false. |

### ghostText

*takes options · 0.71 kB gzipped*

Inline completion: grey text after the caret, Tab to take it.

The suggestion is a decoration and never part of the document, so it is not saved, not sent to collaborators and not undone. Any keystroke or caret move dismisses it — a ghost that stays where it was while the sentence changes underneath it is worse than none — and Tab inserts it at the position it was shown at, as one ordinary edit.

Where the text comes from is yours: a model, a phrase table, the next line of the previous draft. This only asks, waits, and draws.

```ts
import { ghostText } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `suggest` (required) | `(context: GhostContext) => string | null | undefined | Promise<string | null | undefined>` | Propose what comes next. Return nothing to propose nothing. Asked after the caret has rested for `delay`, and only the latest answer counts: a reply that arrives after another keystroke is dropped, so a slow model never writes into a sentence that has moved on. |
| `delay` | `number` | Milliseconds the caret rests before asking. Default 300. |
| `minBefore` | `number` | Characters needed before the caret in its block before asking. Default 1. |
| `className` | `string` | Class on the rendered suggestion. Default `matra-ghost`. |

**Commands** — `editor.commands.setGhostText()`, `editor.commands.acceptGhostText()`, `editor.commands.acceptGhostWord()`, `editor.commands.dismissGhostText()`

**Keys** — `Tab` acceptGhostText, `Escape` dismissGhostText

**Styles** — `import { ghostTextCSS } from '@matrajs/core'`, a stylesheet string.

### history

*in starterKit · 0.07 kB gzipped*

Undo and redo as commands, for toolbars.

The engine keeps the stack and binds the keys; these just reach it. The commands return false when there is nothing to rewind, so a button can disable itself.

```ts
import { history } from '@matrajs/core'
```

**Commands** — `editor.commands.undo()`, `editor.commands.redo()`

### imageResize

*takes options · 0.81 kB gzipped*

A drag handle on every image, and a `width` attribute to remember it by.

The attribute is added to the stock image node from outside, and the node view replaces the image's rendering from outside too, so the image extension knows nothing about resizing and an editor without this one renders a plain `<img>`. Width is a whole number of pixels, written to the `width` attribute so the HTML carries it and a browser honours it before any CSS loads.

```ts
import { imageResize } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `min` | `number` | Narrowest an image may be dragged, in pixels. Default 32. |
| `max` | `number` | Widest. Default 4096. |

**Commands** — `editor.commands.setImageWidth()`

**Styles** — `import { imageResizeCSS } from '@matrajs/core'`, a stylesheet string.

### indent

*takes options · 0.45 kB gzipped*

Block indentation, the way a word processor does it.

An attribute on the block rather than a wrapper node: Tab on a paragraph moves the paragraph in, Shift-Tab moves it back out, and the document says `indent: 2` rather than nesting the paragraph inside something invented to hold it. Inside a list the keys belong to the list, so this stands down there.

```ts
import { indent } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `types` | `readonly string[]` | Which blocks can be indented. Default paragraphs and headings. |
| `max` | `number` | How many levels. Default 8. |
| `step` | `number` | Width of one level, in `em`. Default 2. |

**Commands** — `editor.commands.indent()`, `editor.commands.outdent()`, `editor.commands.setIndent()`

**Keys** — `Tab` indent, `Shift-Tab` outdent

### invisibleCharacters

*takes options · 0.72 kB gzipped*

Spaces, paragraph ends and line breaks, made visible.

What a word processor shows under "formatting marks": a dot on every space, a pilcrow closing every block, an arrow after every hard break. Decorations rather than content, so the marks are never in the document — not in its HTML, not in its JSON, not in what a collaborator receives.

Markers are found per block and cached on the block node, the way search hits are, so keeping them on while writing costs the paragraph being written and not the document.

```ts
editor.commands.toggleInvisibleCharacters()
editor.extensionState<InvisibleCharactersState>('invisibleCharacters')?.visible
```

```ts
import { invisibleCharacters } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `visible` | `boolean` | Start with the markers showing. Default false. |

**Commands** — `editor.commands.showInvisibleCharacters()`, `editor.commands.hideInvisibleCharacters()`, `editor.commands.toggleInvisibleCharacters()`

**Styles** — `import { invisibleCharactersCSS } from '@matrajs/core'`, a stylesheet string.

### lineHeight

*takes options · 0.36 kB gzipped*

Line height as an attribute on existing blocks.

Built the way alignment is: the attribute is declared here and lands on every type named, so a paragraph that knows nothing about line height still keeps, renders and parses it. The document stores the value it was given (`1.5`, `24px`) and the element gets `style="line-height: …"` — after the value has been checked, on the way in and on the way out alike.

```ts
editor.commands.setLineHeight(1.5)
editor.commands.setLineHeight('28px')
editor.commands.unsetLineHeight()
```

```ts
import { lineHeight } from '@matrajs/core'
```

**Commands** — `editor.commands.setLineHeight()`, `editor.commands.unsetLineHeight()`

### locked

*takes options · 0.8 kB gzipped*

Blocks that refuse to change.

A contract with clauses nobody may edit and blanks they may; a form letter whose greeting is fixed; a template where the headings stay and the prose beneath them is yours. Every editor makes the whole document editable or none of it, and the gap between those is what this fills.

The lock is an attribute, so it travels with the document, and the guard is a change filter rather than a read-only view: a keystroke, a paste, a drop, a drag and a command that would alter a locked node are all refused the same way, because all of them are changes. Nothing that leaves a locked node exactly as it was is refused — typing beside it, moving it, moving something past it — because nodes are immutable and an untouched node keeps its identity: every locked node of the old document has to be present, as the same object, in the new one. Top-level blocks nothing touched are the same objects too, so their locked nodes come out of a cache and the check costs the blocks that changed.

The lock itself is the one edit a locked node accepts, and undo of a lock is another, so `lock`, `unlock` and history all pass. `setContent` replaces the document rather than editing it and passes too.

```ts
import { locked } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `types` | `readonly string[]` | Node types that may carry the lock. Defaults to every block the bundled extensions define. A name the editor does not have is ignored, so the default list costs nothing in a small editor and covers the whole of a large one. |

**Commands** — `editor.commands.lock()`, `editor.commands.unlock()`, `editor.commands.toggleLock()`

**Styles** — `import { lockedCSS } from '@matrajs/core'`, a stylesheet string.

### placeholder

*takes options · 0.27 kB gzipped*

Prompt text for an empty editor.

Implemented as a data attribute on the editable element plus a CSS rule, rather than a fake node in the document — a placeholder that lives in the document is one a user can select, copy and accidentally save.

```ts
import { placeholder } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `text` (required) | `string` |  |
| `everyBlock` | `boolean` | Also prompt inside an empty block the caret is in, not just an empty document — the way a Notion-style page hints at every new line. |

**Styles** — `import { placeholderCSS } from '@matrajs/core'`, a stylesheet string.

### search

*takes options · 1.37 kB gzipped*

Find and replace.

Every match is a decoration, so nothing about searching touches the document, and replacing all of them is one transaction and one undo step.

Matches are recomputed per block and cached on the block node: typing in one paragraph rescans that paragraph and reads every other paragraph's matches back, so a search left open while writing costs the paragraph being written, not the document.

```ts
editor.commands.setSearch({ query: 'colour', caseSensitive: false })
editor.commands.nextMatch()
editor.commands.replaceMatch('color')
editor.commands.replaceAllMatches('color')
editor.commands.clearSearch()
```

```ts
import { search } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `name` | `string` | Extension name, and the key `editor.extensionState` reads. |
| `matchClass` | `string` | Class on every match. |
| `currentClass` | `string` | Class on the current match, in addition to `matchClass`. |

**Commands** — `editor.commands.setSearch()`, `editor.commands.clearSearch()`, `editor.commands.nextMatch()`, `editor.commands.previousMatch()`, `editor.commands.replaceMatch()`, `editor.commands.replaceAllMatches()`

**Styles** — `import { searchCSS } from '@matrajs/core'`, a stylesheet string.

### selectionHighlight

*takes options · 0.81 kB gzipped*

Every other occurrence of the selected word, highlighted.

What a code editor does when a name is selected, and what makes "is this used anywhere else" a glance rather than a search. Only a selection that could be a word qualifies: inside one textblock, no whitespace, at least `minLength` characters. The selected range itself is left alone, since the browser is already drawing that one.

Matches are found per top-level block and remembered on the block node with the query they were found for. Moving the selection to another occurrence of the same word rescans nothing; typing rescans the paragraph being typed in; selecting a different word rescans each block as it is reached. The result is memoised on the document and the selection, so a transaction that changed neither hands the renderer the same array and it draws nothing.

```ts
createEditor({ extensions: [...starterKit, selectionHighlight()] })
```

```ts
import { selectionHighlight } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `minLength` | `number` | The shortest selection that is looked for elsewhere. Default 2. |
| `caseSensitive` | `boolean` | Match case. Default false. |
| `wholeWord` | `boolean` | Whole words only, so a selected `cat` leaves `cats` alone. Default false. |
| `max` | `number` | The most matches drawn, so a common word in a long document stays cheap. Default 500. |

**Styles** — `import { selectionHighlightCSS } from '@matrajs/core'`, a stylesheet string.

### smartPaste

*takes options · 1.76 kB gzipped*

Paste what was meant, not what was copied.

A spreadsheet copied as text is tabs and newlines; a README copied from a terminal is Markdown; both arrive as a paragraph with the punctuation in it. This looks at plain text before the editor does and, when the shape is unmistakable, builds the table or parses the Markdown instead. Anything with real HTML on the clipboard is left to the parser, which already reads a table copied from a browser.

Needs the table nodes for the table half and whatever nodes the Markdown names for the other: a heading pasted into an editor with no heading extension stays text, because that editor cannot hold one.

```ts
import { smartPaste } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `tables` | `boolean` | Tab-separated and comma-separated text becomes a table. Default true. |
| `csv` | `boolean` | Comma-separated text counts as a table too. Default true. |
| `headerRow` | `boolean` | The first row of a pasted table is a header row. Default true. |
| `markdown` | `boolean` | Text that reads as Markdown is parsed as Markdown. Default true. |

### suggestion

*takes options · 0.54 kB gzipped*

```ts
import { suggestion } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `char` (required) | `string` | The character that opens it. `@` for mentions, `/` for commands. |
| `name` | `string` | Extension name, and therefore the key `editor.extensionState` is read by. Two suggestions on one editor need two names. |
| `startOfLine` | `boolean` | Only fire at the start of a block. What `/` menus usually want. |
| `allowSpaces` | `boolean` | Let the query contain spaces. Names have spaces; commands do not. |
| `maxLength` | `number` | Give up after this many characters, so a stray `@` stops matching. |
| `decorationClass` | `string` | Class on the decoration over the active range, for positioning a popup. |

**Commands** — `editor.commands.acceptSuggestion()`, `editor.commands.cancelSuggestion()`

**Keys** — `Escape` cancelSuggestion

**Styles** — `import { suggestionCSS } from '@matrajs/core'`, a stylesheet string.

### textAlign

*takes options · 0.36 kB gzipped*

Alignment as an attribute on existing blocks.

It is an extension rather than a node because alignment applies to whatever textblock is already there — turning a heading into a "centered heading" node type would double the schema for no gain. The attribute is declared here and lands on every type named, so a paragraph that knows nothing about alignment still keeps, renders and parses it.

```ts
import { textAlign } from '@matrajs/core'
```

**Commands** — `editor.commands.setTextAlign()`, `editor.commands.unsetTextAlign()`

**Keys** — `Mod-Shift-l` (ctx) => apply2(ctx, "left"), `Mod-Shift-e` (ctx) => apply2(ctx, "center"), `Mod-Shift-r` (ctx) => apply2(ctx, "right")

### textDirection

*takes options · 0.68 kB gzipped*

Text direction as an attribute on existing blocks, detected when unset.

A `dir` attribute on every type named, like `textAlign`: a paragraph that knows nothing about direction still keeps, renders and parses it, and a document with a Hebrew heading round-trips through HTML with `dir="rtl"` on the heading. Set it with the commands when the reader knows better than the text.

Left unset, the block's own text decides. Each block whose first strong character is right-to-left is drawn with `dir="rtl"` as a node decoration, so an Arabic paragraph typed into an English document reads the right way round without anybody choosing — and the JSON says nothing about it. The answer is remembered per top-level block on the block node, and the whole set is memoised on the document, so a caret move costs nothing.

```ts
editor.commands.setTextDirection('rtl')
editor.commands.unsetTextDirection()
```

```ts
import { textDirection } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `types` | `readonly string[]` | Which blocks carry a direction. Default paragraph and heading. |
| `auto` | `boolean` | Render a block whose text reads right to left that way, with nothing stored. Default true. |

**Commands** — `editor.commands.setTextDirection()`, `editor.commands.unsetTextDirection()`

### textTransform

*0.96 kB gzipped*

Change the case of the selection, or of the word under the caret.

Five commands: `uppercase`, `lowercase`, `capitalize` (the first letter of every word, the rest untouched), `sentenceCase` (the first letter of the selection and of every sentence after a full stop, everything else down) and `toggleCase` (all capitals go down, anything else goes up). With nothing selected each works on the word the caret is in.

The text is rewritten one text node at a time, so a bold word stays bold and a link stays a link. Locale-aware casing is used, which is why `ß` becomes `SS` and the selection is mapped afterwards rather than assumed to be the same width. A command that would change nothing returns false.

```ts
import { textTransform } from '@matrajs/core'
```

**Commands** — `editor.commands.uppercase()`, `editor.commands.lowercase()`, `editor.commands.capitalize()`, `editor.commands.sentenceCase()`, `editor.commands.toggleCase()`

### trailingNode

*takes options · 0.08 kB gzipped*

Always a paragraph at the end of the document.

A document that ends in a table, an image or a code block has nowhere to put a caret after it, and the only way to write below it is to know the trick. So whenever the last block is anything else, an empty paragraph is added after it — its own transaction, grouped by undo with whatever caused it.

```ts
import { trailingNode } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `node` | `string` | The node kept at the end. Default `paragraph`. |

### typewriter

*takes options · 0.68 kB gzipped*

The line being written stays put; the page moves under it.

What a typewriter did, and what a long writing session wants: the eye never travels down the screen to find the caret, because the caret never leaves the spot. After each edit or caret move the caret's line is scrolled to `position` of the scroller's visible height — the middle, unless asked otherwise.

The caret is measured in the next animation frame rather than as the change lands: the DOM was patched a moment ago and measuring it then would force a layout in the middle of the input path, where the browser was about to lay it out anyway. One frame per burst, however many events land in it. Nothing happens while the editor does not have focus, so a document changed by a peer or a script does not drag the reader's page about.

```ts
createEditor({ extensions: [...starterKit, typewriter({ position: 0.4 })] })
editor.commands.toggleTypewriter()
```

```ts
import { typewriter } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `position` | `number` | Where the caret's line is kept, as a fraction of the visible height: 0 is the top, 1 the bottom. Default 0.5. |
| `smooth` | `boolean` | Glide there rather than jump. Default false. |
| `scroller` | `HTMLElement | (() => HTMLElement | null)` | The element that scrolls, or a function that finds it. Default the page. |

**Commands** — `editor.commands.enableTypewriter()`, `editor.commands.disableTypewriter()`, `editor.commands.toggleTypewriter()`

### typography

*0.2 kB gzipped*

```ts
import { typography } from '@matrajs/core'
```

### uniqueId

*takes options · 0.18 kB gzipped*

Declare the attribute so the schema keeps it.

Without this the id is dropped on the way in: undeclared attributes do not survive, which is a security property rather than an oversight. The id is written to the element as `data-<attribute>` and read back from there, so it survives HTML as well as JSON.

```ts
import { uniqueId } from '@matrajs/core'
```

| Option | Type | |
| --- | --- | --- |
| `types` | `string[]` | Which node types get an id. Defaults to the blocks in the box. |
| `attribute` | `string` | The attribute the id is written to. |
| `generate` | `() => string` | Supply your own, when the ids have to match something outside the editor. |

