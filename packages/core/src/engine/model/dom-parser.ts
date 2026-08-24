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
    const content = this.wrapLooseInline(this.parseChildren(dom, []))
    const doc = this.schema.topNodeType.createAndFill(null, content)
    if (!doc) throw new Error('Matra: could not build a document from that DOM')
    return doc
  }

  /**
   * Give loose inline content a block to live in.
   *
   * Pasting `hello` or a bare `<strong>hi</strong>` yields inline nodes with no
   * parent block. Dropping them would lose the paste; wrapping them in the
   * default textblock is what the user meant.
   */
  private wrapLooseInline(fragment: Fragment): Fragment {
    const top = this.schema.topNodeType
    if (top.validContent(fragment)) return fragment

    const wrapper = top.contentMatch.allowed.find(
      (type) => (type as NodeType).isTextblock && (type as NodeType).fillable,
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
  private parseChildren(dom: globalThis.Node, marks: readonly Mark[], depth = 0): Fragment {
    if (depth > Schema.MAX_DEPTH) return Fragment.empty
    const out: Node[] = []
    for (const child of Array.from(dom.childNodes)) {
      out.push(...this.parseOne(child, marks, depth + 1))
    }
    return Fragment.from(out)
  }

  private parseOne(dom: globalThis.Node, marks: readonly Mark[], depth = 0): Node[] {
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
      if (attrs === false) return this.parseChildren(element, marks, depth).content.slice()
      const mark = type.create(attrs)
      return this.parseChildren(element, mark.addToSet(marks), depth).content.slice()
    }

    if (matched?.kind === 'node') {
      const type = matched.owner as NodeType
      const attrs = this.attrsFor(matched, element)
      if (attrs === false) return this.parseChildren(element, marks, depth).content.slice()
      const content = type.isLeaf ? Fragment.empty : this.parseChildren(element, marks, depth)
      const node = type.createAndFill(attrs, content)
      return node ? [node] : []
    }

    // Inline styles can carry marks even when the tag means nothing.
    const styleMarks = this.marksFromStyle(element, marks)
    return this.parseChildren(element, styleMarks, depth).content.slice()
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
