import {
  type DOMOutputSpec,
  type Mark as EngineMark,
  type Node as EngineNode,
  type ParseRule as EngineParseRule,
  type MarkSpec,
  type NodeSpec,
  Schema,
} from './engine/model'
import type {
  AnyDef,
  AttrSpec,
  DocMark,
  DocNode,
  DomOutput,
  ExtensionDef,
  GlobalAttrSpec,
  MarkDef,
  NodeDef,
  ParseRule,
} from './types'

/** Definitions are sorted by priority (high first) before anything reads them. */
export function sortByPriority<T extends { priority?: number }>(defs: readonly T[]): T[] {
  return [...defs].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}

export function isNode(def: AnyDef): def is NodeDef {
  return def.kind === 'node'
}

export function isMark(def: AnyDef): def is MarkDef {
  return def.kind === 'mark'
}

type Global = [name: string, spec: GlobalAttrSpec]

function toAttrs(attrs: Record<string, AttrSpec> | undefined, globals: readonly Global[]) {
  if (!attrs && !globals.length) return undefined
  const out: Record<string, { default?: unknown; required?: boolean }> = {}
  for (const [name, spec] of Object.entries(attrs ?? {})) {
    out[name] = spec.required ? { required: true } : { default: spec.default ?? null }
  }
  for (const [name, spec] of globals) {
    if (!(name in out)) out[name] = { default: spec.default ?? null }
  }
  return out
}

