import type { Fragment } from './fragment'
import type { Mark } from './mark'
import type { Node } from './node'
import { isSafeAttrName, isSafeAttrValue } from './safe-attrs'
import type { DOMOutputSpec } from './schema'
import type { Schema } from './schema'

/**
 * Document → HTML, with no DOM.
 *
 * `DOMSerializer` builds elements and reads `innerHTML` back off them, which
 * needs a browser. Turning a stored document into HTML on a server is a
 * different job with the same answer: rendering a page for a crawler, an email,
 * or a PDF pipeline should not require a DOM polyfill any more than
 * `toMarkdown` does.
 *
 * This walks the same `toDOM` specs and passes attributes through the same gate
 * in `safe-attrs`, so the two serializers agree byte for byte. A test asserts
 * that rather than trusting it: two renderers that are allowed to drift are one
 * renderer and one security hole.
 */

/** Elements that never have children, and so never get a closing tag. */
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

const NEEDS_TEXT_ESCAPE = /[&<> ]/
const TEXT_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  ' ': '&nbsp;',
}
const NEEDS_ATTR_ESCAPE = /[&" ]/
const ATTR_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '"': '&quot;',
  ' ': '&nbsp;',
}

/**
 * What a browser writes when it serializes a text node.
 *
 * Quotes are left alone — they are only special inside an attribute — and a
 * non-breaking space becomes an entity rather than a byte that looks exactly
 * like a normal space in every editor and diff. Most text contains none of
 * these, and a text that needs no escaping is returned as it came rather than
 * being run through four replacements to prove it.
 */
function escapeText(text: string): string {
  if (!NEEDS_TEXT_ESCAPE.test(text)) return text
  return text.replace(/[&<> ]/g, (char) => TEXT_ESCAPES[char] as string)
}

