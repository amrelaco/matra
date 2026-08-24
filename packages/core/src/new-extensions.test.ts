import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import {
  assignIds,
  fromMarkdown,
  starterKit,
  tableOfContents,
  taskItem,
  taskList,
  toMarkdown,
  typography,
} from './extensions'
import type { DocNode, Pos } from './types'

const kit = [...starterKit, taskList, taskItem, typography] as const
const editor = (content?: string) => createEditor({ extensions: kit, content })

describe('task lists', () => {
  it('renders a real checkbox the caret cannot enter', () => {
    const e = editor()
    e.setContent({
      type: 'doc',
      content: [
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }],
            },
          ],
        },
      ],
    } as never)
    const html = e.getHTML()
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('contenteditable="false"')
    expect(html).toContain('data-checked="true"')
  })

  it('round-trips through HTML', () => {
    const e = editor()
    e.setContent('<ul data-type="taskList"><li data-checked="true"><p>x</p></li></ul>')
    expect(e.getJSON().content?.[0]?.type).toBe('taskList')
    expect((e.getJSON().content?.[0] as DocNode).content?.[0]?.attrs?.checked).toBe(true)
  })
})

describe('typography', () => {
  const rules = typography.inputRules ?? []
  const apply = (text: string) => {
    for (const rule of rules) {
      const match = rule.match.exec(text)
      if (match) return { match, rule }
    }
    return null
  }

  it('closes an apostrophe inside a word', () => {
    const hit = apply("don'")
    expect(hit).not.toBeNull()
    expect(hit?.match[0]).toBe("n'")
  })

  it('opens a quote after a space', () => {
    expect(apply(' "')).not.toBeNull()
    expect(apply('...')).not.toBeNull()
    expect(apply('--')).not.toBeNull()
  })

  it('leaves ordinary text alone', () => {
    expect(apply('hello')).toBeNull()
    expect(apply('a.b')).toBeNull()
  })
})

describe('table of contents', () => {
  it('lists headings in order with positions that resolve', () => {
    const e = editor('<h1>One</h1><p>text</p><h2>Two</h2><h3>Three</h3>')
    const toc = tableOfContents(e.getJSON())
    expect(toc.map((entry) => entry.text)).toEqual(['One', 'Two', 'Three'])
    expect(toc.map((entry) => entry.level)).toEqual([1, 2, 3])
    // A position is only useful if selecting it works.
    for (const entry of toc) expect(e.commands.select((entry.pos + 1) as Pos)).toBe(true)
  })

  it('gives two identical headings different anchors', () => {
    const e = editor('<h2>Setup</h2><h2>Setup</h2>')
    expect(tableOfContents(e.getJSON()).map((x) => x.id)).toEqual(['setup', 'setup-1'])
  })

  it('keeps non-latin headings readable rather than empty', () => {
    const e = editor('<h1>নথি</h1>')
    expect(tableOfContents(e.getJSON())[0]?.id).toBe('নথি')
  })
})

describe('unique ids', () => {
  const ids = (doc: DocNode): string[] =>
    (doc.content ?? []).map((node) => String(node.attrs?.id ?? ''))

  it('gives every block an id and keeps ids it already has', () => {
    const e = editor('<p>a</p><p>b</p>')
    const first = assignIds(e.getJSON(), { generate: seq() })
    expect(ids(first)).toEqual(['id1', 'id2'])
    const again = assignIds(first, { generate: seq() })
    expect(ids(again)).toEqual(['id1', 'id2'])
  })

  it('replaces a duplicate rather than trusting the document', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { id: 'same' }, content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph', attrs: { id: 'same' }, content: [{ type: 'text', text: 'b' }] },
      ],
    } as DocNode
    const out = ids(assignIds(doc, { generate: seq() }))
    expect(out[0]).toBe('same')
    expect(out[1]).not.toBe('same')
  })
})

const seq = () => {
  let n = 0
  return () => `id${++n}`
}

describe('markdown', () => {
  const trip = (markdown: string) => toMarkdown(fromMarkdown(markdown)).trim()

  it('round-trips the common shapes', () => {
    for (const source of [
      '# Heading',
      'Plain paragraph.',
      '**bold** and *italic* and `code`',
      '- one\n- two',
      '1. one\n2. two',
      '> quoted',
      '---',
      '[link](https://example.com)',
      '![alt](https://example.com/a.png)',
    ]) {
      expect(trip(source)).toBe(source)
    }
  })

  it('fences code longer than the backticks inside it', () => {
    const doc = fromMarkdown('```\nconst a = `x`\n```')
    expect(toMarkdown(doc)).toContain('```')
    const nested = {
      type: 'doc',
      content: [{ type: 'codeBlock', content: [{ type: 'text', text: '``` inside' }] }],
    } as DocNode
    const out = toMarkdown(nested)
    // The fence has to outrun the longest run inside, or the block ends early.
    expect(out.startsWith('````')).toBe(true)
  })

  it('keeps a task list a task list', () => {
    expect(trip('- [x] done\n- [ ] todo')).toBe('- [x] done\n- [ ] todo')
  })

  it('escapes text that would otherwise become syntax', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '# not a heading *not italic*' }],
        },
      ],
    } as DocNode
    const out = toMarkdown(doc)
    expect(out).toContain('\\#')
    const back = fromMarkdown(out)
    expect((back.content?.[0] as DocNode).content?.[0]?.text).toBe(
      '# not a heading *not italic*',
    )
  })

  it('never loses text, whatever it is handed', () => {
    for (const source of ['', '   ', '\n\n\n', '```unclosed', '- ', '#', '[](', '***']) {
      expect(() => toMarkdown(fromMarkdown(source))).not.toThrow()
    }
  })

  it('runs without a DOM at all', () => {
    // The point of the string path: this is what a server can do.
    const doc = fromMarkdown('# Title\n\nBody **here**.')
    expect(toMarkdown(doc)).toContain('# Title')
    expect(doc.content?.[0]?.type).toBe('heading')
  })
})
