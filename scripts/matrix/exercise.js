/**
 * Every extension, driven the way a person drives it, in whatever DOM this
 * runs in.
 *
 * The catalogue test proves the whole box builds into one editor. This proves
 * each thing in the box does its job once it is there: every command is run,
 * every input rule is typed, paste is pasted, and what comes out is checked
 * against what a user would see. It takes the package as an argument rather
 * than importing it, so the same file runs against the built package in Node,
 * against the installed package inside a React, Vue, Svelte or Solid app, and
 * inside a real browser, and the answers have to agree.
 *
 * No imports. This file is copied verbatim into apps that have nothing but
 * `@matrajs/core` and a framework.
 */

/** Names in the package that are not extensions and must not be called. */
const NOT_EXTENSIONS = new Set(['createEditor', 'buildSchema', 'pos', 'range', 'core'])

/** Kits that are plain arrays, added after the reflection pass. */
const ARRAY_KITS = ['starterKit', 'tableKit', 'detailsKit', 'columnsKit']

/**
 * Every extension the package exports, instantiated, plus the hooks the
 * checks below listen on.
 *
 * Deduplicated by kind and name — a kit hands back the same nodes its parts
 * do — rather than by name alone, because a node and the extension that
 * drives it may share one (`footnotes` is both).
 */
export function everything(core, document) {
  const hooks = {
    bubble: document.createElement('div'),
    floating: document.createElement('div'),
    saves: [],
    pasted: [],
    dropped: [],
  }
  hooks.bubble.className = 'bubble'
  hooks.floating.className = 'floating'
  document.body.appendChild(hooks.bubble)
  document.body.appendChild(hooks.floating)

  const args = {
    bubbleMenu: [{ element: hooks.bubble }],
    floatingMenu: [{ element: hooks.floating }],
    ghostText: [{ suggest: () => null }],
    autosave: [{ save: (doc) => hooks.saves.push(doc), delay: 10 }],
    fileHandler: [
      {
        onPaste: (event) => hooks.pasted.push(event),
        onDrop: (event) => hooks.dropped.push(event),
      },
    ],
    snippets: [[{ trigger: 'sig', content: 'Kind regards' }]],
    suggestion: [{ char: '@' }],
    placeholder: [{ text: 'Write something' }],
    emoji: [{ emoticons: true }],
  }

  const defs = []
  const seen = new Set()
  const isDef = (value) =>
    typeof value === 'object' && value !== null && 'kind' in value && 'name' in value
  const add = (def) => {
    const key = `${def.kind}:${def.name}`
    if (seen.has(key)) return
    seen.add(key)
    defs.push(def)
  }
  for (const [name, value] of Object.entries(core)) {
    if (NOT_EXTENSIONS.has(name) || ARRAY_KITS.includes(name)) continue
    if (isDef(value)) {
      add(value)
      continue
    }
    if (typeof value !== 'function' || !/^[a-z]/.test(name)) continue
    let made
    try {
      made = value(...(args[name] ?? []))
    } catch {
      continue
    }
    if (isDef(made)) add(made)
    else if (Array.isArray(made)) for (const item of made) if (isDef(item)) add(item)
  }
  for (const kit of ARRAY_KITS) for (const def of core[kit]) add(def)
  return { defs, hooks }
}

/** A failed expectation. */
class Miss extends Error {}
const must = (condition, detail) => {
  if (!condition) throw new Miss(detail)
}
const count = (haystack, needle) => haystack.split(needle).length - 1

/**
 * The checks. Each names the extensions it covers, so that an extension
 * nobody wrote a check for is reported rather than quietly passing.
 */
