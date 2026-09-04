import type { DocNode, ExtensionDef } from '../types'

export interface UniqueIdOptions {
  /** Which node types get an id. Defaults to the blocks in the box. */
  types?: string[]
  /** The attribute the id is written to. */
  attribute?: string
  /** Supply your own, when the ids have to match something outside the editor. */
  generate?: () => string
}

/** Every block type that ships, which is what "a stable id per block" means by default. */
const DEFAULT_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'table',
  'horizontalRule',
  'image',
  'callout',
  'details',
  'youtube',
]

/**
 * A stable id per block.
 *
 * What it is for: anchoring comments, presence, analytics and scroll positions
 * to a block that keeps its identity when the text around it changes. A
 * position cannot do that — it moves — and an index cannot either, because
 * inserting a paragraph renumbers everything after it.
 *
 * Ids are assigned by `assignIds`, which is deliberately a function rather than
 * something that runs on every transaction: an editor that rewrites attributes
 * behind your back makes every document dirty and every undo stack strange.
 * Call it when you load a document and when you save one.
 */
export function assignIds(doc: DocNode, options: UniqueIdOptions = {}): DocNode {
  const attribute = options.attribute ?? 'id'
  const generate = options.generate ?? defaultId
  const types = options.types ? new Set(options.types) : null
  const seen = new Set<string>()

  const visit = (node: DocNode): DocNode => {
    const content = node.content?.map(visit)
    const wanted = types ? types.has(node.type) : typeof node.text !== 'string'
    if (!wanted || node.type === 'doc') {
      return content ? { ...node, content } : node
    }

    const current = node.attrs?.[attribute]
    // Reuse what is already there, unless the document arrived with a
    // duplicate — two blocks with one id is worse than a block with none.
    const id =
      typeof current === 'string' && current && !seen.has(current) ? current : generate()
    seen.add(id)
    return {
      ...node,
      attrs: { ...node.attrs, [attribute]: id },
      ...(content ? { content } : {}),
    }
  }

  return visit(doc)
}

/**
 * Declare the attribute so the schema keeps it.
 *
 * Without this the id is dropped on the way in: undeclared attributes do not
 * survive, which is a security property rather than an oversight. The id is
 * written to the element as `data-<attribute>` and read back from there, so
 * it survives HTML as well as JSON.
 */
export function uniqueId(options: UniqueIdOptions = {}): ExtensionDef {
  const attribute = options.attribute ?? 'id'
  const dataAttribute = `data-${attribute}`
  return {
    kind: 'extension',
    name: 'uniqueId',
    attributes: [
      {
        types: options.types ?? DEFAULT_TYPES,
        attrs: {
          [attribute]: {
            default: null,
            render: (value) =>
              typeof value === 'string' && value ? { [dataAttribute]: value } : null,
            parse: (dom) => dom.getAttribute(dataAttribute),
          },
        },
      },
    ],
    // Kept so a host can read the options back off the extension.
    ...({ uniqueIdOptions: options } as Record<string, unknown>),
  }
}

let counter = 0

/**
 * An id that is unique in this document without needing a random source.
 *
 * `crypto.randomUUID` is used when it exists; the counter fallback keeps this
 * working in older runtimes and in tests, where a stable sequence is easier to
 * assert against than a UUID.
 */
function defaultId(): string {
  const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID
  if (typeof uuid === 'function') return uuid.call((globalThis as { crypto: Crypto }).crypto)
  counter += 1
  return `b${counter.toString(36)}`
}
