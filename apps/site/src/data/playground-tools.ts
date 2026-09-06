/**
 * The toolbar the playground draws over its editor.
 *
 * A ticked extension you cannot reach is not a demonstration. `bold` does
 * nothing visible unless you already know Mod-B, and `table` has no keystroke
 * at all — so every command that takes no argument, or takes a literal one,
 * gets a button, and the button is shown only while the editor actually has
 * that command.
 *
 * Generated from the `use` column of the extensions directory, so a command
 * renamed there is renamed here.
 */
export interface Tool {
  /** The extension that supplies it. */
  ext: string
  cmd: string
  args: number[]
  title: string
}

export const TOOLS: Tool[] = [
  { ext: 'bold', cmd: 'toggleBold', args: [], title: 'Bold' },
  { ext: 'italic', cmd: 'toggleItalic', args: [], title: 'Italic' },
  { ext: 'strike', cmd: 'toggleStrike', args: [], title: 'Struck through' },
  { ext: 'code', cmd: 'toggleCode', args: [], title: 'Inline code' },
  { ext: 'underline', cmd: 'toggleUnderline', args: [], title: 'Underlined' },
  { ext: 'subscript', cmd: 'toggleSubscript', args: [], title: 'Subscript' },
  { ext: 'superscript', cmd: 'toggleSuperscript', args: [], title: 'Superscript' },
  { ext: 'kbd', cmd: 'toggleKbd', args: [], title: 'A key name, as <kbd> · "press Ctrl"' },
  { ext: 'heading', cmd: 'toggleHeading', args: [2], title: 'Levels one to six' },
  {
    ext: 'blockquote',
    cmd: 'toggleBlockquote',
    args: [],
    title: 'A quote, which holds blocks rather than text',
  },
  {
    ext: 'codeBlock',
    cmd: 'toggleCodeBlock',
    args: [],
    title: 'A fenced block that takes no marks',
  },
  {
    ext: 'horizontalRule',
    cmd: 'insertHorizontalRule',
    args: [],
    title: 'A divider · one position, no insides',
  },
  { ext: 'hardBreak', cmd: 'insertHardBreak', args: [], title: 'A line break inside a block' },
  {
    ext: 'pageBreak',
    cmd: 'insertPageBreak',
    args: [],
    title: 'A labelled line on screen, a new page in print',
  },
  { ext: 'column', cmd: 'addColumn', args: [], title: 'One column, which holds blocks' },
  { ext: 'bulletList', cmd: 'toggleBulletList', args: [], title: 'Bulleted' },
  { ext: 'orderedList', cmd: 'toggleOrderedList', args: [], title: 'Numbered' },
  { ext: 'taskList', cmd: 'toggleTaskList', args: [], title: 'Checkboxes' },
  {
    ext: 'taskItem',
    cmd: 'toggleTaskItem',
    args: [],
    title: 'One checkbox · a real input the caret cannot enter',
  },
  {
    ext: 'table',
    cmd: 'insertTable',
    args: [3, 3],
    title: 'Rows, columns, header cells and column widths · Tab moves between cells',
  },
  { ext: 'tableRow', cmd: 'addRowAfter', args: [], title: 'One row' },
  {
    ext: 'tableCell',
    cmd: 'addColumnAfter',
    args: [],
    title: 'One cell, which holds blocks · a spanning cell widens rather than splits',
  },
  { ext: 'tableHeader', cmd: 'toggleHeaderRow', args: [], title: 'A header cell' },
  {
    ext: 'locked',
    cmd: 'lock',
    args: [],
    title: 'Blocks that refuse every change · a template with fixed clauses',
  },
  {
    ext: 'indent',
    cmd: 'indent',
    args: [],
    title: 'A paragraph or heading moved in and out, a level at a time',
  },
  {
    ext: 'clearFormatting',
    cmd: 'clearFormatting',
    args: [],
    title: 'Every mark off, every block a paragraph · one undo step',
  },
  {
    ext: 'history',
    cmd: 'undo',
    args: [],
    title: 'Undo that groups by word, not by keystroke',
  },
  {
    ext: 'textTransform',
    cmd: 'sentenceCase',
    args: [],
    title: 'Upper, lower, title and sentence case on the selection or the word',
  },
  {
    ext: 'invisibleCharacters',
    cmd: 'toggleInvisibleCharacters',
    args: [],
    title: 'A dot on every space, a pilcrow on every block · drawn, never stored',
  },
  {
    ext: 'lineHeight',
    cmd: 'setLineHeight',
    args: [1.5],
    title: 'Line height on a block, as a checked style',
  },
  {
    ext: 'dictation',
    cmd: 'startDictation',
    args: [],
    title: 'Speak, and the words arrive at the caret · the browser’s own recogniser',
  },
]