const CHECKS = [
  {
    name: 'core commands',
    covers: ['core', 'doc', 'paragraph', 'text'],
    run: (t) => {
      t.set('<p>hello world</p>')
      t.sel(6)
      t.cmd('insert', ',')
      must(t.html() === '<p>hello, world</p>', `insert: ${t.html()}`)
      t.cmd('replace', { from: 1, to: 7 }, 'hi')
      must(t.html() === '<p>hi world</p>', `replace: ${t.html()}`)
      t.cmd('remove', { from: 1, to: 3 })
      must(t.html() === '<p> world</p>', `remove: ${t.html()}`)
      t.synced()
      t.set('<p>one</p><p>two</p>')
      t.cmd('moveBlock', 0, 10)
      must(t.html() === '<p>two</p><p>one</p>', `moveBlock: ${t.html()}`)
      t.cmd('focus')
      t.cmd('setParagraph')
    },
  },
  {
    name: 'marks',
    covers: [
      'bold',
      'italic',
      'strike',
      'code',
      'underline',
      'highlight',
      'subscript',
      'superscript',
      'kbd',
    ],
    run: (t) => {
      const pairs = [
        ['toggleBold', '<strong>hello</strong>', 'bold'],
        ['toggleItalic', '<em>hello</em>', 'italic'],
        ['toggleStrike', '<s>hello</s>', 'strike'],
        ['toggleCode', '<code>hello</code>', 'code'],
        ['toggleUnderline', '<u>hello</u>', 'underline'],
        ['toggleHighlight', '<mark>hello</mark>', 'highlight'],
        ['toggleSubscript', '<sub>hello</sub>', 'subscript'],
        ['toggleSuperscript', '<sup>hello</sup>', 'superscript'],
        ['toggleKbd', '<kbd>hello</kbd>', 'kbd'],
      ]
      for (const [command, expected, mark] of pairs) {
        t.set('<p>hello world</p>')
        t.sel(1, 6)
        t.cmd(command)
        must(t.html().includes(expected), `${command}: ${t.html()}`)
        must(t.editor.isActive(mark), `${mark} not active`)
        t.cmd(command)
        must(t.html() === '<p>hello world</p>', `${command} again: ${t.html()}`)
      }
      t.sel(1, 6)
      t.cmd('setBold')
      t.cmd('unsetBold')
      must(t.html() === '<p>hello world</p>', `unsetBold: ${t.html()}`)
      t.cmd('toggleHighlight', '#ffff00')
      must(t.html().includes('data-color="#ffff00"'), `coloured highlight: ${t.html()}`)
      t.cmd('unsetHighlight')
      must(!t.html().includes('<mark'), `unsetHighlight: ${t.html()}`)
    },
  },
  {
    name: 'headings',
    covers: ['heading'],
    run: (t) => {
      t.set('<p>title</p>')
      t.cmd('setHeading', 2)
      must(t.html().startsWith('<h2'), `setHeading: ${t.html()}`)
      must(t.editor.isActive('heading', { level: 2 }), 'heading not active')
      t.cmd('toggleHeading', 2)
      must(t.html().startsWith('<p'), `toggleHeading: ${t.html()}`)
      t.set('<p></p>')
      t.type('### ')
      must(t.html().startsWith('<h3'), `### rule: ${t.html()}`)
    },
  },
  {
    name: 'blocks',
    covers: ['blockquote', 'codeBlock', 'horizontalRule', 'hardBreak'],
    run: (t) => {
      t.set('<p>quote</p>')
      t.cmd('toggleBlockquote')
      must(t.html().startsWith('<blockquote'), `blockquote: ${t.html()}`)
      t.cmd('toggleBlockquote')
      t.cmd('toggleCodeBlock', 'js')
      must(t.html().includes('<pre data-language="js"><code>'), `code block: ${t.html()}`)
      t.cmd('toggleCodeBlock')
      must(t.html().startsWith('<p'), `code block off: ${t.html()}`)
      t.cmd('insertHardBreak')
      must(t.html().includes('<br'), `hard break: ${t.html()}`)
      t.set('<p>a</p>')
      t.sel(2)
      t.cmd('insertHorizontalRule')
      must(t.html().includes('<hr'), `rule: ${t.html()}`)
      t.set('<p></p>')
      t.type('> ')
      must(t.html().startsWith('<blockquote'), `> rule: ${t.html()}`)
      t.set('<p></p>')
      t.type('```ts ')
      must(t.html().includes('data-language="ts"'), '``` rule')
      t.set('<p></p>')
      t.type('*** ')
      must(t.html().includes('<hr'), `*** rule: ${t.html()}`)
    },
  },
  {
    name: 'lists',
    covers: ['bulletList', 'orderedList', 'listItem'],
    run: (t) => {
      t.set('<p>one</p>')
      t.cmd('toggleBulletList')
      must(t.html().startsWith('<ul><li>'), `bullet: ${t.html()}`)
      t.sel(5)
      t.cmd('splitListItem')
      must(count(t.html(), '<li>') === 2, `split: ${t.html()}`)
      t.cmd('insert', 'two')
      t.cmd('sinkListItem')
      must(count(t.html(), '<ul>') === 2, `sink: ${t.html()}`)
      t.cmd('liftListItem')
      must(count(t.html(), '<ul>') === 1, `lift: ${t.html()}`)
      t.synced()
      // The button takes the selected items out; select both to empty the list.
      t.sel(3, t.editor.getText().length + 3)
      t.cmd('toggleBulletList')
      must(!t.html().includes('<ul'), `bullet off: ${t.html()}`)
      t.set('<p>one</p><p>two</p>')
      t.sel(2, 8)
      t.cmd('toggleBulletList')
      must(
        t.html().startsWith('<ul><li><p>one</p></li><li><p>two</p></li></ul>'),
        `two items: ${t.html()}`,
      )
      t.cmd('toggleOrderedList')
      must(
        t.html().startsWith('<ol><li><p>one</p></li><li><p>two</p></li></ol>'),
        `retyped: ${t.html()}`,
      )
      t.cmd('toggleOrderedList')
      must(t.html().startsWith('<p>one</p><p>two</p>'), `both out: ${t.html()}`)
      t.set('<ul><li><p>one</p></li><li><p>two</p></li></ul>')
      t.sel(11)
      t.cmd('liftListItem')
      must(
        t.html().startsWith('<ul><li><p>one</p></li></ul><p>two</p>'),
        `lift out: ${t.html()}`,
      )
      t.cmd('insert', '|')
      must(t.html().includes('t|wo'), `caret after lift: ${t.html()}`)
      t.set('<p>one</p>')
      t.cmd('toggleOrderedList')
      must(t.html().startsWith('<ol'), `ordered: ${t.html()}`)
      t.set('<p></p>')
      t.type('- ')
      must(t.html().startsWith('<ul'), `- rule: ${t.html()}`)
      t.set('<p></p>')
      t.type('1. ')
      must(t.html().startsWith('<ol'), `1. rule: ${t.html()}`)
    },
  },
  {
    name: 'task list',
    covers: ['taskList', 'taskItem'],
    run: (t) => {
      t.set('<p>todo</p>')
      t.cmd('toggleTaskList')
      must(t.html().includes('data-type="taskList"'), `task list: ${t.html()}`)
      must(t.html().includes('data-checked="false"'), `unchecked: ${t.html()}`)
      t.cmd('toggleTaskItem')
      must(t.html().includes('data-checked="true"'), `checked: ${t.html()}`)
      t.sel(6)
      t.cmd('splitTaskItem')
      must(count(t.html(), '<li') === 2, `split: ${t.html()}`)
      t.cmd('insert', 'more')
      t.cmd('sinkTaskItem')
      must(count(t.html(), 'data-type="taskList"') === 2, `sink: ${t.html()}`)
      t.cmd('liftTaskItem')
      t.sel(3, t.editor.getText().length + 3)
      t.cmd('toggleTaskList')
      must(!t.html().includes('taskList'), `task list off: ${t.html()}`)
      t.set('<ul><li><p>one</p></li></ul>')
      t.sel(3)
      t.cmd('toggleTaskList')
      must(
        t.html().includes('data-type="taskList"') && t.html().includes('one'),
        `bullets to tasks: ${t.html()}`,
      )
      t.set('<p></p>')
      t.type('[ ] ')
      must(t.html().includes('data-type="taskList"'), `[ ] rule: ${t.html()}`)
    },
  },
  {
    name: 'links',
    covers: ['link', 'autolink'],
    run: (t) => {
      t.set('<p>hello world</p>')
      t.sel(1, 6)
      t.cmd('setLink', { href: 'https://matrajs.com' })
      must(t.html().includes('<a href="https://matrajs.com"'), `setLink: ${t.html()}`)
      t.cmd('unsetLink')
      must(!t.html().includes('<a '), `unsetLink: ${t.html()}`)
      t.set('<p>see </p>')
      t.type('https://matrajs.com/docs ')
      must(t.html().includes('href="https://matrajs.com/docs"'), `autolink: ${t.html()}`)
      must(t.core.normalizeUrl('www.example.com') === 'https://www.example.com', 'normalizeUrl')
    },
  },
  {
    name: 'history',
    covers: ['history'],
    run: (t) => {
      t.set('<p>hello</p>')
      t.sel(6)
      t.cmd('insert', '!')
      must(t.html() === '<p>hello!</p>', `insert: ${t.html()}`)
      t.cmd('undo')
      must(t.html() === '<p>hello</p>', `undo: ${t.html()}`)
      t.cmd('redo')
      must(t.html() === '<p>hello!</p>', `redo: ${t.html()}`)
    },
  },
  {
    name: 'images',
    covers: ['image', 'imageResize'],
    run: (t) => {
      t.set('<p>pic</p>')
      t.sel(4)
      t.cmd('insertImage', { src: 'https://example.com/a.png', alt: 'A' })
      must(
        t.html().includes('<img src="https://example.com/a.png" alt="A"'),
        `image: ${t.html()}`,
      )
      t.cmd('setImageWidth', 200, 4)
      must(t.html().includes('width="200"'), `width: ${t.html()}`)
      must(t.dom.querySelector('img')?.getAttribute('width') === '200', 'width not drawn')
      t.refuse('setImageWidth', 200, 4)
      t.cmd('setImageWidth', null, 4)
      must(!t.html().includes('width='), `width off: ${t.html()}`)
    },
  },
  {
    name: 'alignment, indent, direction, line height',
    covers: ['textAlign', 'indent', 'textDirection', 'lineHeight'],
    run: (t) => {
      t.set('<p>x</p>')
      t.cmd('setTextAlign', 'center')
      must(t.html().includes('text-align: center'), `align: ${t.html()}`)
      t.cmd('unsetTextAlign')
      must(!t.html().includes('text-align'), `align off: ${t.html()}`)
      t.cmd('indent')
      t.cmd('indent')
      must(t.html().includes('data-indent="2"'), `indent: ${t.html()}`)
      t.cmd('outdent')
      must(t.html().includes('data-indent="1"'), `outdent: ${t.html()}`)
      t.cmd('setIndent', 0)
      must(!t.html().includes('data-indent'), `indent off: ${t.html()}`)
      t.cmd('setTextDirection', 'rtl')
      must(t.html().includes('dir="rtl"'), `direction: ${t.html()}`)
      t.cmd('unsetTextDirection')
      must(!t.html().includes('dir='), `direction off: ${t.html()}`)
      t.cmd('setLineHeight', 1.5)
      must(t.html().includes('line-height: 1.5'), `line height: ${t.html()}`)
      t.cmd('unsetLineHeight')
      must(!t.html().includes('line-height'), `line height off: ${t.html()}`)
      must(t.core.lineHeightOf('24px') === '24px', 'lineHeightOf')
      must(t.core.lineHeightOf('url(x)') === null, 'lineHeightOf refuses')
    },
  },
  {
    name: 'placeholder',
    covers: ['placeholder'],
    run: (t) => {
      t.set('<p></p>')
      must(t.dom.getAttribute('data-placeholder') === 'Write something', 'placeholder missing')
      t.set('<p>x</p>')
      must(!t.dom.hasAttribute('data-placeholder'), 'placeholder stayed')
    },
  },
  {
    name: 'character count',
    covers: ['characterCount'],
    run: (t) => {
      t.set('<p>hello world</p>')
      const state = t.editor.extensionState('characterCount')
      must(state?.characters === 11 && state?.words === 2, `count: ${JSON.stringify(state)}`)
      t.cmd('countCharacters')
    },
  },
  {
    name: 'tables',
    covers: ['table', 'tableRow', 'tableCell', 'tableHeader'],
    run: (t) => {
      t.set('<p>x</p>')
      t.sel(2)
      t.cmd('insertTable', 2, 2)
      must(count(t.html(), '<tr>') === 2, `rows: ${t.html()}`)
      t.cmd('addRowAfter')
      must(count(t.html(), '<tr>') === 3, `addRowAfter: ${t.html()}`)
      t.cmd('addColumnAfter')
      must(
        count(t.html(), '<tr>') === 3 && count(t.html(), '<t') >= 9,
        `addColumnAfter: ${t.html()}`,
      )
      t.cmd('deleteColumn')
      t.cmd('deleteRow')
      must(count(t.html(), '<tr>') === 2, `deleteRow: ${t.html()}`)
      t.cmd('toggleHeaderRow')
      must(t.html().includes('<th'), `header row: ${t.html()}`)
      t.cmd('goToNextCell')
      t.cmd('goToPreviousCell')
      t.cmd('deleteTable')
      must(!t.html().includes('<table'), `deleteTable: ${t.html()}`)
    },
  },
  {
    name: 'comments',
    covers: ['comment'],
    run: (t) => {
      t.set('<p>hello world</p>')
      t.sel(1, 6)
      t.cmd('addComment', 't1')
      must(t.html().includes('data-comment="t1"'), `addComment: ${t.html()}`)
      const ranges = t.core.commentRanges(t.editor.getJSON())
      must(
        ranges.length === 1 && ranges[0].text === 'hello',
        `ranges: ${JSON.stringify(ranges)}`,
      )
      t.cmd('removeComment', 't1')
      must(!t.html().includes('data-comment'), `removeComment: ${t.html()}`)
    },
  },
  {
    name: 'typography and emoji',
    covers: ['typography', 'emoji'],
    run: (t) => {
      t.set('<p>a</p>')
      t.type('...')
      must(t.html().includes('a…'), `ellipsis: ${t.html()}`)
      t.type(' (c)')
      must(t.html().includes('©'), `copyright: ${t.html()}`)
      t.type(' :fire:')
      must(t.html().includes('🔥'), `emoji: ${t.html()}`)
      must(t.core.searchEmoji('fire').length > 0, 'searchEmoji')
      must(typeof t.core.EMOJI.tada === 'string', 'EMOJI table')
    },
  },
  {
    name: 'unique ids',
    covers: ['uniqueId'],
    run: (t) => {
      // The extension keeps ids, as `data-id`; `assignIds` hands them out.
      t.set('<p data-id="abc">a</p><p>b</p>')
      const [first] = t.editor.getJSON().content
      must(first.attrs?.id === 'abc', `id kept: ${JSON.stringify(first.attrs)}`)
      must(
        t.editor.getHTML().includes('<p data-id="abc">a</p>'),
        `id rendered: ${t.editor.getHTML()}`,
      )
      const doc = t.core.assignIds(t.editor.getJSON())
      const ids = doc.content.map((node) => node.attrs?.id)
      must(
        ids[0] === 'abc' && typeof ids[1] === 'string' && ids[1].length > 0,
        `assignIds: ${ids}`,
      )
      t.editor.setContent(doc)
      must(t.editor.getJSON().content[1].attrs?.id === ids[1], 'assigned id not kept')
    },
  },
  {
    name: 'drag handle',
    covers: ['dragHandle'],
    run: (t) => {
      t.set('<p>a</p><p>b</p>')
      const block = t.dom.querySelector('p')
      const event = new t.win.MouseEvent('mousemove', { bubbles: true, clientX: 1, clientY: 1 })
      block.dispatchEvent(event)
      const handle = t.dom.ownerDocument.querySelector('.matra-drag-handle')
      must(handle !== null, 'no handle in the page')
      must(handle.getAttribute('draggable') === 'true', 'handle not draggable')
    },
  },
  {
    name: 'mentions and hashtags',
    covers: ['mention', 'hashtag'],
    run: (t) => {
      t.set('<p>hi </p>')
      t.sel(4)
      t.cmd('insertMention', { id: '1', label: 'Ada' })
      must(
        t.html().includes('data-mention-id="1"') && t.html().includes('@Ada'),
        `mention: ${t.html()}`,
      )
      t.set('<p>tag </p>')
      t.sel(5)
      t.cmd('insertHashtag', 'matra')
      must(
        t.html().includes('data-hashtag="matra"') && t.html().includes('#matra'),
        `hashtag: ${t.html()}`,
      )
      t.cmd('insert', ' ')
      t.type('#news ')
      const tags = t.core.hashtagsIn(t.editor.getJSON())
      must(tags.join(',') === 'matra,news', `hashtagsIn: ${tags}`)
    },
  },
  {
    name: 'text style',
    covers: ['textStyle'],
    run: (t) => {
      t.set('<p>hello world</p>')
      t.sel(1, 6)
      t.cmd('setColor', '#ff0000')
      must(t.html().includes('color: #ff0000'), `colour: ${t.html()}`)
      t.cmd('setFontSize', '20px')
      must(t.html().includes('font-size: 20px'), `size: ${t.html()}`)
      t.cmd('setFontFamily', 'Georgia')
      t.cmd('setBackgroundColor', '#eee')
      must(t.html().includes('background-color: #eee'), `background: ${t.html()}`)
      t.cmd('unsetColor')
      t.cmd('unsetFontSize')
      t.cmd('unsetFontFamily')
      t.cmd('unsetBackgroundColor')
      must(t.html() === '<p>hello world</p>', `all unset: ${t.html()}`)
      t.cmd('setColor', '#00f')
      t.cmd('unsetTextStyle')
      must(t.html() === '<p>hello world</p>', `unsetTextStyle: ${t.html()}`)
    },
  },
  {
    name: 'search and replace',
    covers: ['search'],
    run: (t) => {
      t.set('<p>hello world hello</p>')
      t.cmd('setSearch', 'hello')
      let state = t.editor.extensionState('search')
      must(state?.matches?.length === 2, `matches: ${JSON.stringify(state)}`)
      must(t.dom.querySelectorAll('.matra-search-match').length === 2, 'match decorations')
      t.cmd('nextMatch')
      t.cmd('nextMatch')
      state = t.editor.extensionState('search')
      must(state.current === 1, `current: ${state.current}`)
      must(t.dom.querySelectorAll('.matra-search-current').length === 1, 'current decoration')
      t.cmd('previousMatch')
      must(t.editor.extensionState('search').current === 0, 'previous')
      t.cmd('replaceMatch', 'bye')
      must(t.html().includes('bye world hello'), `replaceMatch: ${t.html()}`)
      t.cmd('setSearch', { query: 'H', caseSensitive: false, wholeWord: false, regex: false })
      t.cmd('replaceAllMatches', 'J')
      must(t.html().includes('Jello'), `replaceAll: ${t.html()}`)
      t.cmd('clearSearch')
      must(t.editor.extensionState('search').matches.length === 0, 'clearSearch')
    },
  },
  {
    name: 'details',
    covers: ['details', 'detailsSummary'],
    run: (t) => {
      t.set('<p>x</p>')
      t.sel(2)
      t.cmd('insertDetails')
      must(
        t.html().includes('<details') && t.html().includes('<summary'),
        `insert: ${t.html()}`,
      )
      t.cmd('setDetailsOpen', true)
      must(t.html().includes(' open'), `open: ${t.html()}`)
      t.cmd('toggleDetails')
      must(!t.html().includes(' open'), `toggle: ${t.html()}`)
      t.cmd('unsetDetails')
      must(!t.html().includes('<details'), `unset: ${t.html()}`)
    },
  },
  {
    name: 'callouts',
    covers: ['callout'],
    run: (t) => {
      t.set('<p>note</p>')
      t.cmd('toggleCallout', 'warning')
      must(t.html().includes('data-callout="warning"'), `callout: ${t.html()}`)
      t.cmd('setCalloutType', 'tip')
      must(t.html().includes('data-callout="tip"'), `type: ${t.html()}`)
      t.cmd('setCalloutEmoji', '💡')
      must(t.html().includes('data-emoji="💡"'), `emoji: ${t.html()}`)
      t.cmd('toggleCallout')
      must(!t.html().includes('data-callout'), `off: ${t.html()}`)
    },
  },
  {
    name: 'clear formatting',
    covers: ['clearFormatting'],
    run: (t) => {
      t.set('<p>hello world</p>')
      t.sel(1, 6)
      t.cmd('toggleBold')
      t.cmd('setHeading', 2)
      t.cmd('clearFormatting')
      must(t.html().startsWith('<p>hello world</p>'), `clearFormatting: ${t.html()}`)
      t.sel(1, 6)
      t.cmd('toggleItalic')
      t.cmd('unsetAllMarks')
      must(t.html().startsWith('<p>hello world</p>'), `unsetAllMarks: ${t.html()}`)
      t.cmd('toggleBlockquote')
      t.cmd('clearBlocks')
      must(t.html().startsWith('<p>hello world</p>'), `clearBlocks: ${t.html()}`)
    },
  },
  {
    name: 'focus class',
    covers: ['focus'],
    run: (t) => {
      t.set('<p>a</p><p>b</p>')
      t.sel(4)
      const focused = t.dom.querySelectorAll('.has-focus')
      must(
        focused.length === 1 && focused[0].textContent === 'b',
        `has-focus on ${focused.length}`,
      )
    },
  },
  {
    name: 'trailing node',
    covers: ['trailingNode'],
    run: (t) => {
      t.set('<hr>')
      must(/<hr[^>]*><p><\/p>$/.test(t.html()), `trailing: ${t.html()}`)
    },
  },
  {
    name: 'youtube and embeds',
    covers: ['youtube', 'embed'],
    run: (t) => {
      t.set('<p>x</p>')
      t.sel(2)
      t.cmd('insertYoutube', { src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
      must(t.html().includes('data-youtube-video="dQw4w9WgXcQ"'), `youtube: ${t.html()}`)
      must(t.core.youtubeId('https://youtu.be/dQw4w9WgXcQ') === 'dQw4w9WgXcQ', 'youtubeId')
      t.set('<p>x</p>')
      t.sel(2)
      // Only hosts on the allow list may be framed; a stranger is refused.
      t.refuse('insertEmbed', 'https://example.com/widget')
      t.cmd('insertEmbed', 'https://codepen.io/matra/embed/abc', { title: 'Pen' })
      must(
        t.html().includes('data-embed="https://codepen.io/matra/embed/abc"'),
        `embed: ${t.html()}`,
      )
      must(t.html().includes('title="Pen"'), `title: ${t.html()}`)
      t.cmd('setEmbedAspect', '4/3', 3)
      must(t.html().includes('4/3'), `aspect: ${t.html()}`)
    },
  },
  {
    name: 'files',
    covers: ['fileHandler'],
    run: (t) => {
      t.set('<p></p>')
      const before = t.hooks.pasted.length
      t.paste({ files: [{ type: 'image/png', name: 'a.png', size: 3 }] })
      must(t.hooks.pasted.length === before + 1, 'onPaste not called')
      must(t.hooks.pasted[before].files.length === 1, 'file not handed over')
    },
  },
  {
    name: 'suggestions',
    covers: ['suggestion'],
    run: (t) => {
      t.set('<p>hi</p>')
      t.type(' @ad')
      const active = t.core.activeSuggestion(t.editor)
      must(active?.query === 'ad', `active: ${JSON.stringify(active)}`)
      t.cmd('cancelSuggestion')
      must(t.core.activeSuggestion(t.editor) === null, 'still active after cancel')
    },
  },
  {
    name: 'locked blocks',
    covers: ['locked'],
    run: (t) => {
      t.set('<p>keep</p><p>free</p>')
      t.sel(1)
      t.cmd('lock')
      must(t.html().includes('data-locked="true"'), `lock: ${t.html()}`)
      must(t.editor.extensionState('locked')?.here === true, 'state.here')
      t.refuse('insert', 'x')
      must(t.editor.can.insert('x') === false, 'can.insert said yes')
      must(t.html().includes('<p data-locked="true">keep</p>'), `changed anyway: ${t.html()}`)
      t.sel(8)
      t.cmd('insert', 'y')
      must(t.html().includes('fyree'), `free block: ${t.html()}`)
      t.sel(1)
      t.cmd('toggleLock')
      must(!t.html().includes('data-locked'), `toggleLock: ${t.html()}`)
      t.cmd('lock')
      t.cmd('unlock')
      t.cmd('insert', 'x')
      must(t.html().includes('xkeep'), `after unlock: ${t.html()}`)
    },
  },
  {
    name: 'template fields',
    covers: ['field'],
    run: (t) => {
      t.set('<p>Dear</p>')
      t.sel(5)
      t.cmd('insert', ' ')
      t.cmd('insertField', 'name', 'Name')
      must(t.html().includes('data-field="name"'), `insertField: ${t.html()}`)
      must(t.core.fieldsIn(t.editor.getJSON()).join() === 'name', 'fieldsIn')
      const filled = t.core.fillFieldsIn(t.editor.getJSON(), { name: 'Ada' })
      must(
        JSON.stringify(filled).includes('"Dear Ada"'),
        `fillFieldsIn: ${JSON.stringify(filled)}`,
      )
      t.cmd('fillFields', { name: 'Ada' })
      must(t.html() === '<p>Dear Ada</p>', `fillFields: ${t.html()}`)
      t.cmd('insert', ' ')
      t.type('{{city}}')
      must(t.html().includes('data-field="city"'), `{{ }} rule: ${t.html()}`)
    },
  },
  {
    name: 'ghost text',
    covers: ['ghostText'],
    run: (t) => {
      t.set('<p>hello</p>')
      t.sel(6)
      t.cmd('setGhostText', ' world')
      must(t.editor.extensionState('ghostText')?.text === ' world', 'state')
      const ghost = t.dom.querySelector('.matra-ghost')
      must(ghost?.textContent === ' world', `ghost widget: ${ghost?.textContent}`)
      t.cmd('acceptGhostText')
      must(t.html() === '<p>hello world</p>', `accept: ${t.html()}`)
      t.cmd('setGhostText', ' one two')
      t.cmd('acceptGhostWord')
      must(/^<p>hello world one ?<\/p>$/.test(t.html()), `acceptWord: ${t.html()}`)
      // Taking a word is a document change, and any change clears the ghost.
      must(t.editor.extensionState('ghostText')?.text === null, 'ghost stayed after a word')
      t.refuse('dismissGhostText')
      t.cmd('setGhostText', ' again')
      must(t.dom.querySelector('.matra-ghost') !== null, 'no ghost to dismiss')
      t.cmd('dismissGhostText')
      must(t.dom.querySelector('.matra-ghost') === null, 'ghost stayed')
    },
  },
  {
    name: 'dictation',
    covers: ['dictation'],
    run: (t) => {
      t.set('<p>say</p>')
      t.sel(4)
      const supported = t.core.dictationSupported()
      if (!supported) t.refuse('startDictation')
      must(typeof t.editor.can.toggleDictation() === 'boolean', 'can.toggleDictation')
      must(t.editor.extensionState('dictation')?.listening === false, 'listening already')
      t.cmd('setDictation', { interim: 'um' })
      const interim = t.dom.querySelector('.matra-dictation-interim')
      must(interim?.textContent?.includes('um'), `interim widget: ${interim?.textContent}`)
      t.cmd('setDictation', { interim: '' })
      must(t.dom.querySelector('.matra-dictation-interim') === null, 'interim stayed')
      t.refuse('stopDictation')
    },
  },
  {
    name: 'smart paste',
    covers: ['smartPaste'],
    run: (t) => {
      t.set('<p></p>')
      t.paste({ text: 'a\tb\nc\td' })
      must(t.html().includes('<table') && t.html().includes('<th'), `tsv: ${t.html()}`)
      t.set('<p></p>')
      t.paste({ text: '# Title\n\n- item one\n- item two' })
      must(t.html().includes('<h1') && t.html().includes('<ul'), `markdown: ${t.html()}`)
      must(t.core.parseDelimited('a,b\nc,d', true)?.[1]?.[1] === 'd', 'parseDelimited')
      must(t.core.looksLikeMarkdown('# hi') === true, 'looksLikeMarkdown')
    },
  },
  {
    name: 'menus',
    covers: ['bubbleMenu', 'floatingMenu'],
    run: async (t) => {
      const why = () => {
        const selection = t.dom.ownerDocument.getSelection()
        return `focus=${t.editor.unsafe.view.hasFocus} selection=${JSON.stringify(t.editor.selection)} dom=${selection?.anchorNode?.nodeName}/${selection?.anchorOffset} inside=${t.dom.contains(selection?.anchorNode ?? null)}`
      }
      t.set('<p>hello world</p>')
      t.cmd('focus')
      t.sel(1, 6)
      await t.frame()
      must(t.hooks.bubble.hidden === false, `bubble menu hidden over a selection · ${why()}`)
      t.sel(1)
      await t.frame()
      must(t.hooks.bubble.hidden === true, `bubble menu shown at a caret · ${why()}`)
      t.set('<p></p>')
      t.sel(1)
      await t.frame()
      must(
        t.hooks.floating.hidden === false,
        `floating menu hidden in an empty block · ${why()}`,
      )
      t.set('<p>x</p>')
      t.sel(2)
      await t.frame()
      must(t.hooks.floating.hidden === true, `floating menu shown in a full block · ${why()}`)
    },
  },
  {
    name: 'invisible characters',
    covers: ['invisibleCharacters'],
    run: (t) => {
      t.set('<p>hello world</p>')
      t.cmd('showInvisibleCharacters')
      must(t.editor.extensionState('invisibleCharacters')?.visible === true, 'state')
      must(t.dom.querySelector('.matra-invisible-space') !== null, 'no space marker')
      t.cmd('hideInvisibleCharacters')
      must(t.dom.querySelector('.matra-invisible-space') === null, 'marker stayed')
      t.cmd('toggleInvisibleCharacters')
      must(t.dom.querySelector('.matra-invisible-paragraph') !== null, 'no paragraph marker')
      t.cmd('toggleInvisibleCharacters')
    },
  },
  {
    name: 'columns',
    covers: ['columnList', 'column'],
    run: (t) => {
      t.set('<p>a</p>')
      t.sel(1)
      t.cmd('setColumns', 2)
      must(
        t.html().includes('data-columns') && count(t.html(), 'class="matra-column"') === 2,
        `set: ${t.html()}`,
      )
      t.cmd('addColumn')
      must(count(t.html(), 'class="matra-column"') === 3, `add: ${t.html()}`)
      t.cmd('removeColumn')
      must(count(t.html(), 'class="matra-column"') === 2, `remove: ${t.html()}`)
      t.cmd('unsetColumns')
      must(!t.html().includes('data-column'), `unset: ${t.html()}`)
    },
  },
  {
    name: 'page break',
    covers: ['pageBreak'],
    run: (t) => {
      t.set('<p>a</p>')
      t.sel(2)
      t.cmd('insertPageBreak')
      must(t.html().includes('data-page-break'), `page break: ${t.html()}`)
    },
  },
  {
    name: 'snippets',
    covers: ['snippets'],
    run: (t) => {
      t.set('<p>x</p>')
      t.type(' sig ')
      must(t.html().includes('Kind regards'), `typed: ${t.html()}`)
      t.cmd('insertSnippet', 'sig')
      must(count(t.html(), 'Kind regards') === 2, `command: ${t.html()}`)
      t.refuse('insertSnippet', 'nope')
    },
  },
  {
    name: 'text transform',
    covers: ['textTransform'],
    run: (t) => {
      t.set('<p>hello world</p>')
      t.sel(1, 12)
      t.cmd('uppercase')
      must(t.html() === '<p>HELLO WORLD</p>', `upper: ${t.html()}`)
      t.cmd('lowercase')
      must(t.html() === '<p>hello world</p>', `lower: ${t.html()}`)
      t.cmd('capitalize')
      must(t.html() === '<p>Hello World</p>', `capitalize: ${t.html()}`)
      t.cmd('sentenceCase')
      must(t.html() === '<p>Hello world</p>', `sentence: ${t.html()}`)
      // Toggle: anything not all capitals goes up, all capitals come down.
      t.cmd('toggleCase')
      must(t.html() === '<p>HELLO WORLD</p>', `toggle up: ${t.html()}`)
      t.cmd('toggleCase')
      must(t.html() === '<p>hello world</p>', `toggle down: ${t.html()}`)
    },
  },
  {
    name: 'math',
    covers: ['mathInline', 'mathBlock'],
    run: (t) => {
      t.set('<p>x </p>')
      t.sel(3)
      t.cmd('insertInlineMath', 'x^2')
      must(t.html().includes('data-math="x^2"'), `inline: ${t.html()}`)
      t.set('<p>x</p>')
      t.sel(2)
      t.cmd('insertBlockMath', 'E=mc^2')
      must(
        t.html().includes('matra-math-block') && t.html().includes('E=mc^2'),
        `block: ${t.html()}`,
      )
      t.set('<p>a </p>')
      t.type('$z$ ')
      must(t.html().includes('data-math="z"'), `$ rule: ${t.html()}`)
    },
  },
  {
    name: 'footnotes',
    covers: ['footnoteRef', 'footnote', 'footnotes'],
    run: (t) => {
      t.set('<p>claim</p>')
      t.sel(6)
      t.cmd('insertFootnote')
      must(
        t.html().includes('data-footnote-ref=') && t.html().includes('data-footnotes'),
        `insert: ${t.html()}`,
      )
      const id = /data-footnote-ref="([^"]+)"/.exec(t.html())?.[1]
      must(typeof id === 'string', 'no id')
      t.cmd('goToFootnote', id)
      t.cmd('insert', 'because')
      must(t.html().includes('because'), `typed into footnote: ${t.html()}`)
      t.cmd('goToFootnoteRef', id)
      t.cmd('removeFootnote', id)
      must(!t.html().includes('data-footnote-ref'), `remove: ${t.html()}`)
    },
  },
  {
    name: 'selection highlight',
    covers: ['selectionHighlight'],
    run: (t) => {
      t.set('<p>hello world hello</p>')
      t.sel(1, 6)
      must(t.dom.querySelectorAll('.matra-selection-match').length >= 1, 'no matches marked')
      t.sel(1)
      must(t.dom.querySelectorAll('.matra-selection-match').length === 0, 'marks stayed')
    },
  },
  {
    name: 'typewriter',
    covers: ['typewriter'],
    run: (t) => {
      // On from the start; asking for what is already so is refused.
      must(t.editor.extensionState('typewriter')?.enabled === true, 'not on by default')
      t.refuse('enableTypewriter')
      t.set('<p>a</p><p>b</p>')
      t.sel(4)
      t.cmd('disableTypewriter')
      must(t.editor.extensionState('typewriter')?.enabled === false, 'not disabled')
      t.cmd('enableTypewriter')
      t.cmd('toggleTypewriter')
      must(t.editor.extensionState('typewriter')?.enabled === false, 'toggle')
      t.cmd('toggleTypewriter')
    },
  },
  {
    name: 'autosave',
    covers: ['autosave'],
    run: async (t) => {
      t.set('<p>a</p>')
      const before = t.hooks.saves.length
      t.sel(2)
      t.cmd('insert', 'b')
      must(t.editor.extensionState('autosave')?.dirty === true, 'not dirty after an edit')
      await t.tick(60)
      must(t.hooks.saves.length > before, 'no save after the pause')
      const state = t.editor.extensionState('autosave')
      must(
        state.dirty === false && typeof state.savedAt === 'number',
        `state: ${JSON.stringify(state)}`,
      )
      t.cmd('insert', 'c')
      t.cmd('save')
      await t.tick(0)
      must(t.editor.extensionState('autosave').dirty === false, 'save() did not save')
      t.cmd('markSaved', true)
    },
  },
  {
    name: 'markdown and table of contents',
    covers: [],
    run: (t) => {
      const doc = t.core.fromMarkdown('# Hi\n\nSome **bold** text.')
      t.editor.setContent(doc)
      must(
        t.html().includes('<h1') && t.html().includes('<strong>bold</strong>'),
        `fromMarkdown: ${t.html()}`,
      )
      must(t.core.toMarkdown(t.editor.getJSON()).startsWith('# Hi'), 'toMarkdown')
      const toc = t.core.tableOfContents(t.editor.getJSON())
      must(
        toc.length === 1 && toc[0].text === 'Hi' && toc[0].level === 1,
        `toc: ${JSON.stringify(toc)}`,
      )
    },
  },
  {
    name: 'code highlight',
    covers: ['codeHighlight'],
    run: (t) => {
      t.set('<pre data-language="js"><code>const x = "s" // c</code></pre>')
      must(t.dom.querySelector('.matra-token-string') !== null, 'no string token')
      must(t.dom.querySelector('.matra-token-comment') !== null, 'no comment token')
      must(t.core.basicHighlighter('return 1').length > 0, 'basicHighlighter')
    },
  },
  {
    name: 'the selection survives structure changes',
    covers: [],
    run: (t) => {
      const selected = () => {
        const { from, to } = t.editor.selection
        return t.editor.unsafe.state.doc.textBetween(from, to)
      }
      const changes = [
        ['setHeading', 2],
        ['toggleBlockquote'],
        ['toggleBulletList'],
        ['toggleOrderedList'],
        ['toggleTaskList'],
        ['toggleCodeBlock'],
        ['toggleCallout', 'info'],
        ['setColumns', 2],
        ['indent'],
        ['setTextAlign', 'right'],
      ]
      for (const [command, ...args] of changes) {
        t.set('<p>hello world</p>')
        t.sel(1, 6)
        t.cmd(command, ...args)
        must(selected() === 'hello', `${command}: selection is now "${selected()}"`)
        // A code block takes no marks; everything else takes bold next.
        if (command === 'toggleCodeBlock') t.cmd('toggleCodeBlock')
        t.cmd('toggleBold')
        must(t.html().includes('<strong>hello</strong>'), `${command} then bold: ${t.html()}`)
        t.synced()
      }
      t.set('<ul><li><p>one</p></li><li><p>two</p></li></ul>')
      t.sel(11)
      t.cmd('sinkListItem')
      t.cmd('insert', '|')
      must(t.editor.getText().includes('t|wo'), `caret after sink: ${t.editor.getText()}`)
      t.synced()
    },
  },
  {
    name: 'stylesheets',
    covers: [],
    run: (t) => {
      const sheets = Object.entries(t.core).filter(([name]) => name.endsWith('CSS'))
      must(sheets.length >= 20, `only ${sheets.length} stylesheets`)
      for (const [name, css] of sheets) must(typeof css === 'string' && css.includes('{'), name)
    },
  },
]

