import type { Node } from '../engine/model'
import { engine } from '../internal'
import type { Command, DecorationSpec, ExtensionDef, Pos } from '../types'
import { type BlockCache, scanBlocks, textblocksIn } from './block-scan'

export type TextDirection = 'ltr' | 'rtl'

export interface TextDirectionOptions {
  /** Which blocks carry a direction. Default paragraph and heading. */
  types?: readonly string[]
  /**
   * Render a block whose text reads right to left that way, with nothing
   * stored. Default true.
   */
  auto?: boolean
}

const isDirection = (value: unknown): value is TextDirection =>
  value === 'ltr' || value === 'rtl'

/**
 * Characters that read right to left: Hebrew, Arabic, Syriac, Thaana and
 * NKo, with their extensions and presentation forms.
 */
const RTL = /[\u0590-\u07FF\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u
const LETTER = /\p{L}/u

/** A block to draw right to left, relative to its top-level block's start. */
interface LocalBlock {
  from: number
  to: number
}

const NONE: DecorationSpec[] = []

/**
 * Does the first strong character of a block read right to left?
 *
 * The same question the browser's `dir="auto"` asks, answered here so the
 * answer can be a decoration: nothing stored, nothing serialised, and the
 * block still renders the way its text reads. Digits and punctuation have no
 * direction of their own and are stepped over; any other letter settles it.
 * The scan stops at the first letter, so a paragraph costs its first word.
 */
function startsRightToLeft(textblock: Node): boolean {
  const children = textblock.content.content
  for (let i = 0; i < children.length; i++) {
    const text = (children[i] as Node).text
    if (text === undefined) continue
    for (const character of text) {
      if (RTL.test(character)) return true
      if (LETTER.test(character)) return false
    }
  }
  return false
}

/**
 * Text direction as an attribute on existing blocks, detected when unset.
 *
 * A `dir` attribute on every type named, like `textAlign`: a paragraph that
 * knows nothing about direction still keeps, renders and parses it, and a
 * document with a Hebrew heading round-trips through HTML with `dir="rtl"`
 * on the heading. Set it with the commands when the reader knows better than
 * the text.
 *
 * Left unset, the block's own text decides. Each block whose first strong
 * character is right-to-left is drawn with `dir="rtl"` as a node decoration,
 * so an Arabic paragraph typed into an English document reads the right way
 * round without anybody choosing — and the JSON says nothing about it. The
 * answer is remembered per top-level block on the block node, and the whole
 * set is memoised on the document, so a caret move costs nothing.
 *
 * ```ts
 * editor.commands.setTextDirection('rtl')
 * editor.commands.unsetTextDirection()
 * ```
 */
export function textDirection(options: TextDirectionOptions = {}): ExtensionDef<{
  setTextDirection: Command<[TextDirection]>
  unsetTextDirection: Command
}> {
  const types = options.types ?? ['paragraph', 'heading']
  const auto = options.auto !== false

  const cache: BlockCache<LocalBlock[]> = new WeakMap()
  let lastDoc: Node | null = null
  let lastOut: DecorationSpec[] = NONE

  const apply = (ctx: Parameters<Command>[0], dir: TextDirection | null): boolean => {
    const { tr } = engine(ctx)
    const { from, to } = tr.selection

    const targets: Array<{ pos: number; name: string; attrs: Record<string, unknown> }> = []
    tr.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return undefined
      if (types.includes(node.type.name) && (node.attrs.dir ?? null) !== dir) {
        targets.push({ pos, name: node.type.name, attrs: node.attrs })
      }
      return false
    })
    if (!targets.length) return false

    for (const target of targets) {
      const wasSelection = { from: tr.selection.from, to: tr.selection.to }
      tr.selectAt(target.pos + 1)
      ctx.setBlockType(target.name, { ...target.attrs, dir })
      tr.selectAt(wasSelection.from, wasSelection.to)
    }
    return true
  }

  /** The blocks inside one top-level block that read right to left and do not say so. */
  const detect = (block: Node): LocalBlock[] => {
    const out: LocalBlock[] = []
    textblocksIn(block, (textblock, offset) => {
      if (!types.includes(textblock.type.name)) return
      if (isDirection(textblock.attrs.dir)) return
      if (!startsRightToLeft(textblock)) return
      // `offset` is where the block's text starts; the block itself starts one before.
      out.push({ from: offset - 1, to: offset - 1 + textblock.nodeSize })
    })
    return out
  }

  return {
    kind: 'extension',
    name: 'textDirection',
    attributes: [
      {
        types,
        attrs: {
          dir: {
            default: null,
            render: (value) => (isDirection(value) ? { dir: value } : null),
            parse: (dom) => {
              const value = dom.getAttribute('dir')
              return isDirection(value) ? value : null
            },
          },
        },
      },
    ],
    commands: {
      setTextDirection: (ctx, dir) => (isDirection(dir) ? apply(ctx, dir) : false),
      unsetTextDirection: (ctx) => apply(ctx, null),
    },
    decorations: auto
      ? (ctx) => {
          const { doc } = engine(ctx).state
          if (doc === lastDoc) return lastOut
          const out: DecorationSpec[] = []
          scanBlocks(doc, cache, detect, (found, _block, pos) => {
            for (const item of found) {
              out.push({
                type: 'node',
                from: (pos + item.from) as Pos,
                to: (pos + item.to) as Pos,
                attrs: { dir: 'rtl' },
              })
            }
          })
          lastDoc = doc
          lastOut = out.length ? out : NONE
          return lastOut
        }
      : undefined,
  }
}
