import { type MarkSpec, type NodeSpec, Schema } from 'prosemirror-model'
import type { AnyDef, AttrSpec, DocMark, DocNode, MarkDef, NodeDef, ParseRule } from './types'

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
  const out: Record<string, { default?: unknown }> = {}
  for (const [name, spec] of Object.entries(attrs)) {
    // A required attr has no default; ProseMirror then demands it at creation.
    out[name] = spec.required ? {} : { default: spec.default ?? null }
  }
  return out
}

function toParseDOM(rules?: ParseRule[]) {
  if (!rules) return undefined
  // ProseMirror discriminates tag rules from style rules; keep them separate.
  return rules.map((rule) =>
    rule.style !== undefined
      ? {
          style: rule.style,
          getAttrs: rule.getAttrs as never,
          priority: rule.priority,
        }
      : {
          tag: rule.tag ?? '*',
          attrs: rule.attrs,
          getAttrs: rule.getAttrs as never,
          priority: rule.priority,
        },
  ) as never
}

/**
 * Build a ProseMirror schema from Matra definitions.
 *
 * The `doc` and `text` nodes are required by the engine; a definition set that
 * omits them is a configuration error, not a runtime surprise.
 */
export function buildSchema(defs: readonly AnyDef[]): Schema {
  const nodes: Record<string, NodeSpec> = {}
  const marks: Record<string, MarkSpec> = {}

  for (const def of sortByPriority(defs)) {
    if (isNode(def)) {
      if (nodes[def.name]) throw new Error(`Matra: duplicate node "${def.name}"`)
      nodes[def.name] = {
        content: def.content,
        group: def.group,
        inline: def.inline,
        atom: def.atom,
        draggable: def.draggable,
        selectable: def.selectable,
        attrs: toAttrs(def.attrs),
        parseDOM: toParseDOM(def.parseDOM),
        toDOM: def.toDOM ? (node) => def.toDOM?.(pmNodeToDoc(node)) as never : undefined,
      }
    } else if (isMark(def)) {
      if (marks[def.name]) throw new Error(`Matra: duplicate mark "${def.name}"`)
      marks[def.name] = {
        inclusive: def.inclusive,
        excludes: def.excludes,
        spanning: def.spanning,
        attrs: toAttrs(def.attrs),
        parseDOM: toParseDOM(def.parseDOM),
        toDOM: def.toDOM
          ? (mark) => def.toDOM?.({ type: mark.type.name, attrs: mark.attrs }) as never
          : undefined,
      }
    }
  }

  if (!nodes.doc) throw new Error('Matra: no "doc" node. Add the document extension.')
  if (!nodes.text) throw new Error('Matra: no "text" node. Add the text extension.')

  return new Schema({ nodes, marks })
}

/** Minimal ProseMirror node → DocNode view, used only inside toDOM bridges. */
function pmNodeToDoc(node: {
  type: { name: string }
  attrs: Record<string, unknown>
  textContent: string
}): DocNode {
  return { type: node.type.name, attrs: node.attrs, text: node.textContent }
}

export type { DocMark, DocNode }