/** `textAlign` → `data-text-align`, the attribute a global is written to by default. */
function dataName(name: string): string {
  return `data-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}

function readGlobals(dom: Element, globals: readonly Global[]): Record<string, unknown> | null {
  let out: Record<string, unknown> | null = null
  for (const [name, spec] of globals) {
    const value = spec.parse ? spec.parse(dom) : dom.getAttribute(dataName(name))
    if (value === null || value === undefined) continue
    if (!out) out = {}
    out[name] = value
  }
  return out
}

function toParseDOM(rules: ParseRule[] | undefined, globals: readonly Global[]) {
  if (!rules) return undefined
  return rules.map((rule): EngineParseRule => {
    const base = {
      tag: rule.tag,
      style: rule.style,
      attrs: rule.attrs,
      getAttrs: rule.getAttrs as EngineParseRule['getAttrs'],
      priority: rule.priority,
    }
    if (!globals.length) return base
    return {
      ...base,
      getAttrs: (dom) => {
        const own = rule.getAttrs ? rule.getAttrs(dom as never) : (rule.attrs ?? null)
        if (own === false || typeof dom === 'string') return own
        const extra = readGlobals(dom, globals)
        if (!extra) return own
        return own ? { ...own, ...extra } : extra
      },
    }
  })
}

/**
 * Put the rendered global attributes onto a `toDOM` result.
 *
 * Costs nothing on a node with no global set — the loop reads one attribute
 * per global and returns the spec untouched — which is every paragraph that is
 * not aligned, indented or otherwise decorated by another extension.
 */
function withGlobals(
  spec: DomOutput,
  attrs: Record<string, unknown>,
  globals: readonly Global[],
): DomOutput {
  let add: Record<string, unknown> | null = null
  for (const [name, global] of globals) {
    const value = attrs[name]
    if (value === null || value === undefined || value === false) continue
    const rendered: Record<string, unknown> | null = global.render
      ? global.render(value)
      : { [dataName(name)]: String(value) }
    if (!rendered) continue
    if (!add) add = {}
    for (const key in rendered) add[key] = rendered[key]
  }
  if (!add) return spec
  if (typeof spec === 'string') return [spec, add]

  const own = spec[1]
  if (own && typeof own === 'object' && !Array.isArray(own)) {
    const merged: Record<string, unknown> = { ...(own as Record<string, unknown>) }
    for (const [name, value] of Object.entries(add)) {
      const existing = merged[name]
      // Two sources of `style` or `class` compose rather than overwrite.
      if (name === 'style' && typeof existing === 'string' && existing) {
        merged.style = `${existing.replace(/;\s*$/, '')}; ${value}`
      } else if (name === 'class' && typeof existing === 'string' && existing) {
        merged.class = `${existing} ${value}`
      } else {
        merged[name] = value
      }
    }
    return [spec[0], merged, ...spec.slice(2)]
  }
  return [spec[0], add, ...spec.slice(1)]
}

/**
 * The node a `toDOM` sees.
 *
 * `toDOM` used to receive `node.toJSON()`: a full serialisation of the node
 * and everything inside it, built and thrown away for each element rendered,
 * so that a function returning `['p', 0]` could read an attribute. Rendering a
 * paragraph serialised its text; rendering the document serialised the
 * document, once per level. This carries the two fields every renderer reads
 * and builds the others only when asked for.
 */
class NodeView implements DocNode {
  readonly type: string
  readonly attrs: Record<string, unknown>
  readonly #node: EngineNode

  constructor(node: EngineNode) {
    this.type = node.type.name
    this.attrs = node.attrs
    this.#node = node
  }

  get content(): DocNode[] | undefined {
    return this.#node.content.toJSON() as DocNode[] | undefined
  }

  get marks(): DocMark[] | undefined {
    const marks = this.#node.marks
    return marks.length ? marks.map((mark) => mark.toJSON()) : undefined
  }

  get text(): string | undefined {
    return this.#node.text
  }

  toJSON(): DocNode {
    return this.#node.toJSON() as unknown as DocNode
  }
}

function nodeRenderer(def: NodeDef, globals: readonly Global[]): NodeSpec['toDOM'] {
  const toDOM = def.toDOM
  if (!toDOM) return undefined
  if (!globals.length) return (node) => toDOM(new NodeView(node)) as DOMOutputSpec
  return (node) => withGlobals(toDOM(new NodeView(node)), node.attrs, globals) as DOMOutputSpec
}

function markRenderer(def: MarkDef, globals: readonly Global[]): MarkSpec['toDOM'] {
  const toDOM = def.toDOM
  if (!toDOM) return undefined
  const view = (mark: EngineMark): DocMark => ({ type: mark.type.name, attrs: mark.attrs })
  if (!globals.length) return (mark) => toDOM(view(mark))
  return (mark) => withGlobals(toDOM(view(mark)), mark.attrs, globals)
}

/** Every global attribute declared by an extension, keyed by the type it lands on. */
function collectGlobals(defs: readonly AnyDef[]): Map<string, Global[]> {
  const out = new Map<string, Global[]>()
  for (const def of defs) {
    if (def.kind !== 'extension') continue
    for (const group of (def as ExtensionDef).attributes ?? []) {
      for (const type of group.types) {
        const list = out.get(type) ?? []
        for (const entry of Object.entries(group.attrs)) list.push(entry)
        out.set(type, list)
      }
    }
  }
  return out
}

const NONE: readonly Global[] = []

/**
 * The globals a type does not already declare for itself.
 *
 * A node that has its own `textAlign` attribute renders it in its own `toDOM`
 * and reads it in its own parse rules; adding the global's rendering on top
 * would write the style twice.
 */
function foreign(
  globals: readonly Global[] | undefined,
  own: Record<string, AttrSpec> | undefined,
): readonly Global[] {
  if (!globals) return NONE
  if (!own) return globals
  const kept = globals.filter(([name]) => !(name in own))
  return kept.length ? kept : NONE
}

/**
 * Build a schema from Matra definitions.
 *
 * `doc` and `text` are required by the engine; a definition set that omits them
 * is a configuration error, not a runtime surprise.
 */
export function buildSchema(defs: readonly AnyDef[]): Schema {
  const nodes: NodeSpec[] = []
  const marks: Omit<MarkSpec, 'rank'>[] = []
  const seenNodes = new Set<string>()
  const seenMarks = new Set<string>()
  const globals = collectGlobals(defs)

  for (const def of sortByPriority(defs)) {
    if (isNode(def)) {
      if (seenNodes.has(def.name)) throw new Error(`Matra: duplicate node "${def.name}"`)
      seenNodes.add(def.name)
      const extra = foreign(globals.get(def.name), def.attrs)
      nodes.push({
        name: def.name,
        content: def.content,
        group: def.group,
        inline: def.inline,
        atom: def.atom,
        listItem: def.listItem,
        marks: def.marks,
        code: def.code,
        attrs: toAttrs(def.attrs, extra),
        parseDOM: toParseDOM(def.parseDOM, extra),
        toDOM: nodeRenderer(def, extra),
      })
    } else if (isMark(def)) {
      if (seenMarks.has(def.name)) throw new Error(`Matra: duplicate mark "${def.name}"`)
      seenMarks.add(def.name)
      const extra = foreign(globals.get(def.name), def.attrs)
      marks.push({
        name: def.name,
        inclusive: def.inclusive,
        excludes: def.excludes,
        spanning: def.spanning,
        attrs: toAttrs(def.attrs, extra),
        parseDOM: toParseDOM(def.parseDOM, extra),
        toDOM: markRenderer(def, extra),
      })
    }
  }

  if (!seenNodes.has('doc'))
    throw new Error('Matra: no "doc" node. Add the document extension.')
  if (!seenNodes.has('text')) throw new Error('Matra: no "text" node. Add the text extension.')

  return new Schema({ nodes, marks })
}
