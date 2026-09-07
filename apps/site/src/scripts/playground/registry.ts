/**
 * Every extension the playground offers, named explicitly.
 *
 * Reaching them as `core[name]` would be shorter and would cost the whole
 * site: a dynamic property read is opaque to Rollup, so it must retain every
 * export of the barrel, and the chunk that lands in is one the landing page
 * shares. Naming them keeps tree-shaking able to reason about the graph.
 */
// @ts-expect-error — query suffix makes a distinct module id; see astro.config.mjs.
import * as core from '@matrajs/core?catalogue'

export const REGISTRY: Record<string, unknown> = {
  // The floor. Measured at zero marginal cost because it is the baseline every
  // other figure is measured against, so it carries no row in the catalogue —
  // but the editor does not exist without it.
  document: core.document,
  paragraph: core.paragraph,
  text: core.text,
  bold: core.bold,
  italic: core.italic,
  strike: core.strike,
  code: core.code,
  underline: core.underline,
  highlight: core.highlight,
  link: core.link,
  subscript: core.subscript,
  superscript: core.superscript,
  kbd: core.kbd,
  textStyle: core.textStyle,
  comment: core.comment,
  heading: core.heading,
  blockquote: core.blockquote,
  codeBlock: core.codeBlock,
  horizontalRule: core.horizontalRule,
  hardBreak: core.hardBreak,
  image: core.image,
  callout: core.callout,
  details: core.details,
  detailsSummary: core.detailsSummary,
  youtube: core.youtube,
  embed: core.embed,
  pageBreak: core.pageBreak,
  columnList: core.columnList,
  column: core.column,
  mathBlock: core.mathBlock,
  bulletList: core.bulletList,
  orderedList: core.orderedList,
  listItem: core.listItem,
  taskList: core.taskList,
  taskItem: core.taskItem,
  table: core.table,
  tableRow: core.tableRow,
  tableCell: core.tableCell,
  tableHeader: core.tableHeader,
  uniqueId: core.uniqueId,
  dragHandle: core.dragHandle,
  focus: core.focus,
  trailingNode: core.trailingNode,
  fileHandler: core.fileHandler,
  locked: core.locked,
  field: core.field,
  imageResize: core.imageResize,
  footnoteRef: core.footnoteRef,
  footnote: core.footnote,
  footnotes: core.footnotes,
  characterCount: core.characterCount,
  textAlign: core.textAlign,
  indent: core.indent,
  typography: core.typography,
  emoji: core.emoji,
  autolink: core.autolink,
  clearFormatting: core.clearFormatting,
  search: core.search,
  codeHighlight: core.codeHighlight,
  history: core.history,
  smartPaste: core.smartPaste,
  textTransform: core.textTransform,
  selectionHighlight: core.selectionHighlight,
  invisibleCharacters: core.invisibleCharacters,
  textDirection: core.textDirection,
  lineHeight: core.lineHeight,
  typewriter: core.typewriter,
  hashtag: core.hashtag,
  mathInline: core.mathInline,
  mention: core.mention,
  dictation: core.dictation,
}

export const SHEETS: Record<string, string> = {
  calloutCSS: core.calloutCSS,
  codeHighlightCSS: core.codeHighlightCSS,
  columnsCSS: core.columnsCSS,
  commentCSS: core.commentCSS,
  detailsCSS: core.detailsCSS,
  dictationCSS: core.dictationCSS,
  dragHandleCSS: core.dragHandleCSS,
  embedCSS: core.embedCSS,
  fieldsCSS: core.fieldsCSS,
  footnotesCSS: core.footnotesCSS,
  ghostTextCSS: core.ghostTextCSS,
  imageResizeCSS: core.imageResizeCSS,
  invisibleCharactersCSS: core.invisibleCharactersCSS,
  lockedCSS: core.lockedCSS,
  mathCSS: core.mathCSS,
  pageBreakCSS: core.pageBreakCSS,
  placeholderCSS: core.placeholderCSS,
  searchCSS: core.searchCSS,
  selectionHighlightCSS: core.selectionHighlightCSS,
  suggestionCSS: core.suggestionCSS,
  taskListCSS: core.taskListCSS,
  youtubeCSS: core.youtubeCSS,
}

/**
 * The extensions the playground needs to call with options rather than take as
 * they come. Named, like everything else here, so Rollup can still reason about
 * the graph.
 */
export const REGISTRY_FACTORY = {
  mathInline: core.mathInline,
  mathBlock: core.mathBlock,
}

export const { createEditor } = core

/**
 * The two helpers the interface needs and the document does not.
 *
 * `commentRanges` is how a margin finds out where the threads are — the mark
 * carries only an id, deliberately, so the anchor is read back off the
 * document rather than stored twice. `tableOfContents` is the same idea for
 * headings: an outline is a *reading* of the document, not a thing kept beside
 * it, so it cannot go stale.
 */
export const commentRanges = core.commentRanges as (doc: unknown) => {
  threadId: string
  from: number
  to: number
  text: string
}[]
export const tableOfContents = core.tableOfContents as (doc: unknown) => {
  level: number
  text: string
  id?: string
  pos?: number
}[]
export const activeSuggestion = core.activeSuggestion
export const CONFIGURE = {
  autosave: core.autosave,
  /*
    The one kit the playground cannot take apart.

    `footnoteRef`, `footnote` and `footnotes` are three nodes and no commands —
    the numbering and `insertFootnote` live in a fourth, unexported extension
    that only `footnotesKit()` can hand out. Ticking the three nodes alone gives
    a schema that can hold footnotes and an editor that cannot make one.
  */
  footnotesKit: core.footnotesKit,
  bubbleMenu: core.bubbleMenu,
  floatingMenu: core.floatingMenu,
  ghostText: core.ghostText,
  placeholder: core.placeholder,
  snippets: core.snippets,
  suggestion: core.suggestion,
}
