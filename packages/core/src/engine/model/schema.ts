import { ContentMatch, type MatchableType } from './content-expression'
import { Fragment } from './fragment'
import { Mark, type MarkSpec, MarkType, resolveAttrs } from './mark'
import { Node } from './node'

/** What a toDOM function may return: a tag name, or a tag with attrs/children. */
export type DOMOutputSpec = string | DOMOutputArray
type DOMOutputArray = [string, ...(Record<string, unknown> | DOMOutputSpec | 0)[]]

export interface ParseRule {
  tag?: string
  style?: string
  attrs?: Record<string, unknown>
  getAttrs?: (value: Element | string) => Record<string, unknown> | false | null
  priority?: number
  /** Drop the element and everything inside it. */
  ignore?: boolean
}

export interface NodeSpec {
  name: string
  content?: string
  group?: string
  inline?: boolean
  atom?: boolean
  /** Space-separated mark names allowed inside; `_` all, `''` none. */
  marks?: string
  attrs?: Record<string, { default?: unknown; required?: boolean }>
  toDOM?: (node: Node) => DOMOutputSpec
  parseDOM?: ParseRule[]
}

export class NodeType implements MatchableType {
  /** Filled in by the schema once every type exists. */
  contentMatch: ContentMatch = ContentMatch.empty
  markSet: MarkType[] | null = null

  constructor(
    readonly spec: NodeSpec,
    readonly schema: Schema,
  ) {}

  get name(): string {
    return this.spec.name
  }

  get groups(): string[] {
    return this.spec.group ? this.spec.group.split(/\s+/) : []
  }

  /** A type is fillable when it can be created without supplying attributes. */
  get fillable(): boolean {
    return !Object.values(this.spec.attrs ?? {}).some((attr) => attr.required)
  }

  get isText(): boolean {
    return this.name === 'text'
  }

  get isInline(): boolean {
    return this.isText || this.spec.inline === true
  }

  get isBlock(): boolean {
    return !this.isInline
  }

  get isLeaf(): boolean {
    return this.spec.content === undefined || this.spec.content === ''
  }

  get isTextblock(): boolean {
    return (
      this.isBlock && !this.isLeaf && this.contentMatch.allowed.some((t) => t.name === 'text')
    )
  }

  get isAtom(): boolean {
    return this.isLeaf || this.spec.atom === true
  }

  allowsMarkType(type: MarkType): boolean {
    if (this.markSet === null) return true
    return this.markSet.includes(type)
  }

  create(
    attrs?: Record<string, unknown> | null,
    content?: Fragment | Node | readonly Node[] | null,
    marks: readonly Mark[] = Mark.none,
  ): Node {
    if (this.isText) throw new Error('Matra: use schema.text() to make text nodes')
    return new Node(
      this,
      resolveAttrs(this.spec.attrs, attrs, this.name),
      Fragment.from(content),
      marks,
    )
  }

  /** True when `content` satisfies this type's content expression. */
  validContent(content: Fragment): boolean {
    const types: MatchableType[] = []
    for (const child of content) types.push(child.type)
    const match = this.contentMatch.matchTypes(types)
    return match?.validEnd === true
  }

  /**
   * Create a node, adding whatever nodes the content expression demands.
   *
   * Returns null when the gap cannot be filled — the caller then knows the
   * edit is impossible rather than getting a malformed document.
   */
  createAndFill(
    attrs?: Record<string, unknown> | null,
    content?: Fragment | Node | readonly Node[] | null,
  ): Node | null {
    const start = Fragment.from(content)
    const types: MatchableType[] = []
    for (const child of start) types.push(child.type)

    const match = this.contentMatch.matchTypes(types)
    if (!match) return null
    if (match.validEnd) return this.create(attrs, start)

    const fill = match.fillBefore()
    if (!fill) return null

    const added: Node[] = []
    for (const type of fill) {
      const node = (type as NodeType).createAndFill()
      if (!node) return null
      added.push(node)
    }
    return this.create(attrs, start.append(Fragment.from(added)))
  }
}

