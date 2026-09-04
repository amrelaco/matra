import { Fragment } from './fragment'
import type { Mark, MarkType } from './mark'
import type { Node } from './node'
import { Schema } from './schema'
import type { NodeType, ParseRule } from './schema'

/**
 * A rule's selector, read once.
 *
 * `p`, `h[1-6]`, `a[href]`, `ul[data-type="taskList"]`, `span.mention` — the
 * small subset rules actually use. Attribute-value selectors matter more than
 * they look: they are how one tag carries two node types — a
 * `<ul data-type="taskList">` is a checklist and a bare `<ul>` is a bulleted
 * one, and without the value the specific rule can never win.
 *
 * Matching used to run three regular expressions over the selector string for
 * every element against every rule, which on a pasted page of two thousand
 * paragraphs was several hundred thousand regex executions to say `p` is `p`.
 */
interface Selector {
  /** Lower-case tag, or null for any tag. */
  tag: string | null
  attr?: string
  value?: string
  className?: string
}

interface CompiledRule extends ParseRule {
  owner: NodeType | MarkType
  kind: 'node' | 'mark'
  selector: Selector
  /** Position in priority order, so two lists can be merged in it. */
  order: number
}

function compileSelector(selector: string): Selector {
  if (selector === '*') return { tag: null }

  const withValue = /^([\w-]+)?\[([\w-]+)\s*=\s*["']?([^\]"']*)["']?\]$/.exec(selector)
  if (withValue) {
    return {
      tag: withValue[1] ?? null,
      attr: withValue[2] as string,
      value: withValue[3] ?? '',
    }
  }

  const presence = /^([\w-]+)?\[([\w-]+)\]$/.exec(selector)
  if (presence) return { tag: presence[1] ?? null, attr: presence[2] as string }

  const withClass = /^([\w-]+)?\.([\w-]+)$/.exec(selector)
  if (withClass) return { tag: withClass[1] ?? null, className: withClass[2] as string }

  return { tag: selector }
}

function matches(element: Element, selector: Selector): boolean {
  if (selector.className !== undefined) return element.classList.contains(selector.className)
  if (selector.attr !== undefined) {
    if (selector.value !== undefined)
      return element.getAttribute(selector.attr) === selector.value
    return element.hasAttribute(selector.attr)
  }
  return true
}

/**
 * DOM → document.
 *
 * Rules come from each node and mark's `parseDOM`. An element that matches
 * nothing is transparent: the parser descends into it rather than dropping the
 * text inside, which is what makes pasting from a word processor survive.
 */
export class DOMParser {
  /** Tag rules by the tag they name, each list in priority order. */
  private readonly byTag = new Map<string, CompiledRule[]>()
  /** Tag rules that name no tag — `*`, `[data-x]` — checked for every element. */
  private readonly anyTag: CompiledRule[] = []
  private readonly styleRules: CompiledRule[]

