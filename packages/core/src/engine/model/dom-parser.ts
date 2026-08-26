import { Fragment } from './fragment'
import type { Mark, MarkType } from './mark'
import type { Node } from './node'
import { Schema } from './schema'
import type { NodeType, ParseRule } from './schema'

interface CompiledRule extends ParseRule {
  owner: NodeType | MarkType
  kind: 'node' | 'mark'
}

/**
 * DOM → document.
 *
 * Rules come from each node and mark's `parseDOM`. An element that matches
 * nothing is transparent: the parser descends into it rather than dropping the
 * text inside, which is what makes pasting from a word processor survive.
 */
export class DOMParser {
  private readonly tagRules: CompiledRule[]
  private readonly styleRules: CompiledRule[]

  constructor(readonly schema: Schema) {
    const rules: CompiledRule[] = []
    for (const type of Object.values(schema.nodes)) {
      for (const rule of type.spec.parseDOM ?? []) {
        rules.push({ ...rule, owner: type, kind: 'node' })
      }
    }
    for (const type of Object.values(schema.marks)) {
      for (const rule of (type.spec.parseDOM ?? []) as ParseRule[]) {
        rules.push({ ...rule, owner: type, kind: 'mark' })
      }
    }
    rules.sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50))
    this.tagRules = rules.filter((rule) => rule.tag !== undefined)
    this.styleRules = rules.filter((rule) => rule.style !== undefined)
  }

  static fromSchema(schema: Schema): DOMParser {
    return new DOMParser(schema)
  }

  /** Parse an element's children into a document. */
  parse(dom: globalThis.Node): Node {
    const content = this.fitContent(this.schema.topNodeType, this.parseChildren(dom, []))
    const doc = this.schema.topNodeType.createAndFill(null, content)
    if (!doc) throw new Error('Matra: could not build a document from that DOM')
    return doc
  }

  /**
   * Give loose inline content a block to live in.
   *
   * Pasting `hello`, a bare `<strong>hi</strong>`, or — far more commonly —
   * `<li>text</li>`, yields inline nodes where the parent expects blocks.
   * Dropping them loses the content, and `<li>` without an inner `<p>` is how
   * almost every list on the web is written, so dropping it means pasting a
   * list from anywhere arrives empty.
   *
   * This runs for any parent, not only the document. It used to run only at the
   * top level, which is exactly why list items came back blank.
   */
  private fitContent(type: NodeType, fragment: Fragment): Fragment {
    if (type.validContent(fragment)) return fragment

    const wrapper = type.contentMatch.allowed.find(
      (candidate) => (candidate as NodeType).isTextblock && (candidate as NodeType).fillable,
    ) as NodeType | undefined
    if (!wrapper) return fragment

    const out: Node[] = []
    let loose: Node[] = []
    const flush = () => {
      if (!loose.length) return
      const node = wrapper.createAndFill(null, Fragment.from(loose))
      if (node) out.push(node)
      loose = []
    }
    for (const child of fragment) {
      if (child.isInline) loose.push(child)
      else {
        flush()
        out.push(child)
      }
    }
    flush()
    return Fragment.from(out)
  }

  /** Parse into a fragment, without wrapping in a document. */
  parseFragment(dom: globalThis.Node): Fragment {
    return this.parseChildren(dom, [])
  }

  /**
   * Pasted HTML nests as deeply as the clipboard likes, and every level here is
   * a stack frame. Past this depth the content is discarded rather than
   * followed — five thousand nested blockquotes are an attack, not a document.
   */
  private parseChildren(
    dom: globalThis.Node,
    marks: readonly Mark[],
    depth = 0,
    parent: NodeType | null = null,
  ): Fragment {
    if (depth > Schema.MAX_DEPTH) return Fragment.empty
    const children = Array.from(dom.childNodes)
    const out: Node[] = []

    for (const child of children) {
      // The newline and indentation between two block tags is how the source
      // was formatted, not something anybody typed. Left in, each run becomes
      // its own paragraph, and a document written across several lines gains a
      // blank paragraph between every pair of blocks.
      if (child.nodeType === 3 && isBlank(child.nodeValue) && nextToBlock(child)) continue
      out.push(...this.parseOne(child, marks, depth + 1, parent))
    }

    return Fragment.from(trimEdges(out))
  }

  private parseOne(
    dom: globalThis.Node,
    marks: readonly Mark[],
    depth = 0,
    parent: NodeType | null = null,
  ): Node[] {
    // Scaffolding the view puts in empty blocks so they have height. Reading it
    // back would turn every empty paragraph into one containing a hard break.
    if (dom.nodeType === 1 && (dom as Element).hasAttribute('data-matra-filler')) return []
    if (dom.nodeType === 3) {
      const text = normaliseWhitespace(dom.nodeValue ?? '')
      return text ? [this.schema.text(text, marks)] : []
    }
    if (dom.nodeType !== 1) return []

    const element = dom as Element
    const matched = this.matchElement(element)

    if (matched?.ignore) return []

    if (matched?.kind === 'mark') {
      const type = matched.owner as MarkType
      const attrs = this.attrsFor(matched, element)
      if (attrs === false) {
        return this.parseChildren(element, marks, depth, parent).content.slice()
      }
      // The node this text is landing in may not accept the mark. A code block
      // says it accepts none — so the `<code>` inside a `<pre>` is the fence's
      // own tag, not an inline code mark, and reading it as one produced
      // `<pre><code><code>` on the way back out.
      const carried =
        parent && !parent.allowsMarkType(type) ? marks : type.create(attrs).addToSet(marks)
      return this.parseChildren(element, carried, depth, parent).content.slice()
    }

    if (matched?.kind === 'node') {
      const type = matched.owner as NodeType
      const attrs = this.attrsFor(matched, element)
      if (attrs === false) {
        return this.parseChildren(element, marks, depth, parent).content.slice()
      }
      // Marks this node will not accept are dropped at its border rather than
      // carried in and rendered back out.
      const inherited = marks.filter((mark) => type.allowsMarkType(mark.type))
      const content = type.isLeaf
        ? Fragment.empty
        : this.fitContent(type, this.parseChildren(element, inherited, depth, type))
      const node = type.createAndFill(attrs, content)
      return node ? [node] : []
    }

    // Inline styles can carry marks even when the tag means nothing.
    const styleMarks = this.marksFromStyle(element, marks).filter(
      (mark) => !parent || parent.allowsMarkType(mark.type),
    )
    return this.parseChildren(element, styleMarks, depth, parent).content.slice()
  }

  private matchElement(element: Element): CompiledRule | null {
    const tag = element.tagName.toLowerCase()
    for (const rule of this.tagRules) {
      if (!rule.tag) continue
      if (matchesSelector(element, rule.tag, tag)) return rule
    }
    return null
  }

  private marksFromStyle(element: Element, marks: readonly Mark[]): readonly Mark[] {
    const style = (element as HTMLElement).style
    if (!style || !this.styleRules.length) return marks
    let out = marks
    for (const rule of this.styleRules) {
      if (!rule.style) continue
      const value = style.getPropertyValue(rule.style)
      if (!value) continue
      const attrs = rule.getAttrs ? rule.getAttrs(value) : (rule.attrs ?? null)
      if (attrs === false) continue
      if (rule.kind !== 'mark') continue
      out = (rule.owner as MarkType).create(attrs).addToSet(out)
    }
    return out
  }

  private attrsFor(
    rule: CompiledRule,
    element: Element,
  ): Record<string, unknown> | false | null {
    if (rule.getAttrs) return rule.getAttrs(element)
    return rule.attrs ?? null
  }
}