export interface SchemaSpec {
  nodes: NodeSpec[]
  marks?: Omit<MarkSpec, 'rank'>[]
  topNode?: string
}

export class Schema {
  readonly nodes: Record<string, NodeType> = {}
  readonly marks: Record<string, MarkType> = {}
  readonly topNodeType: NodeType

  constructor(spec: SchemaSpec) {
    for (const nodeSpec of spec.nodes) {
      if (this.nodes[nodeSpec.name]) {
        throw new Error(`Matra: duplicate node type "${nodeSpec.name}"`)
      }
      this.nodes[nodeSpec.name] = new NodeType(nodeSpec, this)
    }
    let rank = 0
    for (const markSpec of spec.marks ?? []) {
      if (this.marks[markSpec.name]) {
        throw new Error(`Matra: duplicate mark type "${markSpec.name}"`)
      }
      this.marks[markSpec.name] = new MarkType({ ...markSpec, rank: rank++ })
    }

    const top = spec.topNode ?? 'doc'
    const topType = this.nodes[top]
    if (!topType) throw new Error(`Matra: no "${top}" node — the document has no root`)
    if (!this.nodes.text) throw new Error('Matra: no "text" node')
    this.topNodeType = topType

    // Content expressions are compiled once every type exists, so a type can
    // refer to any other regardless of declaration order.
    for (const type of Object.values(this.nodes)) {
      type.contentMatch = ContentMatch.parse(type.spec.content ?? '', (name) =>
        this.resolveTypes(name),
      )
      type.markSet = this.resolveMarks(type.spec.marks)
    }
  }

  private resolveTypes(name: string): NodeType[] {
    const direct = this.nodes[name]
    if (direct) return [direct]
    const group = Object.values(this.nodes).filter((type) => type.groups.includes(name))
    if (!group.length) {
      throw new Error(`Matra: content expression names "${name}", which is not a node or group`)
    }
    return group
  }

  private resolveMarks(rule: string | undefined): MarkType[] | null {
    if (rule === undefined || rule === '_') return null
    if (rule === '') return []
    return rule.split(/\s+/).map((name) => {
      const mark = this.marks[name]
      if (!mark) throw new Error(`Matra: unknown mark "${name}" in a marks rule`)
      return mark
    })
  }

  node(
    type: string | NodeType,
    attrs?: Record<string, unknown> | null,
    content?: Fragment | Node | readonly Node[] | null,
    marks?: readonly Mark[],
  ): Node {
    const nodeType = typeof type === 'string' ? this.nodes[type] : type
    if (!nodeType) throw new Error(`Matra: unknown node type "${String(type)}"`)
    return nodeType.create(attrs, content, marks)
  }

  text(text: string, marks: readonly Mark[] = Mark.none): Node {
    const type = this.nodes.text
    if (!type) throw new Error('Matra: no "text" node')
    return new Node(type, {}, Fragment.empty, marks, text)
  }

  mark(name: string, attrs?: Record<string, unknown> | null): Mark {
    const type = this.marks[name]
    if (!type) throw new Error(`Matra: unknown mark "${name}"`)
    return type.create(attrs)
  }

  nodeFromJSON(json: unknown): Node {
    const value = json as {
      type?: string
      attrs?: Record<string, unknown>
      content?: unknown[]
      marks?: { type: string; attrs?: Record<string, unknown> }[]
      text?: string
    }
    if (!value || typeof value.type !== 'string') {
      throw new Error('Matra: node JSON needs a "type"')
    }
    const marks = value.marks?.map((mark) => this.mark(mark.type, mark.attrs)) ?? Mark.none
    if (value.type === 'text') {
      if (typeof value.text !== 'string') throw new Error('Matra: text node without text')
      return this.text(value.text, marks)
    }
    const content = value.content?.map((child) => this.nodeFromJSON(child)) ?? []
    return this.node(value.type, value.attrs, content, marks)
  }
}
