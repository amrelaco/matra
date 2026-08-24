import type { DocMark, DocNode } from '../types'

/**
 * Markdown in and out, without a DOM.
 *
 * Deliberately not built on the HTML path: going through `getHTML` would need a
 * DOM, and the most useful place to turn a document into Markdown is a server
 * that does not have one. Both directions here are pure string work, so they
 * run in Node, in a worker, and at the edge.
 *
 * This is CommonMark's common half — the part documents actually use. It is not
 * a full CommonMark implementation and does not pretend to be: reference links,
 * setext headings and HTML blocks are not handled, and `toMarkdown` escapes
 * rather than emits raw HTML.
 */

export function toMarkdown(doc: DocNode): string {
  return `${blocks(doc.content ?? [], '').trimEnd()}\n`
}

function blocks(nodes: DocNode[], indent: string): string {
  return nodes.map((node) => block(node, indent)).join('')
}

function block(node: DocNode, indent: string): string {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
      return `${indent}${'#'.repeat(level)} ${inline(node)}\n\n`
    }
    case 'paragraph': {
      const text = guardLineStart(inline(node))
      return text ? `${indent}${text}\n\n` : ''
    }
    case 'blockquote': {
      const inner = blocks(node.content ?? [], '').trimEnd()
      const quoted = inner.split('\n').map((line) => `${indent}> ${line}`.trimEnd())
      return `${quoted.join('\n')}\n\n`
    }
    case 'codeBlock': {
      const language = typeof node.attrs?.language === 'string' ? node.attrs.language : ''
      // A fence has to be longer than the longest run of backticks inside it,
      // or the block ends early and the rest of the document becomes code.
      const body = plain(node)
      const longest = (body.match(/`+/g) ?? []).reduce((n, r) => Math.max(n, r.length), 0)
      const fence = '`'.repeat(Math.max(3, longest + 1))
      return `${indent}${fence}${language}\n${body}\n${indent}${fence}\n\n`
    }
    case 'horizontalRule':
      return `${indent}---\n\n`
    case 'bulletList':
      return list(node, indent, () => '- ')
    case 'taskList':
      return list(node, indent, (child) => (child.attrs?.checked ? '- [x] ' : '- [ ] '))
    case 'orderedList': {
      let n = Number(node.attrs?.start ?? 1) || 1
      return list(node, indent, () => `${n++}. `)
    }
    default: {
      if (node.content) return blocks(node.content, indent)
      return ''
    }
  }
}

function list(node: DocNode, indent: string, marker: (child: DocNode) => string): string {
  const items = (node.content ?? []).map((child) => {
    const bullet = marker(child)
    const inner = blocks(child.content ?? [], '').trimEnd()
    const [first = '', ...rest] = inner.split('\n')
    const pad = ' '.repeat(bullet.length)
    const tail = rest.map((line) => (line ? `${indent}${pad}${line}` : '')).join('\n')
    return `${indent}${bullet}${first}${tail ? `\n${tail}` : ''}`
  })
  return `${items.join('\n')}\n\n`
}

/** Text with no marks applied — for code, where marks mean nothing. */
function plain(node: DocNode): string {
  if (typeof node.text === 'string') return node.text
  return (node.content ?? []).map(plain).join('')
}

const MARK_WRAP: Record<string, string> = {
  bold: '**',
  italic: '*',
  strike: '~~',
  code: '`',
}

function inline(node: DocNode): string {
  return (node.content ?? []).map(piece).join('')
}

function piece(node: DocNode): string {
  if (node.type === 'hardBreak') return '\\\n'
  if (node.type === 'image') {
    const src = String(node.attrs?.src ?? '')
    const alt = String(node.attrs?.alt ?? '')
    return `![${alt}](${src})`
  }
  if (typeof node.text !== 'string') return inline(node)

  const marks = node.marks ?? []
  // Code is literal: escaping inside it would put backslashes in the output.
  const isCode = marks.some((mark) => mark.type === 'code')
  let out = isCode ? node.text : escapeSyntax(node.text)

  for (const mark of marks) {
    const wrap = MARK_WRAP[mark.type]
    if (wrap) out = `${wrap}${out}${wrap}`
  }
  const link = marks.find((mark: DocMark) => mark.type === 'link')
  if (link) out = `[${out}](${String(link.attrs?.href ?? '')})`
  return out
}

/**
 * Escape only what would otherwise become syntax.
 *
 * The temptation is to escape every character Markdown has ever used, which
 * turns "Plain paragraph." into "Plain paragraph\." and makes the output
 * unreadable to a human — the one audience Markdown has. These five are the
 * characters that mean something wherever they appear; the rest only mean
 * something at the start of a line, and are handled there.
 */