/** Inside an attribute the quote matters and the angle brackets do not. */
function escapeAttr(value: string): string {
  if (!NEEDS_ATTR_ESCAPE.test(value)) return value
  return value.replace(/[&" ]/g, (char) => ATTR_ESCAPES[char] as string)
}

/** Markup around a content hole: `open` + content + `close`. */
interface Rendered {
  open: string
  close: string
  /** Did the spec declare where its content goes? */
  hole: boolean
}

export class HTMLSerializer {
  constructor(private readonly schema: Schema) {}

  static fromSchema(schema: Schema): HTMLSerializer {
    return new HTMLSerializer(schema)
  }

  serializeFragment(fragment: Fragment): string {
    let out = ''
    const children = fragment.content

    // Adjacent text sharing a mark stays inside one element, exactly as the DOM
    // serializer does it — otherwise the same document renders as
    // <strong>a</strong><strong>b</strong> here and <strong>ab</strong> there.
    const openMarks: Mark[] = []
    const closers: string[] = []

    for (let index = 0; index < children.length; index++) {
      const child = children[index] as Node
      const marks = child.marks
      if (openMarks.length !== 0 || marks.length !== 0) {
        let keep = 0
        while (
          keep < openMarks.length &&
          keep < marks.length &&
          (openMarks[keep] as Mark).eq(marks[keep] as Mark)
        ) {
          keep++
        }
        while (closers.length > keep) out += closers.pop() as string
        openMarks.length = keep

        for (let m = keep; m < marks.length; m++) {
          const mark = marks[m] as Mark
          const spec = mark.type.spec
          const rendered = spec.toDOM
            ? this.render(spec.toDOM(mark) as DOMOutputSpec)
            : { open: '<span>', close: '</span>', hole: false }
          out += rendered.open
          closers.push(rendered.close)
          openMarks.push(mark)
        }
      }

      out += this.serializeNode(child)
    }

    while (closers.length) out += closers.pop() as string
    return out
  }

  serializeNode(node: Node): string {
    if (node.isText) return escapeText(node.text ?? '')

    const spec = node.type.spec
    if (!spec.toDOM) {
      throw new Error(`Matra: node "${node.type.name}" has no toDOM, so it cannot be rendered`)
    }
    const out = spec.toDOM(node)
    // `['p', 0]` is what most blocks render as, once per block on the page.
    if (Array.isArray(out) && out.length === 2 && typeof out[0] === 'string' && out[1] === 0) {
      const tag = out[0]
      if (node.type.isLeaf) return `<${tag}>${closeTag(tag)}`
      return `<${tag}>${this.serializeFragment(node.content)}${closeTag(tag)}`
    }
    const { open, close, hole } = this.render(out)

    // A node without a declared hole renders empty, which is what the DOM
    // serializer does: it only descends when `toDOM` said where to descend to.
    if (!hole || node.type.isLeaf) return open + close
    return open + this.serializeFragment(node.content) + close
  }

  private render(spec: DOMOutputSpec): Rendered {
    if (typeof spec === 'string')
      return { open: `<${spec}>`, close: closeTag(spec), hole: false }

    // Indexed rather than destructured, for the same reason the renderer is:
    // `[tag, ...rest]` and `rest.slice()` are two arrays per element, and
    // there is one element per node in the document.
    const tag = spec[0] as string
    let hole = false
    let start = 1
    let open = ''
    // Children that come after the hole close around the content.
    let after = ''

    const first = spec[1]
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      open = `<${tag}${attributes(tag, first as Record<string, unknown>)}>`
      start = 2
    } else {
      open = `<${tag}>`
    }

    for (let i = start; i < spec.length; i++) {
      const child = spec[i]
      if (child === 0) {
        if (hole) throw new Error(`Matra: "${tag}" declares two content holes`)
        hole = true
        continue
      }
      if (typeof child === 'string') {
        // Text among the children, the way a mention writes its label.
        const text = escapeText(child)
        if (hole) after += text
        else open += text
        continue
      }
      const rendered = this.render(child as DOMOutputSpec)
      const piece = rendered.open + rendered.close
      if (rendered.hole) {
        // The hole is inside this child, so everything it closes with belongs
        // after the content rather than before it.
        if (hole) throw new Error(`Matra: "${tag}" declares two content holes`)
        hole = true
        open += rendered.open
        after = rendered.close + after
      } else if (hole) {
        after += piece
      } else {
        open += piece
      }
    }

    return { open, close: after + closeTag(tag), hole }
  }

  /** Convenience: a fragment as an HTML string. */
  serializeHTML(fragment: Fragment): string {
    return this.serializeFragment(fragment)
  }
}

function closeTag(tag: string): string {
  return VOID.has(tag.toLowerCase()) ? '' : `</${tag}>`
}

/**
 * The same refusals `setSafeAttribute` makes, written out rather than applied
 * to an element.
 *
 * Attributes are collected before any are emitted because one rule needs to see
 * the whole set: `target="_blank"` is only safe beside `rel="noopener"`, and a
 * document loaded from JSON is free to supply the target and blank the rel. A
 * Map keeps insertion order, so an existing `rel` is rewritten where it stands
 * and a missing one is appended — which is what `setAttribute` does too, and
 * therefore what the DOM serializer's output looks like.
 */
function attributes(tag: string, attrs: Record<string, unknown>): string {
  const upper = tag.toUpperCase()
  const kept = new Map<string, string>()

  for (const name in attrs) {
    const value = attrs[name]
    if (value === null || value === undefined || value === false) continue
    if (!isSafeAttrName(name)) continue
    const text = String(value)
    if (!isSafeAttrValue(name, text, upper)) continue
    kept.set(name, text)
  }

  if (kept.get('target') === '_blank') {
    const rel = new Set((kept.get('rel') ?? '').split(/\s+/).filter(Boolean))
    rel.add('noopener')
    rel.add('noreferrer')
    kept.set('rel', [...rel].join(' '))
  }

  let out = ''
  for (const [name, value] of kept) out += ` ${name}="${escapeAttr(value)}"`
  return out
}