/**
 * Run every check against a mounted editor. Returns what happened, as data:
 * a row per check, the extensions no check covers, and the totals.
 */
export async function exercise(editor, core, hooks, defs) {
  const view = editor.unsafe.view
  const dom = view?.dom
  if (!dom) throw new Error('the editor is not mounted')
  const document = dom.ownerDocument
  const win = document.defaultView ?? globalThis

  const caretAtEnd = (selector) => {
    const blocks = dom.querySelectorAll(selector)
    const block = blocks[blocks.length - 1]
    if (!block) throw new Miss(`nothing matches ${selector}`)
    let last = block
    while (last.lastChild) last = last.lastChild
    const range = document.createRange()
    const offset = last.nodeType === 3 ? (last.nodeValue ?? '').length : last.childNodes.length
    range.setStart(last, offset)
    range.collapse(true)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
  const fireInput = (inputType, data) => {
    const event = new win.Event('beforeinput', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'inputType', { value: inputType })
    Object.defineProperty(event, 'data', { value: data })
    dom.dispatchEvent(event)
  }

  const t = {
    editor,
    core,
    hooks,
    dom,
    win,
    set: (html) => editor.setContent(html),
    html: () => editor.getHTML().replace(/ id="[^"]*"/g, ''),
    sel: (from, to) => {
      const ok = editor.commands.select(to === undefined ? from : { from, to })
      if (!ok) throw new Miss(`select(${from}, ${to}) refused`)
    },
    cmd: (name, ...args) => {
      const fn = editor.commands[name]
      if (typeof fn !== 'function') throw new Miss(`no command ${name}`)
      const result = fn(...args)
      if (result !== true) throw new Miss(`${name} returned ${result}`)
      return result
    },
    refuse: (name, ...args) => {
      const fn = editor.commands[name]
      if (typeof fn !== 'function') throw new Miss(`no command ${name}`)
      const result = fn(...args)
      if (result !== false) throw new Miss(`${name} returned ${result}, expected false`)
    },
    type: (text, selector = 'p') => {
      for (const character of text) {
        caretAtEnd(selector)
        fireInput('insertText', character)
      }
    },
    press: (key, init = {}) => {
      const event = new win.KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      })
      dom.dispatchEvent(event)
      return event.defaultPrevented
    },
    paste: ({ html = '', text = '', files = [] }) => {
      const event = new win.Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: { getData: (type) => (type === 'text/html' ? html : text), files },
      })
      dom.dispatchEvent(event)
      return event.defaultPrevented
    },
    frame: () => new Promise((done) => win.requestAnimationFrame(() => done())),
    tick: (ms) => new Promise((done) => setTimeout(done, ms)),
    /** The screen says what the document says. Not for checks that draw widgets. */
    synced: () => {
      const squash = (text) => text.replace(/[\s​]+/g, '')
      const drawn = squash(dom.textContent ?? '')
      const held = squash(editor.getText())
      if (drawn !== held) throw new Miss(`DOM says "${drawn}", document says "${held}"`)
    },
  }

  const results = []
  for (const check of CHECKS) {
    try {
      await check.run(t)
      results.push({ name: check.name, ok: true, detail: '' })
    } catch (error) {
      const message = error instanceof Miss ? error.message : `threw: ${error?.stack ?? error}`
      results.push({ name: check.name, ok: false, detail: message.slice(0, 400) })
    }
  }

  const covered = new Set(CHECKS.flatMap((check) => check.covers))
  const uncovered = (defs ?? [])
    .map((def) => def.name)
    .filter((name) => name !== 'core' && !covered.has(name))
  const failed = results.filter((row) => !row.ok).length + (uncovered.length ? 1 : 0)
  return { count: defs?.length ?? 0, checks: results.length, failed, uncovered, results }
}
