import type { Node } from '../engine/model'
import { engine } from '../internal'
import type { Command, DecorationSpec, ExtensionDef, Pos } from '../types'
import { type BlockCache, positionalText, scanBlocks, textblocksIn } from './block-scan'

export interface InvisibleCharactersOptions {
  /** Start with the markers showing. Default false. */
  visible?: boolean
}

export interface InvisibleCharactersState {
  visible: boolean
}

const NAME = 'invisibleCharacters'
const SET = 'invisibleCharacters:set'

const SPACE_CLASS = 'matra-invisible-space'
const PARAGRAPH_CLASS = 'matra-invisible-paragraph'
const BREAK_CLASS = 'matra-invisible-break'

/** One marker inside a block, at a position relative to the block's start. */
interface LocalMark {
  kind: 'space' | 'break' | 'paragraph'
  at: number
}

const NONE: DecorationSpec[] = []

/** A space, or the one that refuses to wrap: both are invisible, both get a dot. */
const isSpace = (char: string) => char === ' ' || char === '\u00A0'

/**
 * A glyph the caret cannot land in.
 *
 * The view marks every widget inert already; saying so here as well means the
 * element is right on its own, and `aria-hidden` keeps a screen reader from
 * announcing a pilcrow after every paragraph.
 */
function glyph(className: string, text: string): HTMLElement {
  const el = document.createElement('span')
  el.className = className
  el.textContent = text
  el.setAttribute('contenteditable', 'false')
  el.setAttribute('aria-hidden', 'true')
  return el
}

const renderParagraph = () => glyph(PARAGRAPH_CLASS, '¶')
const renderBreak = () => glyph(BREAK_CLASS, '↵')

/** Every marker inside one top-level block. */
function marksIn(block: Node): LocalMark[] {
  const out: LocalMark[] = []
  textblocksIn(block, (textblock, offset) => {
    const text = positionalText(textblock)
    for (let i = 0; i < text.length; i++) {
      if (isSpace(text[i] as string)) out.push({ kind: 'space', at: offset + i })
    }
    // A break is an inline leaf, which the positional text shows as a
    // placeholder like any other · only the node itself says it is a break.
    const children = textblock.content.content
    let at = offset
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as Node
      at += child.nodeSize
      if (child.type.name === 'hardBreak') out.push({ kind: 'break', at })
    }
    out.push({ kind: 'paragraph', at: offset + textblock.content.size })
  })
  return out
}

/**
 * Spaces, paragraph ends and line breaks, made visible.
 *
 * What a word processor shows under "formatting marks": a dot on every space,
 * a pilcrow closing every block, an arrow after every hard break. Decorations
 * rather than content, so the marks are never in the document — not in its
 * HTML, not in its JSON, not in what a collaborator receives.
 *
 * Markers are found per block and cached on the block node, the way search
 * hits are, so keeping them on while writing costs the paragraph being written
 * and not the document.
 *
 * ```ts
 * editor.commands.toggleInvisibleCharacters()
 * editor.extensionState<InvisibleCharactersState>('invisibleCharacters')?.visible
 * ```
 */
export function invisibleCharacters(options: InvisibleCharactersOptions = {}): ExtensionDef<
  {
    showInvisibleCharacters: Command
    hideInvisibleCharacters: Command
    toggleInvisibleCharacters: Command
  },
  InvisibleCharactersState
> {
  const initial: InvisibleCharactersState = { visible: options.visible === true }
  const cache: BlockCache<LocalMark[]> = new WeakMap()

  // A caret move is a transaction too, and the document it moved in is the
  // same object · the specs built for it last time are still right.
  let lastDoc: Node | null = null
  let lastSpecs: DecorationSpec[] = NONE

  const isVisible = (ctx: Parameters<Command>[0]): boolean =>
    (engine(ctx).pluginState(NAME) as InvisibleCharactersState | undefined)?.visible === true

  const set = (ctx: Parameters<Command>[0], visible: boolean): boolean => {
    if (isVisible(ctx) === visible) return false
    engine(ctx).tr.setMeta(SET, visible)
    return true
  }

  return {
    kind: 'extension',
    name: NAME,

    state: {
      init: () => initial,
      apply(ctx, previous) {
        const visible = engine(ctx).tr.getMeta(SET)
        if (typeof visible !== 'boolean' || visible === previous.visible) return previous
        return { visible }
      },
    },

    decorations(ctx) {
      if (!isVisible(ctx)) return NONE
      const doc = engine(ctx).state.doc
      if (doc === lastDoc) return lastSpecs
      const out: DecorationSpec[] = []
      scanBlocks(doc, cache, marksIn, (local, _block, pos) => {
        for (const mark of local) {
          const at = (pos + mark.at) as Pos
          if (mark.kind === 'space') {
            out.push({
              type: 'inline',
              from: at,
              to: (at + 1) as Pos,
              attrs: { class: SPACE_CLASS },
            })
          } else if (mark.kind === 'break') {
            out.push({ type: 'widget', pos: at, key: `br:${at}`, render: renderBreak })
          } else {
            out.push({ type: 'widget', pos: at, key: `p:${at}`, render: renderParagraph })
          }
        }
      })
      lastDoc = doc
      lastSpecs = out
      return out
    },

    commands: {
      showInvisibleCharacters: (ctx) => set(ctx, true),
      hideInvisibleCharacters: (ctx) => set(ctx, false),
      toggleInvisibleCharacters: (ctx) => set(ctx, !isVisible(ctx)),
    },
  }
}

/**
 * Enough styling to see the marks without reading them.
 *
 * The dot is a background rather than a character, so the space stays a
 * space: selecting, copying and measuring it all behave as if nothing were
 * drawn there.
 */
export const invisibleCharactersCSS = `
.matra-invisible-space { background: radial-gradient(circle, var(--matra-invisible, rgba(128, 128, 128, 0.55)) 1px, transparent 1.6px) center / 100% 100% no-repeat; }
.matra-invisible-paragraph, .matra-invisible-break { color: var(--matra-invisible, rgba(128, 128, 128, 0.55)); font-size: 0.85em; user-select: none; pointer-events: none; }
`
