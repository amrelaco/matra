/**
 * Every command this site is willing to put behind a button.
 *
 * One catalogue, three consumers: the playground's top bar, the bubble menu
 * that appears over a selection, and the block menu on an empty line. They
 * differ in which rows they take, never in what a row means — so a command
 * renamed here is renamed in all three, and a button can never claim to do
 * something the editor spells differently.
 *
 * `ext` is the extension that supplies the command. That is the whole contract
 * for showing a button: the editor either has `cmd` on `editor.commands` or it
 * does not, and a button whose command is missing is hidden rather than left
 * to fail quietly.
 */
import {
  Heading01Icon,
  Heading02Icon,
  Heading03Icon,
  RedoIcon,
  TextAlignCenterIcon,
  UndoIcon,
} from '@hugeicons/core-free-icons'
import type { IconData } from '../scripts/icon'

export type ToolGroup =
  | 'history'
  | 'block'
  | 'mark'
  | 'list'
  | 'insert'
  | 'table'
  | 'layout'
  | 'edit'

export interface Tool {
  /** The extension that supplies it. */
  ext: string
  cmd: string
  /** Literal arguments, serialised into the button and parsed back as JSON. */
  args: unknown[]
  /** The long form, for the tooltip. */
  title: string
  /** The short form, for toolbars that show words rather than glyphs. */
  label: string
  group: ToolGroup
  /** Offered in the bubble menu over a selection. */
  bubble?: boolean
  /** Overrides the extension's glyph, where one row per level needs telling apart. */
  icon?: IconData
  /** What `isActive` should be asked about, when it is not the extension. */
  active?: string
  activeAttrs?: Record<string, unknown>
}

