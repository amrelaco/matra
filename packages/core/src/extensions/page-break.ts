import type { Command, NodeDef } from '../types'

/**
 * A page break.
 *
 * A block atom with nothing inside, like a horizontal rule: the caret steps
 * over it, Backspace removes the whole thing, and inserting one at a caret in
 * the middle of a paragraph cuts the paragraph around it. On screen it is a
 * labelled dashed line; in print it is where the page ends and nothing else.
 *
 * The element is marked non-editable in its own DOM, as the YouTube embed
 * is, so an empty `<div>` inside the editor never becomes a line the caret
 * can sit on.
 *
 * ```ts
 * editor.commands.insertPageBreak()
 * ```
 */
export const pageBreak = {
  kind: 'node',
  name: 'pageBreak' as const,
  group: 'block',
  atom: true,
  selectable: true,
  parseDOM: [{ tag: 'div[data-page-break]' }],
  toDOM: () => [
    'div',
    { 'data-page-break': '', class: 'matra-page-break', contenteditable: 'false' },
  ],
  commands: {
    insertPageBreak: (ctx) => ctx.insert({ type: 'pageBreak' }),
  },
} satisfies NodeDef<{ insertPageBreak: Command }>

/**
 * A dashed line with its name on it, and a real page break when printed.
 *
 * The label is a pseudo-element rather than text in the document, so it is
 * never selected, copied or read out — and it can be hidden for print.
 */
export const pageBreakCSS = `
.matra-page-break { position: relative; height: 0; margin: 1.5em 0; border-top: 1px dashed var(--matra-page-break, #b0b0b0); user-select: none; }
.matra-page-break::before { content: 'Page break'; position: absolute; top: 0; left: 50%; transform: translate(-50%, -50%); padding: 0 0.5em; font-size: 0.75em; line-height: 1.6; letter-spacing: 0.06em; text-transform: uppercase; color: var(--matra-page-break, #b0b0b0); background: var(--matra-page-break-bg, Canvas); }
@media print {
  .matra-page-break { break-after: page; page-break-after: always; height: 0; margin: 0; border: 0; }
  .matra-page-break::before { display: none; }
}
`
