import type { Mark } from '../engine/model'
import { engine } from '../internal'
import type { Command, MarkDef } from '../types'

export type TextStyleAttrs = {
  color?: string | null
  backgroundColor?: string | null
  fontFamily?: string | null
  fontSize?: string | null
}

/**
 * Values that can only be a colour, a font list or a length.
 *
 * A style attribute is an injection surface — `url(javascript:…)` and
 * `expression()` have both lived in one — so every value is checked against
 * the shape of what it claims to be before it reaches the DOM, whether it
 * arrived from a command, from pasted HTML or from stored JSON.
 */
const SAFE_COLOR =
  /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\)|[a-z]{3,30})$/i
const SAFE_FAMILY = /^[\p{L}\p{N}\s,'"_-]{1,120}$/u
const SAFE_SIZE = /^\d{1,3}(\.\d{1,2})?(px|em|rem|pt|%)$/

const STYLE: Array<[key: keyof TextStyleAttrs, property: string, safe: RegExp]> = [
  ['color', 'color', SAFE_COLOR],
  ['backgroundColor', 'background-color', SAFE_COLOR],
  ['fontFamily', 'font-family', SAFE_FAMILY],
  ['fontSize', 'font-size', SAFE_SIZE],
]

const clean = (attrs: TextStyleAttrs): TextStyleAttrs => {
  const out: TextStyleAttrs = {}
  for (const [key, , safe] of STYLE) {
    const value = attrs[key]
    out[key] = typeof value === 'string' && safe.test(value.trim()) ? value.trim() : null
  }
  return out
}

const hasStyle = (attrs: TextStyleAttrs): boolean => STYLE.some(([key]) => attrs[key])

/**
 * Colour, background, font family and font size, as one mark.
 *
 * Tiptap ships these as four extensions layered on a `textStyle` mark; here
 * they are one mark with four attributes, so a coloured, resized word is one
 * `<span>` rather than a nest of them. Setting one attribute keeps the others:
 * `setColor('red')` on text already in a different font leaves the font alone.
 */
export const textStyle = {
  kind: 'mark',
  name: 'textStyle' as const,
  attrs: {
    color: { default: null },
    backgroundColor: { default: null },
    fontFamily: { default: null },
    fontSize: { default: null },
  },
  parseDOM: [
    {
      tag: 'span',
      getAttrs: (dom) => {
        const style = (dom as HTMLElement).style
        if (!style) return false
        const attrs = clean({
          color: style.color,
          backgroundColor: style.backgroundColor,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
        })
        // A plain span carries nothing and stays transparent.
        return hasStyle(attrs) ? attrs : false
      },
    },
  ],
  toDOM: (mark) => {
    const attrs = clean((mark.attrs ?? {}) as TextStyleAttrs)
    let style = ''
    for (const [key, property] of STYLE) {
      if (attrs[key]) style += `${style ? '; ' : ''}${property}: ${attrs[key]}`
    }
    return style ? ['span', { style }, 0] : ['span', 0]
  },
  commands: {
    setColor: (ctx, color) => style(ctx, { color }),
    unsetColor: (ctx) => style(ctx, { color: null }),
    setBackgroundColor: (ctx, color) => style(ctx, { backgroundColor: color }),
    unsetBackgroundColor: (ctx) => style(ctx, { backgroundColor: null }),
    setFontFamily: (ctx, family) => style(ctx, { fontFamily: family }),
    unsetFontFamily: (ctx) => style(ctx, { fontFamily: null }),
    setFontSize: (ctx, size) => style(ctx, { fontSize: size }),
    unsetFontSize: (ctx) => style(ctx, { fontSize: null }),
    unsetTextStyle: (ctx) => ctx.removeMark('textStyle'),
  },
} satisfies MarkDef<{
  setColor: Command<[color: string]>
  unsetColor: Command
  setBackgroundColor: Command<[color: string]>
  unsetBackgroundColor: Command
  setFontFamily: Command<[family: string]>
  unsetFontFamily: Command
  setFontSize: Command<[size: string]>
  unsetFontSize: Command
  unsetTextStyle: Command
}>

/**
 * Merge a change into whatever style each piece of the selection already has.
 *
 * Marks with different attributes are different marks, and adding one
 * replaces the other · so the existing attributes are read off each text node
 * in the range and the change laid over them, one run at a time.
 */
function style(ctx: Parameters<Command>[0], patch: TextStyleAttrs): boolean {
  const { tr, schema } = engine(ctx)
  const type = schema.marks.textStyle
  if (!type) return false
  const cleaned = clean(patch)
  // A value that failed validation is refused, not silently dropped.
  for (const [key] of STYLE) {
    if (key in patch && patch[key] !== null && patch[key] !== undefined && !cleaned[key])
      return false
  }
  const apply = (existing: Mark | undefined): TextStyleAttrs => {
    const merged: TextStyleAttrs = { ...(existing?.attrs as TextStyleAttrs | undefined) }
    for (const [key] of STYLE) if (key in patch) merged[key] = cleaned[key]
    return clean(merged)
  }

  const { from, to, empty } = tr.selection
  if (empty) {
    const stored = tr.storedMarks ?? tr.selection.$head.marks()
    const existing = stored.find((mark) => mark.type === type)
    const merged = apply(existing)
    if (existing) tr.removeStoredMark(existing)
    if (hasStyle(merged)) tr.addStoredMark(type.create(merged))
    return true
  }

  // Each run of text with its own current style gets its own merged mark.
  const runs: Array<{ from: number; to: number; existing: Mark | undefined }> = []
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return undefined
    runs.push({
      from: Math.max(from, pos),
      to: Math.min(to, pos + node.nodeSize),
      existing: node.marks.find((mark) => mark.type === type),
    })
    return undefined
  })
  if (!runs.length) return false
  for (const run of runs) {
    const merged = apply(run.existing)
    if (run.existing) tr.removeMark(run.from, run.to, run.existing)
    if (hasStyle(merged)) tr.addMark(run.from, run.to, type.create(merged))
  }
  return true
}