export const TOOLS: Tool[] = [
  // --- history -------------------------------------------------------------
  {
    ext: 'history',
    cmd: 'undo',
    args: [],
    label: 'Undo',
    group: 'history',
    title: 'Undo, grouped by word rather than by keystroke',
    icon: UndoIcon as IconData,
  },
  {
    ext: 'history',
    cmd: 'redo',
    args: [],
    label: 'Redo',
    group: 'history',
    title: 'Redo',
    icon: RedoIcon as IconData,
  },

  // --- block type ----------------------------------------------------------
  {
    ext: 'heading',
    cmd: 'toggleHeading',
    args: [1],
    label: 'H1',
    group: 'block',
    title: 'Heading 1',
    active: 'heading',
    activeAttrs: { level: 1 },
    bubble: true,
    icon: Heading01Icon as IconData,
  },
  {
    ext: 'heading',
    cmd: 'toggleHeading',
    args: [2],
    label: 'H2',
    group: 'block',
    title: 'Heading 2',
    active: 'heading',
    activeAttrs: { level: 2 },
    bubble: true,
    icon: Heading02Icon as IconData,
  },
  {
    ext: 'heading',
    cmd: 'toggleHeading',
    args: [3],
    label: 'H3',
    group: 'block',
    title: 'Heading 3',
    active: 'heading',
    activeAttrs: { level: 3 },
    icon: Heading03Icon as IconData,
  },
  {
    ext: 'blockquote',
    cmd: 'toggleBlockquote',
    args: [],
    label: 'Quote',
    group: 'block',
    title: 'A quote, which holds blocks rather than text',
    bubble: true,
  },
  {
    ext: 'codeBlock',
    cmd: 'toggleCodeBlock',
    args: [],
    label: 'Code block',
    group: 'block',
    title: 'A fenced block that takes no marks',
  },
  {
    ext: 'callout',
    cmd: 'toggleCallout',
    args: [],
    label: 'Callout',
    group: 'block',
    title: 'A note, warning or tip with an emoji on the front',
  },

  // --- marks ---------------------------------------------------------------
  {
    ext: 'bold',
    cmd: 'toggleBold',
    args: [],
    label: 'Bold',
    group: 'mark',
    title: 'Bold · Mod-B',
    bubble: true,
  },
  {
    ext: 'italic',
    cmd: 'toggleItalic',
    args: [],
    label: 'Italic',
    group: 'mark',
    title: 'Italic · Mod-I',
    bubble: true,
  },
  {
    ext: 'underline',
    cmd: 'toggleUnderline',
    args: [],
    label: 'Underline',
    group: 'mark',
    title: 'Underlined · Mod-U',
    bubble: true,
  },
  {
    ext: 'strike',
    cmd: 'toggleStrike',
    args: [],
    label: 'Strike',
    group: 'mark',
    title: 'Struck through',
    bubble: true,
  },
  {
    ext: 'code',
    cmd: 'toggleCode',
    args: [],
    label: 'Code',
    group: 'mark',
    title: 'Inline code',
    bubble: true,
  },
  {
    ext: 'highlight',
    cmd: 'toggleHighlight',
    args: [],
    label: 'Highlight',
    group: 'mark',
    title: 'Highlighted',
    bubble: true,
  },
  {
    ext: 'link',
    cmd: 'setLink',
    args: [],
    label: 'Link',
    group: 'mark',
    title: 'Link the selection · asks for the address',
    bubble: true,
  },
  {
    ext: 'comment',
    cmd: 'addComment',
    args: [],
    label: 'Comment',
    group: 'mark',
    title: 'Comment on the selection · opens a thread in the margin',
    bubble: true,
  },
  {
    ext: 'subscript',
    cmd: 'toggleSubscript',
    args: [],
    label: 'Sub',
    group: 'mark',
    title: 'Subscript',
  },
  {
    ext: 'superscript',
    cmd: 'toggleSuperscript',
    args: [],
    label: 'Super',
    group: 'mark',
    title: 'Superscript',
  },
  {
    ext: 'kbd',
    cmd: 'toggleKbd',
    args: [],
    label: 'Key',
    group: 'mark',
    title: 'A key name, as <kbd> · "press Ctrl"',
  },
  {
    ext: 'textStyle',
    cmd: 'setColor',
    args: ['#c2554d'],
    label: 'Colour',
    group: 'mark',
    title: 'Colour the selected words · a mark, so it stops where they do',
    // It colours a selection, so the selection is where it should be offered.
    bubble: true,
  },

  // --- lists ---------------------------------------------------------------
  {
    ext: 'bulletList',
    cmd: 'toggleBulletList',
    args: [],
    label: 'Bullets',
    group: 'list',
    title: 'Bulleted list',
  },
  {
    ext: 'orderedList',
    cmd: 'toggleOrderedList',
    args: [],
    label: 'Numbers',
    group: 'list',
    title: 'Numbered list',
  },
  {
    ext: 'taskList',
    cmd: 'toggleTaskList',
    args: [],
    label: 'To-do',
    group: 'list',
    title: 'Checkboxes · Tab nests, Shift-Tab lifts',
  },

  // --- things you drop in --------------------------------------------------
  {
    ext: 'horizontalRule',
    cmd: 'insertHorizontalRule',
    args: [],
    label: 'Divider',
    group: 'insert',
    title: 'A divider · one position, no insides',
  },
  {
    ext: 'hardBreak',
    cmd: 'insertHardBreak',
    args: [],
    label: 'Break',
    group: 'insert',
    title: 'A line break inside a block',
  },
  {
    ext: 'image',
    cmd: 'insertImage',
    args: [{ src: '/og.png', alt: 'The Matra social card' }],
    label: 'Image',
    group: 'insert',
    title: 'An image · drag its edge to resize when imageResize is on',
  },
  {
    ext: 'youtube',
    cmd: 'insertYoutube',
    args: [{ src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
    label: 'Video',
    group: 'insert',
    title: 'A YouTube embed, from any form of its URL',
  },
  {
    ext: 'embed',
    cmd: 'insertEmbed',
    args: ['https://player.vimeo.com/video/76979871'],
    label: 'Embed',
    group: 'insert',
    title: 'Any URL in an iframe, at a fixed aspect',
  },
  {
    ext: 'details',
    cmd: 'insertDetails',
    args: [],
    label: 'Toggle',
    group: 'insert',
    title: 'A disclosure · a summary you click to open',
  },
  {
    ext: 'pageBreak',
    cmd: 'insertPageBreak',
    args: [],
    label: 'Page break',
    group: 'insert',
    title: 'A labelled line on screen, a new page in print',
  },
  {
    ext: 'mathInline',
    cmd: 'insertInlineMath',
    args: ['e^{i\\pi} + 1 = 0'],
    label: 'Formula',
    group: 'insert',
    title: 'LaTeX in a line of prose',
  },
  {
    ext: 'mathBlock',
    cmd: 'insertBlockMath',
    args: ['\\int_0^1 x^2\\,dx = \\tfrac{1}{3}'],
    label: 'Equation',
    group: 'insert',
    title: 'LaTeX as its own block',
  },
  {
    ext: 'footnote',
    cmd: 'insertFootnote',
    args: [],
    label: 'Footnote',
    group: 'insert',
    title: 'A numbered reference, and its note at the foot',
  },
  {
    ext: 'field',
    cmd: 'insertField',
    args: ['city', 'City'],
    label: 'Field',
    group: 'insert',
    title: 'A blank a template fills in',
  },
  {
    ext: 'mention',
    cmd: 'insertMention',
    args: [{ id: 'nahim', label: 'Nahim' }],
    label: 'Mention',
    group: 'insert',
    title: 'A mention · type @ for the menu when suggestion is on',
  },

  // --- tables --------------------------------------------------------------
  {
    ext: 'table',
    cmd: 'insertTable',
    args: [3, 3],
    label: 'Table',
    group: 'table',
    title: 'Rows, columns, header cells · Tab moves between them',
  },
  {
    ext: 'tableRow',
    cmd: 'addRowAfter',
    args: [],
    label: 'Row',
    group: 'table',
    title: 'One row, after this one',
  },
  {
    ext: 'tableCell',
    cmd: 'addColumnAfter',
    args: [],
    label: 'Column',
    group: 'table',
    title: 'One column, after this one',
  },
  {
    ext: 'tableHeader',
    cmd: 'toggleHeaderRow',
    args: [],
    label: 'Header',
    group: 'table',
    title: 'Make this row a header row',
  },

  // --- layout --------------------------------------------------------------
  {
    ext: 'columnList',
    cmd: 'setColumns',
    args: [2],
    label: 'Columns',
    group: 'layout',
    title: 'Split this block into columns',
  },
  {
    ext: 'column',
    cmd: 'addColumn',
    args: [],
    label: 'Add column',
    group: 'layout',
    title: 'One more column',
  },
  {
    ext: 'textAlign',
    cmd: 'setTextAlign',
    args: ['center'],
    label: 'Centre',
    group: 'layout',
    title: 'Centre this block',
    icon: TextAlignCenterIcon as IconData,
  },
  {
    ext: 'indent',
    cmd: 'indent',
    args: [],
    label: 'Indent',
    group: 'layout',
    title: 'A paragraph or heading moved in a level',
  },
  {
    ext: 'lineHeight',
    cmd: 'setLineHeight',
    args: [1.8],
    label: 'Line height',
    group: 'layout',
    title: 'Line height on a block, as a checked style',
  },
  {
    ext: 'blockColor',
    // The command is nominal · the palette opens instead, and applies whichever
    // swatch is pressed. `args` stays empty so nothing fires on a plain click.
    cmd: 'setBlockBackground',
    args: [],
    label: 'Block colour',
    group: 'layout',
    title: 'Colour the block · text and background, on the block itself',
    /*
      In the bubble menu as well as the bar, because that is the only place it
      can be reached in two of the four interfaces: Notion mode draws no
      toolbar at all, so a tool that is not on the selection is a tool that
      does not exist there. It is also where Notion itself keeps colour.
    */
    bubble: true,
  },
  {
    ext: 'textDirection',
    cmd: 'setTextDirection',
    args: ['rtl'],
    label: 'RTL',
    group: 'layout',
    title: 'Right to left, on this block',
  },

  // --- editing behaviour ---------------------------------------------------
  {
    ext: 'clearFormatting',
    cmd: 'clearFormatting',
    args: [],
    label: 'Clear',
    group: 'edit',
    title: 'Every mark off, every block a paragraph · one undo step',
    bubble: true,
  },
  {
    ext: 'textTransform',
    cmd: 'sentenceCase',
    args: [],
    label: 'Case',
    group: 'edit',
    title: 'Sentence case on the selection or the word',
    bubble: true,
  },
  {
    ext: 'locked',
    cmd: 'lock',
    args: [],
    label: 'Lock',
    group: 'edit',
    title: 'Blocks that refuse every change · a template with fixed clauses',
  },
  {
    ext: 'invisibleCharacters',
    cmd: 'toggleInvisibleCharacters',
    args: [],
    label: 'Invisibles',
    group: 'edit',
    title: 'A dot on every space, a pilcrow on every block · drawn, never stored',
  },
  {
    ext: 'typewriter',
    cmd: 'toggleTypewriter',
    args: [],
    label: 'Typewriter',
    group: 'edit',
    title: 'Keep the caret line in the middle of the view',
  },
  {
    ext: 'dictation',
    cmd: 'startDictation',
    args: [],
    label: 'Dictate',
    group: 'edit',
    title: 'Speak, and the words arrive at the caret · the browser’s own recogniser',
  },
]

/** The bubble menu's rows, in the order a selection wants them. */
export const BUBBLE_TOOLS = TOOLS.filter((tool) => tool.bubble)

const BLOCK_COMMANDS = new Set([
  'toggleHeading',
  'toggleBulletList',
  'toggleOrderedList',
  'toggleTaskList',
  'toggleBlockquote',
  'toggleCodeBlock',
  'toggleCallout',
  'insertTable',
  'insertImage',
  'insertHorizontalRule',
])

/** The block menu on an empty line · what a line could become. */
export const BLOCK_TOOLS = TOOLS.filter((tool) => BLOCK_COMMANDS.has(tool.cmd))

/** The bar above the document, in reading order rather than catalogue order. */
export const BAR_ORDER: ToolGroup[] = [
  'history',
  'block',
  'mark',
  'list',
  'insert',
  'table',
  'layout',
  'edit',
]
