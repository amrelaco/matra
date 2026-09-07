/**
 * What each extension looks like when it is doing its job.
 *
 * Ticking a box proves the array changed; it does not prove the extension
 * works. Every entry here closes that gap in one of three ways: content that
 * is dropped into the document, a command run against what is selected, or —
 * for the extensions whose whole point is that they wait for you — a line
 * saying which keystroke wakes them.
 *
 * `where` says where to look, because half of these do not draw in the
 * document at all: `search` opens a panel, `characterCount` puts a number in
 * the margin, `bubbleMenu` waits for a selection.
 */
export interface Demo {
  /** One line: what to do, or what just happened. */
  try: string
  /** Content dropped into the document when "Show me" is pressed. */
  html?: string
  /** Or a command run instead, against the caret or the selection. */
  run?: { cmd: string; args?: unknown[] }
  /** Text this demo wants selected before the command runs. */
  select?: string
  /** Where the proof appears. */
  where?: 'doc' | 'rail' | 'menu' | 'margin' | 'keys'
}

const mark = (cmd: string, phrase: string, hint: string): Demo => ({
  try: hint,
  run: { cmd },
  select: phrase,
  where: 'doc',
})

export const DEMOS: Record<string, Demo> = {
  // --- marks ---------------------------------------------------------------
  bold: mark(
    'toggleBold',
    'measured, not quoted',
    'Select any words and press Mod-B, or use the bubble menu.',
  ),
  italic: mark(
    'toggleItalic',
    'a real Matra document',
    'Select words and press Mod-I. Or type *stars* around them.',
  ),
  strike: mark(
    'toggleStrike',
    'not quoted',
    'Select and press Mod-Shift-X. Or type ~~tildes~~.',
  ),
  code: mark(
    'toggleCode',
    'extension array',
    'Select and press Mod-E. Or type `backticks` around a word.',
  ),
  underline: mark('toggleUnderline', 'feature list', 'Select and press Mod-U.'),
  highlight: mark('toggleHighlight', 'rebuilt around it', 'Select and press Mod-Shift-H.'),
  link: {
    try: 'Select words, press the link button, and give it an address.',
    run: { cmd: 'setLink', args: [{ href: 'https://matrajs.com/docs' }] },
    select: 'A document, not a demo',
    where: 'doc',
  },
  subscript: mark('toggleSubscript', 'not a demo', 'Select and press Mod-,'),
  superscript: mark('toggleSuperscript', 'not a demo', 'Select and press Mod-.'),
  kbd: mark(
    'toggleKbd',
    'Enter',
    'Select a key name and press the Key button · it renders as <kbd>.',
  ),
  textStyle: {
    try: 'Colour, font and size, carried as checked attributes rather than raw style.',
    run: { cmd: 'setColor', args: ['#c2554d'] },
    select: 'A document, not a demo',
    where: 'doc',
  },
  comment: {
    try: 'Select something and press Comment · the thread opens in the margin, like a document you share.',
    where: 'margin',
  },

  // --- blocks --------------------------------------------------------------
  heading: {
    try: 'Start a line with ## and a space, or press H1 / H2 above.',
    html: '<h2>A heading, made by typing two hashes</h2><p>The input rule is one undo step, so Mod-Z gives the hashes back.</p>',
  },
  blockquote: {
    try: 'Start a line with > and a space. Press Enter twice to leave.',
    html: '<blockquote><p>A quote holds blocks, not text — so it can hold a list, or another quote.</p></blockquote>',
  },
  codeBlock: {
    try: 'Type three backticks and a space. Marks do not apply inside.',
    html: '<pre><code>const editor = createEditor({\n  extensions: [document, paragraph, text],\n})</code></pre>',
  },
  horizontalRule: {
    try: 'Type three dashes on an empty line.',
    run: { cmd: 'insertHorizontalRule' },
  },
  hardBreak: {
    try: 'Press Shift-Enter for a break that stays inside the block.',
    run: { cmd: 'insertHardBreak' },
  },
  image: {
    try: 'Drop an image in, or press the Image button.',
    run: { cmd: 'insertImage', args: [{ src: '/og.png', alt: 'The Matra social card' }] },
  },
  callout: {
    try: 'A note, a warning or a tip · the emoji is an attribute, so it round-trips.',
    html: '<div data-callout="info" data-emoji="💡"><p>Callouts hold blocks. Put a list in one and it stays a list.</p></div>',
  },
  details: {
    try: 'A disclosure. Click the summary to fold it away.',
    html: '<details open><summary>What is inside a details block?</summary><p>Blocks. It is a container, so it nests, and the open state is stored on the node.</p></details>',
  },
  detailsSummary: {
    try: 'The line you click. It comes with details and cannot be used alone.',
    where: 'doc',
  },
  youtube: {
    try: 'Paste any form of a YouTube URL · the id is parsed out of it.',
    run: {
      cmd: 'insertYoutube',
      args: [{ src: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' }],
    },
  },
  // A host on the extension's own allow-list. Anything else is refused — an
  // arbitrary site framed inside a document is a phishing page waiting for its
  // text — so pointing this at matrajs.com made the button do nothing.
  embed: {
    try: 'An allowed URL in an iframe, at a fixed aspect ratio.',
    run: { cmd: 'insertEmbed', args: ['https://player.vimeo.com/video/76979871'] },
  },
  pageBreak: {
    try: 'A labelled line on screen, a real page break when printed.',
    run: { cmd: 'insertPageBreak' },
  },
  columnList: {
    try: 'Put the caret in a paragraph and press Columns.',
    html: '<div data-columns><div data-column><p>The left column. Blocks go in here.</p></div><div data-column><p>And the right. Drag the caret between them.</p></div></div>',
  },
  column: { try: 'One column. It arrives with columnList and holds blocks.', where: 'doc' },
  mathBlock: {
    try: 'LaTeX as its own block, rendered where it stands.',
    run: { cmd: 'insertBlockMath', args: ['\\int_0^1 x^2\\,dx = \\tfrac{1}{3}'] },
  },

  // --- lists ---------------------------------------------------------------
  bulletList: {
    try: 'Start a line with a dash and a space. Tab nests, Shift-Tab lifts.',
    html: '<ul><li><p>A dash and a space starts one</p></li><li><p>Tab here nests it under the line above</p></li></ul>',
  },
  orderedList: {
    try: 'Start a line with "1." and a space.',
    html: '<ol><li><p>Numbered from the document, not from a counter</p></li><li><p>Delete one and the rest renumber</p></li></ol>',
  },
  listItem: {
    try: 'The item itself. Enter splits it, Backspace at the start lifts it out.',
    where: 'doc',
  },
  taskList: {
    try: 'Tick the boxes · the checked state is an attribute on the item.',
    html: '<ul data-type="taskList"><li data-checked="true"><p>Tick this one and the text goes through</p></li><li data-checked="false"><p>Press Enter here for another box</p></li></ul>',
  },
  taskItem: {
    try: 'One checkbox. Click it, or press Mod-Enter with the caret inside.',
    where: 'doc',
  },

  // --- structure -----------------------------------------------------------
  table: {
    try: 'Tab moves between cells; the last Tab makes a new row.',
    run: { cmd: 'insertTable', args: [3, 3] },
  },
  tableRow: { try: 'Press Row to add one after the caret.', run: { cmd: 'addRowAfter' } },
  tableCell: {
    try: 'A cell holds blocks. Press Column to add one.',
    run: { cmd: 'addColumnAfter' },
  },
  tableHeader: {
    try: 'Press Header to turn the caret’s row into header cells.',
    run: { cmd: 'toggleHeaderRow' },
  },
  tableOfContents: {
    try: 'The outline in the margin, rebuilt from the document on every change.',
    where: 'rail',
  },
  uniqueId: {
    try: 'Every block gets a stable id. Open the code drawer and read the HTML.',
    where: 'rail',
  },
  dragHandle: {
    try: 'Hover any block · a handle appears in the margin. Drag it to move the block.',
    where: 'margin',
  },
  focus: {
    try: 'The block the caret is in carries a class, so it can be styled apart from the rest.',
    where: 'doc',
  },
  trailingNode: {
    try: 'The document always ends in an empty paragraph, so there is somewhere to click.',
    where: 'doc',
  },
  fileHandler: {
    try: 'Drag an image file onto the document, or paste one from the clipboard.',
    where: 'doc',
  },
  locked: {
    try: 'Press Lock with the caret in a block · then try to type in it.',
    html: '<p data-locked="true">This clause is locked. Put the caret here and type, paste or drag: nothing lands.</p>',
  },
  field: {
    try: 'A blank a template fills in. Click one and type.',
    html: '<p>Dear <span data-field="name" data-field-label="Name"></span>, we are writing from <span data-field="city" data-field-label="City"></span>.</p>',
  },
  imageResize: { try: 'Insert an image, then drag the handle on its edge.', where: 'doc' },
  footnoteRef: {
    try: 'The little number in the text. Click it to jump to the note.',
    where: 'doc',
  },
  footnote: {
    try: 'Press Footnote · a reference goes in the text and its note at the foot.',
    run: { cmd: 'insertFootnote' },
  },
  footnotes: {
    try: 'The ordered list at the end. It renumbers itself when a reference moves.',
    where: 'doc',
  },

  // --- writing -------------------------------------------------------------
  placeholder: { try: 'Empty the document and the prompt appears in its place.', where: 'doc' },
  characterCount: {
    try: 'Words and characters in the margin, counted from the document.',
    where: 'rail',
  },
  textAlign: {
    try: 'Press Centre with the caret in a block.',
    run: { cmd: 'setTextAlign', args: ['center'] },
  },
  indent: {
    try: 'Press Indent, or Tab at the start of a paragraph.',
    run: { cmd: 'indent' },
    select: 'The numbers above are measured',
  },
  typography: {
    try: 'Type "quotes", -- and ... and watch them become “quotes”, — and …',
    html: '<p>Type "quotes" here, then two hyphens -- and three dots ...</p>',
  },
  emoji: {
    try: 'Type :tada: or :heart: and the shortcode becomes the emoji.',
    html: '<p>Type :tada: right here.</p>',
  },
  autolink: {
    try: 'Type a bare URL — matrajs.com — and it becomes a link when you press space.',
    html: '<p>Paste or type https://matrajs.com and press space.</p>',
  },
  clearFormatting: {
    try: 'Select a formatted paragraph and press Clear · one undo step puts it all back.',
    run: { cmd: 'clearFormatting' },
    select: 'A document, not a demo',
  },
  search: {
    try: 'Find and replace, in the margin. Every match is decorated, not marked.',
    where: 'rail',
  },
  codeHighlight: {
    try: 'A code block, coloured by a real tokeniser rather than a regular expression.',
    html: "<pre><code class=\"language-ts\">export const bold = {\n  kind: 'mark',\n  name: 'bold',\n  commands: { toggleBold: (ctx) => ctx.toggleMark('bold') },\n}</code></pre>",
  },
  history: {
    try: 'Type a word and press Mod-Z · it takes the word, not the letter.',
    where: 'keys',
  },
  smartPaste: { try: 'Copy some HTML from another page and paste it here.', where: 'doc' },
  // `uppercase`, not `sentenceCase`: the sentence this lands on is already in
  // sentence case, so the command correctly refuses and the demo reads broken.
  textTransform: {
    try: 'Select a phrase and press Case · upper, lower, title and sentence.',
    run: { cmd: 'uppercase' },
    select: 'The numbers above are measured',
  },
  selectionHighlight: {
    try: 'Select text, then click outside · the selection stays visible.',
    where: 'doc',
  },
  invisibleCharacters: {
    try: 'Press Invisibles · a dot on every space, a pilcrow on every block.',
    run: { cmd: 'toggleInvisibleCharacters' },
  },
  textDirection: {
    try: 'Press RTL with the caret in a block.',
    run: { cmd: 'setTextDirection', args: ['rtl'] },
  },
  lineHeight: {
    try: 'Press Line height · it is a checked attribute, not a style string.',
    run: { cmd: 'setLineHeight', args: [1.9] },
  },
  blockColor: {
    try: 'Press Block colour and pick one · the whole block takes it, empty or not.',
    run: { cmd: 'setBlockBackground', args: ['#faf0cf'] },
  },
  typewriter: {
    try: 'Press Typewriter, then type · the caret line stays put and the page moves.',
    run: { cmd: 'toggleTypewriter' },
  },
  autosave: { try: 'Type anything · the margin says when it last saved.', where: 'rail' },
  snippets: {
    try: 'Type sig followed by a space.',
    html: '<p>Type sig then a space right here.</p>',
  },
  hashtag: {
    try: 'Type #release and press space · it becomes a node, not styled text.',
    html: '<p>Type #release here.</p>',
  },
  mathInline: {
    try: 'LaTeX inside a line of prose.',
    run: { cmd: 'insertInlineMath', args: ['e^{i\\pi} + 1 = 0'] },
  },

  // --- menus ---------------------------------------------------------------
  suggestion: {
    try: 'Type / on an empty line · the menu offers only what this editor can do.',
    where: 'menu',
  },
  mention: {
    try: 'Type @ and a name · tick suggestion too and the menu comes with it.',
    where: 'menu',
  },
  bubbleMenu: { try: 'Select any text · the menu follows the selection.', where: 'menu' },
  floatingMenu: {
    try: 'Put the caret on an empty line · the block menu appears beside it.',
    where: 'menu',
  },
  ghostText: {
    try: 'Put the caret at the end of a paragraph and wait · press Tab to accept.',
    where: 'doc',
  },
  dictation: {
    try: 'Press Dictate and speak · the browser’s own recogniser, no service.',
    where: 'keys',
  },
}

/**
 * One document that exercises every node in the schema.
 *
 * Loaded by "Show everything", together with the whole catalogue ticked. Marks
 * and behaviours still need doing rather than reading, which is what the list
 * beside it is for — but every *shape* Matra can hold is in here.
 */
export const SHOWCASE = `<h1>Everything, at once</h1>
<p>Every extension is ticked. This document holds one of each thing Matra can put in a document — and the panel on the right lists what to <em>do</em> to see the rest.</p>
<div data-callout="info" data-emoji="💡"><p>Select any words for the bubble menu. Type <code>/</code> on an empty line for the slash menu. Type <code>@</code> for a mention.</p></div>
<h2>Text</h2>
<p><strong>Bold</strong>, <em>italic</em>, <u>underline</u>, <s>strike</s>, <code>code</code>, <mark>highlight</mark>, <a href="https://matrajs.com/docs">a link</a>, H<sub>2</sub>O, x<sup>2</sup>, and a <span data-comment="thread-welcome">commented phrase</span> with its thread in the margin.</p>
<p>Typography turns "quotes" and -- into real punctuation as you type, :tada: becomes an emoji, and #release becomes a node rather than styled text.</p>
<h2>Structure</h2>
<ul><li><p>A bulleted list, where Tab nests and Shift-Tab lifts</p></li><li><p>And a second item, so nesting has somewhere to go</p></li></ul>
<ol><li><p>Numbered from the document</p></li><li><p>Delete one and the rest renumber</p></li></ol>
<ul data-type="taskList"><li data-checked="true"><p>Tick a box and the text goes through</p></li><li data-checked="false"><p>The checked state is an attribute on the item</p></li></ul>
<blockquote><p>A quote holds blocks rather than text, so it can hold a list, or another quote.</p></blockquote>
<table><tbody><tr><th><p>Node</p></th><th><p>Holds</p></th><th><p>Cost</p></th></tr><tr><td><p>paragraph</p></td><td><p>Inline content</p></td><td><p>0.00 kB</p></td></tr><tr><td><p>table</p></td><td><p>Rows of cells</p></td><td><p>2.30 kB</p></td></tr></tbody></table>
<div data-columns><div data-column><p>Two columns, side by side. Each one holds blocks.</p></div><div data-column><p>Drag the caret across and the document is still one document.</p></div></div>
<details open><summary>A disclosure, which folds</summary><p>The open state is stored on the node, so it survives a save.</p></details>
<h2>Blocks that are not text</h2>
<pre><code class="language-ts">const editor = createEditor({
  extensions: [document, paragraph, text, bold, heading],
})</code></pre>
<img src="/og.png" alt="The Matra social card">
<div data-math="\\int_0^1 x^2\\,dx = \\tfrac{1}{3}"></div>
<hr>
<p data-locked="true">A locked clause. Put the caret here and type: nothing lands.</p>
<p>Dear <span data-field="name" data-field-label="Name"></span>, we are writing from <span data-field="city" data-field-label="City"></span>.</p>
<p>The last paragraph, so there is always somewhere to click.</p>`