function escapeSyntax(text: string): string {
  return text.replace(/([\\`*_[\]])/g, '\\$1')
}

/** Stop a paragraph's first characters from reading as a block marker. */
function guardLineStart(text: string): string {
  return text.replace(/^(\s*)(#{1,6}(?=\s)|>|[-+](?=\s)|\d+(?=[.)]\s))/, '$1\\$2')
}

// --- parsing ---------------------------------------------------------------

/**
 * Markdown to a document.
 *
 * Line-based, which is what makes it small. Anything it does not recognise
 * becomes a paragraph rather than being dropped — losing text is worse than
 * losing formatting.
 */
export function fromMarkdown(source: string): DocNode {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const content: DocNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] as string

    if (!line.trim()) {
      i++
      continue
    }

    const fence = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      const marker = fence[2] as string
      const language = (fence[3] ?? '').trim()
      const body: string[] = []
      i++
      while (i < lines.length && !(lines[i] as string).trimStart().startsWith(marker)) {
        body.push(lines[i] as string)
        i++
      }
      i++
      content.push({
        type: 'codeBlock',
        ...(language ? { attrs: { language } } : {}),
        content: body.length ? [{ type: 'text', text: body.join('\n') }] : undefined,
      })
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      content.push({
        type: 'heading',
        attrs: { level: (heading[1] as string).length },
        content: spans(heading[2] as string),
      })
      i++
      continue
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      content.push({ type: 'horizontalRule' })
      i++
      continue
    }

    if (/^\s*>/.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i] as string)) {
        quoted.push((lines[i] as string).replace(/^\s*>\s?/, ''))
        i++
      }
      content.push({ type: 'blockquote', content: fromMarkdown(quoted.join('\n')).content })
      continue
    }

    const item = /^(\s*)([-+*]|\d+[.)])\s+(.*)$/.exec(line)
    if (item) {
      const ordered = /\d/.test(item[2] as string)
      const items: DocNode[] = []
      let task = false
      while (i < lines.length) {
        const next = /^(\s*)([-+*]|\d+[.)])\s+(.*)$/.exec(lines[i] as string)
        if (!next) break
        if (/\d/.test(next[2] as string) !== ordered) break
        let text = next[3] as string
        const box = /^\[([ xX]?)\]\s+(.*)$/.exec(text)
        let checked: boolean | null = null
        if (box) {
          task = true
          checked = (box[1] ?? '').toLowerCase() === 'x'
          text = box[2] as string
        }
        items.push({
          type: checked === null ? 'listItem' : 'taskItem',
          ...(checked === null ? {} : { attrs: { checked } }),
          content: [{ type: 'paragraph', content: spans(text) }],
        })
        i++
      }
      content.push({
        type: task ? 'taskList' : ordered ? 'orderedList' : 'bulletList',
        content: items,
      })
      continue
    }

    // A paragraph runs until a blank line.
    const paragraph: string[] = []
    while (i < lines.length && (lines[i] as string).trim()) {
      paragraph.push(lines[i] as string)
      i++
    }
    content.push({ type: 'paragraph', content: spans(paragraph.join(' ')) })
  }

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

/** Inline syntax, innermost first so nesting works. */
const INLINE: [RegExp, string][] = [
  [/`([^`]+)`/, 'code'],
  [/\*\*([^*]+)\*\*/, 'bold'],
  [/__([^_]+)__/, 'bold'],
  [/~~([^~]+)~~/, 'strike'],
  [/\*([^*]+)\*/, 'italic'],
  [/_([^_]+)_/, 'italic'],
]

/**
 * Inline syntax, with escapes honoured.
 *
 * The rules below are regexes over the raw string, and a regex cannot tell
 * `*emphasis*` from `\*not emphasis\*`. Escaped characters are masked to a
 * private-use sentinel before matching and restored at the leaves, so a
 * backslash actually means something — otherwise `toMarkdown` escapes text and
 * `fromMarkdown` immediately reads the escapes back as syntax.
 */
function spans(source: string, marks: DocMark[] = []): DocNode[] {
  return scan(mask(source), marks)
}

const MASK_OPEN = '\uE000'
const MASK_CLOSE = '\uE001'

function mask(text: string): string {
  return text.replace(
    /\\([\\`*_[\]#>+\-.)!])/g,
    (_all, char: string) => `${MASK_OPEN}${char.charCodeAt(0).toString(16)}${MASK_CLOSE}`,
  )
}

function unmask(text: string): string {
  return text.replace(
    new RegExp(`${MASK_OPEN}([0-9a-f]+)${MASK_CLOSE}`, 'g'),
    (_all, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)),
  )
}

function scan(text: string, marks: DocMark[] = []): DocNode[] {
  if (!text) return []

  const link = /\[([^\]]*)\]\(([^)\s]*)\)/.exec(text)
  const image = /!\[([^\]]*)\]\(([^)\s]*)\)/.exec(text)
  if (image && (!link || image.index <= link.index)) {
    return [
      ...scan(text.slice(0, image.index), marks),
      { type: 'image', attrs: { src: unmask(image[2] ?? ''), alt: unmask(image[1] ?? '') } },
      ...scan(text.slice(image.index + image[0].length), marks),
    ]
  }
  if (link) {
    return [
      ...scan(text.slice(0, link.index), marks),
      ...scan(link[1] ?? '', [
        ...marks,
        { type: 'link', attrs: { href: unmask(link[2] ?? '') } },
      ]),
      ...scan(text.slice(link.index + link[0].length), marks),
    ]
  }

  for (const [pattern, mark] of INLINE) {
    const found = pattern.exec(text)
    if (!found) continue
    // Code is literal, so its interior is not scanned for more syntax.
    const inner: DocNode[] =
      mark === 'code'
        ? [{ type: 'text', text: unmask(found[1] ?? ''), marks: [...marks, { type: 'code' }] }]
        : scan(found[1] ?? '', [...marks, { type: mark }])
    return [
      ...scan(text.slice(0, found.index), marks),
      ...inner,
      ...scan(text.slice(found.index + found[0].length), marks),
    ]
  }

  return [{ type: 'text', text: unmask(text), ...(marks.length ? { marks } : {}) }]
}