/** `p`, `h[1-6]`, `a[href]` — the small selector subset rules actually use. */
/**
 * The selector subset parse rules actually use.
 *
 * `tag`, `*`, `tag[attr]`, `tag[attr="value"]` and `tag.class`. Attribute-value
 * selectors matter more than they look: they are how one tag carries two node
 * types — a `<ul data-type="taskList">` is a checklist and a bare `<ul>` is a
 * bulleted one, and without the value the specific rule can never win.
 */
function matchesSelector(element: Element, selector: string, tag: string): boolean {
  if (selector === '*') return true

  const withValue = /^([\w-]+)?\[([\w-]+)\s*=\s*["']?([^\]"']*)["']?\]$/.exec(selector)
  if (withValue) {
    if (withValue[1] && tag !== withValue[1]) return false
    return element.getAttribute(withValue[2] as string) === withValue[3]
  }

  const presence = /^([\w-]+)?\[([\w-]+)\]$/.exec(selector)
  if (presence) {
    if (presence[1] && tag !== presence[1]) return false
    return element.hasAttribute(presence[2] as string)
  }

  const withClass = /^([\w-]+)?\.([\w-]+)$/.exec(selector)
  if (withClass) {
    if (withClass[1] && tag !== withClass[1]) return false
    return element.classList.contains(withClass[2] as string)
  }

  return tag === selector
}

/** Collapse runs of whitespace the way HTML rendering does. */
function normaliseWhitespace(text: string): string {
  return text.replace(/[\s\r\n]+/g, ' ')
}

const isBlank = (text: string | null) => text !== null && text.trim() === ''

/** Is this text node sitting next to a block element rather than inline text? */
function nextToBlock(node: globalThis.Node): boolean {
  const before = node.previousSibling
  const after = node.nextSibling
  // Nothing either side: the parent held only whitespace, which is not content.
  if (!before && !after) return true
  return isBlockElement(before) || isBlockElement(after)
}

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'UL',
])

function isBlockElement(node: globalThis.Node | null): boolean {
  return node !== null && node.nodeType === 1 && BLOCK_TAGS.has((node as Element).tagName)
}

/**
 * Drop the space a source file left at the start and end of a block.
 *
 * `<p>\n  Hello\n</p>` carries a leading and a trailing space that nobody
 * typed. HTML hides them by collapsing whitespace; an editor cannot, because it
 * has to show the spaces people *do* type.
 */
function trimEdges(nodes: Node[]): Node[] {
  if (nodes.length === 0) return nodes
  const out = [...nodes]

  const first = out[0] as Node
  if (first.isText) {
    const trimmed = (first.text ?? '').replace(/^ +/, '')
    if (trimmed !== first.text) {
      if (!trimmed) out.shift()
      else out[0] = first.withText(trimmed)
    }
  }

  const lastIndex = out.length - 1
  const last = out[lastIndex] as Node | undefined
  if (last?.isText) {
    const trimmed = (last.text ?? '').replace(/ +$/, '')
    if (trimmed !== last.text) {
      if (!trimmed) out.pop()
      else out[lastIndex] = last.withText(trimmed)
    }
  }

  return out
}