  constructor(readonly schema: Schema) {
    const rules: Array<Omit<CompiledRule, 'order'>> = []
    for (const type of Object.values(schema.nodes)) {
      for (const rule of type.spec.parseDOM ?? []) {
        rules.push({
          ...rule,
          owner: type,
          kind: 'node',
          selector: compileSelector(rule.tag ?? '*'),
        })
      }
    }
    for (const type of Object.values(schema.marks)) {
      for (const rule of (type.spec.parseDOM ?? []) as ParseRule[]) {
        rules.push({
          ...rule,
          owner: type,
          kind: 'mark',
          selector: compileSelector(rule.tag ?? '*'),
        })
      }
    }
    rules.sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50))
    const ordered = rules.map((rule, order): CompiledRule => ({ ...rule, order }))

    for (const rule of ordered) {
      if (rule.tag === undefined) continue
      const tag = rule.selector.tag
      if (tag === null) {
        this.anyTag.push(rule)
        continue
      }
      const list = this.byTag.get(tag) ?? []
      list.push(rule)
      this.byTag.set(tag, list)
    }
    this.styleRules = ordered.filter((rule) => rule.style !== undefined)
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
  /**
   * @param literal  whitespace is content: inside a `<pre>`, or a node that
   *   says its text is code. Nothing is collapsed and nothing is trimmed.
   */
  private parseChildren(
    dom: globalThis.Node,
    marks: readonly Mark[],
    depth = 0,
    parent: NodeType | null = null,
    literal = false,
  ): Fragment {
    if (depth > Schema.MAX_DEPTH) return Fragment.empty
    const out: Node[] = []

    for (let child = dom.firstChild; child; child = child.nextSibling) {
      // The newline and indentation between two block tags is how the source
      // was formatted, not something anybody typed. Left in, each run becomes
      // its own paragraph, and a document written across several lines gains a
      // blank paragraph between every pair of blocks.
      if (!literal && child.nodeType === 3 && isBlank(child.nodeValue) && nextToBlock(child))
        continue
      const nodes = this.parseOne(child, marks, depth + 1, parent, literal)
      for (let i = 0; i < nodes.length; i++) out.push(nodes[i] as Node)
    }

    return Fragment.from(literal ? out : trimEdges(out))
  }

  private parseOne(
    dom: globalThis.Node,
    marks: readonly Mark[],
    depth = 0,
    parent: NodeType | null = null,
    literal = false,
  ): readonly Node[] {
    // Scaffolding the view puts in empty blocks so they have height. Reading it
    // back would turn every empty paragraph into one containing a hard break.
    if (dom.nodeType === 1 && (dom as Element).hasAttribute('data-matra-filler')) return NONE
    if (dom.nodeType === 3) {
      const raw = dom.nodeValue ?? ''
      const text = literal ? raw : normaliseWhitespace(raw)
      return text ? [this.schema.text(text, marks)] : NONE
    }
    if (dom.nodeType !== 1) return NONE

    const element = dom as Element
    const matched = this.matchElement(element)

    if (matched?.ignore) return NONE

    if (matched?.kind === 'mark') {
      const type = matched.owner as MarkType
      const attrs = this.attrsFor(matched, element)
      if (attrs === false) {
        return this.parseChildren(element, marks, depth, parent, literal).content
      }
      // The node this text is landing in may not accept the mark. A code block
      // says it accepts none — so the `<code>` inside a `<pre>` is the fence's
      // own tag, not an inline code mark, and reading it as one produced
      // `<pre><code><code>` on the way back out.
      const carried =
        parent && !parent.allowsMarkType(type) ? marks : type.create(attrs).addToSet(marks)
      return this.parseChildren(element, carried, depth, parent, literal).content
    }

    if (matched?.kind === 'node') {
      const type = matched.owner as NodeType
      const attrs = this.attrsFor(matched, element)
      if (attrs === false) {
        return this.parseChildren(element, marks, depth, parent, literal).content
      }
      // Marks this node will not accept are dropped at its border rather than
      // carried in and rendered back out.
      const inherited = marks.filter((mark) => type.allowsMarkType(mark.type))
      const inner = literal || type.spec.code === true || element.tagName === 'PRE'
      const content = type.isLeaf
        ? Fragment.empty
        : this.fitContent(type, this.parseChildren(element, inherited, depth, type, inner))
      const node = type.createAndFill(attrs, content)
      return node ? [node] : NONE
    }

    // Inline styles can carry marks even when the tag means nothing.
    const styleMarks = this.marksFromStyle(element, marks).filter(
      (mark) => !parent || parent.allowsMarkType(mark.type),
    )
    return this.parseChildren(
      element,
      styleMarks,
      depth,
      parent,
      literal || element.tagName === 'PRE',
    ).content
  }

  /**
   * The highest-priority rule this element matches.
   *
   * Two lists — the rules for this tag and the rules for any tag — each already
   * in priority order, walked together so the first hit is the overall winner.
   */
  private matchElement(element: Element): CompiledRule | null {
    const forTag = this.byTag.get(element.tagName.toLowerCase())
    const anyTag = this.anyTag
    if (!forTag && !anyTag.length) return null
    let i = 0
    let j = 0
    for (;;) {
      const a = forTag ? forTag[i] : undefined
      const b = anyTag[j]
      if (!a && !b) return null
      let next: CompiledRule
      if (!b || (a && a.order < b.order)) {
        next = a as CompiledRule
        i++
      } else {
        next = b
        j++
      }
      if (matches(element, next.selector)) return next
    }
  }

  private marksFromStyle(element: Element, marks: readonly Mark[]): readonly Mark[] {
    if (!this.styleRules.length || !element.hasAttribute('style')) return marks
    const style = (element as HTMLElement).style
    if (!style) return marks
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

const NONE: readonly Node[] = []

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
  'DETAILS',
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
  'SUMMARY',
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
  const out = nodes

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
