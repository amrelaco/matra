import { type MarkSpec, type NodeSpec, Schema } from './engine/model'
import type { AnyDef, AttrSpec, MarkDef, NodeDef, ParseRule } from './types'

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

function toAttrs(attrs?: Record<string, AttrSpec>) {
  if (!attrs) return undefined
  const out: Record<string, { default?: unknown; required?: boolean }> = {}
  for (const [name, spec] of Object.entries(attrs)) {
    out[name] = spec.required ? { required: true } : { default: spec.default ?? null }
  }
  return out
}

function toParseDOM(rules?: ParseRule[]) {
  if (!rules) return undefined
  return rules.map((rule) => ({
    tag: rule.tag,
    style: rule.style,
    attrs: rule.attrs,
    getAttrs: rule.getAttrs as never,
    priority: rule.priority,
  }))
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

  for (const def of sortByPriority(defs)) {
    if (isNode(def)) {
      if (seenNodes.has(def.name)) throw new Error(`Matra: duplicate node "${def.name}"`)
      seenNodes.add(def.name)
      nodes.push({
        name: def.name,
        content: def.content,
        group: def.group,
        inline: def.inline,
        atom: def.atom,
        attrs: toAttrs(def.attrs),
        parseDOM: toParseDOM(def.parseDOM),
        toDOM: def.toDOM ? (node) => def.toDOM?.(node.toJSON() as never) as never : undefined,
      })
    } else if (isMark(def)) {
      if (seenMarks.has(def.name)) throw new Error(`Matra: duplicate mark "${def.name}"`)
      seenMarks.add(def.name)
      marks.push({
        name: def.name,
        inclusive: def.inclusive,
        excludes: def.excludes,
        spanning: def.spanning,
        attrs: toAttrs(def.attrs),
        parseDOM: toParseDOM(def.parseDOM),
        toDOM: def.toDOM
          ? (mark) => def.toDOM?.({ type: mark.type.name, attrs: mark.attrs }) as never
          : undefined,
      })
    }
  }

  if (!seenNodes.has('doc'))
    throw new Error('Matra: no "doc" node. Add the document extension.')
  if (!seenNodes.has('text')) throw new Error('Matra: no "text" node. Add the text extension.')

  return new Schema({ nodes, marks })
}
