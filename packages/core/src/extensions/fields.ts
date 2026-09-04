import type { Node } from '../engine/model'
import { engine } from '../internal'
import type { Command, DocNode, NodeDef } from '../types'

/** What a field may be filled with: text, or inline nodes. */
export type FieldValue = string | DocNode | DocNode[]

const NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/
const isName = (value: unknown): value is string =>
  typeof value === 'string' && NAME.test(value)
const isLabel = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && value.length <= 200)

const hasOwn = (values: object, key: string) =>
  Object.prototype.hasOwnProperty.call(values, key)

/**
 * A blank in a template.
 *
 * `{{name}}` in a letter is a promise that something will be put there, and
 * as text it is a promise the editor cannot keep: it can be half-deleted into
 * `{{nam}}`, spell-checked, bolded from the middle, and nothing will notice
 * until the letter goes out with braces in it. As an atom it is one thing —
 * the caret steps over it, backspace removes all of it — and filling it is a
 * command rather than a search and replace.
 *
 * `fillFields` fills the fields in the editor; `fillFieldsIn` does the same
 * to a document as JSON, with no editor and no DOM, which is where a mail
 * merge actually runs.
 */
export const field = {
  kind: 'node',
  name: 'field' as const,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  attrs: {
    name: { required: true },
    label: { default: null },
  },
  parseDOM: [
    {
      tag: 'span[data-field]',
      getAttrs: (dom) => {
        const element = dom as Element
        const name = element.getAttribute('data-field')
        if (!isName(name)) return false
        const label = element.getAttribute('data-field-label')
        return { name, label: isLabel(label) && label ? label : null }
      },
    },
  ],
  toDOM: (node) => {
    const name = String(node.attrs?.name ?? '')
    const label = node.attrs?.label
    const shown = typeof label === 'string' && label ? label : `{${name}}`
    return [
      'span',
      {
        'data-field': name,
        'data-field-label': typeof label === 'string' && label ? label : null,
        class: 'matra-field',
      },
      shown,
    ]
  },
  inputRules: [
    {
      match: /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]{0,63})\s*\}\}$/,
      handler: (ctx, match, range) =>
        ctx.replace(range, { type: 'field', attrs: { name: match[1], label: null } }),
    },
  ],
  commands: {
    insertField: (ctx, name, label = null) =>
      isName(name) && isLabel(label ?? null)
        ? ctx.insert({ type: 'field', attrs: { name, label: label ?? null } })
        : false,

    /** Replace every field named in `values` with its value. Unnamed fields stay. */
    fillFields: (ctx, values) => {
      if (!values || typeof values !== 'object') return false
      const { tr, schema } = engine(ctx)
      const found: Array<{ pos: number; node: Node }> = []
      tr.doc.descendants((node, pos) => {
        if (node.type.name === 'field' && hasOwn(values, String(node.attrs.name))) {
          found.push({ pos, node })
        }
        return undefined
      })
      let changed = false
      // From the end, so the positions still to be visited are untouched.
      for (let i = found.length - 1; i >= 0; i--) {
        const entry = found[i] as { pos: number; node: Node }
        const value = values[String(entry.node.attrs.name)] as FieldValue
        let replacement: Node[] | null
        if (typeof value === 'string') {
          replacement = value ? [schema.text(value, entry.node.marks)] : []
        } else {
          try {
            replacement = (Array.isArray(value) ? value : [value]).map((json) =>
              schema.nodeFromJSON(json),
            )
          } catch {
            replacement = null
          }
          if (replacement?.some((node) => !node.isInline)) replacement = null
        }
        if (replacement === null) continue
        const end = entry.pos + entry.node.nodeSize
        if (replacement.length) tr.replaceWith(entry.pos, end, replacement)
        else tr.delete(entry.pos, end)
        changed = true
      }
      return changed
    },
  },
} satisfies NodeDef<{
  insertField: Command<[name: string, label?: string | null]>
  fillFields: Command<[values: Record<string, FieldValue>]>
}>

/** Every field name in a document, in order of first appearance. */
export function fieldsIn(doc: DocNode): string[] {
  const seen = new Set<string>()
  const walk = (node: DocNode) => {
    if (node.type === 'field') {
      const name = node.attrs?.name
      if (typeof name === 'string') seen.add(name)
    }
    for (const child of node.content ?? []) walk(child)
  }
  walk(doc)
  return [...seen]
}

/** Adjacent text with the same marks reads as one node, as the editor would keep it. */
function mergeText(nodes: DocNode[]): DocNode[] {
  const out: DocNode[] = []
  for (const node of nodes) {
    const last = out[out.length - 1]
    if (
      last &&
      last.type === 'text' &&
      node.type === 'text' &&
      JSON.stringify(last.marks ?? []) === JSON.stringify(node.marks ?? [])
    ) {
      out[out.length - 1] = { ...last, text: `${last.text ?? ''}${node.text ?? ''}` }
    } else {
      out.push(node)
    }
  }
  return out
}

/**
 * Fill a document's fields without an editor.
 *
 * Pure: the input is not touched and untouched subtrees are returned as they
 * were. A field whose name is not in `values` stays a field, so a template
 * can be filled in stages.
 */
export function fillFieldsIn(doc: DocNode, values: Record<string, FieldValue>): DocNode {
  const fill = (node: DocNode): DocNode => {
    if (!node.content) return node
    const out: DocNode[] = []
    let touched = false
    for (const child of node.content) {
      const name = child.type === 'field' ? child.attrs?.name : undefined
      if (typeof name === 'string' && hasOwn(values, name)) {
        touched = true
        const value = values[name] as FieldValue
        if (typeof value === 'string') {
          if (value)
            out.push({
              type: 'text',
              text: value,
              ...(child.marks ? { marks: child.marks } : {}),
            })
        } else {
          for (const replacement of Array.isArray(value) ? value : [value])
            out.push(replacement)
        }
        continue
      }
      const filled = fill(child)
      if (filled !== child) touched = true
      out.push(filled)
    }
    if (!touched) return node
    const content = mergeText(out)
    return content.length ? { ...node, content } : { ...node, content: undefined }
  }
  return fill(doc)
}

export const fieldsCSS = `
.matra-field {
  display: inline-block;
  padding: 0 0.35em;
  border-radius: 0.3em;
  background: var(--matra-field-bg, rgba(99, 102, 241, 0.12));
  color: var(--matra-field-fg, #4338ca);
  font-size: 0.92em;
  line-height: 1.4;
  white-space: nowrap;
}
`
