import { engine } from '../internal'
import type { Command, DocNode, ExtensionDef, Pos } from '../types'
import { isSafeImageSrc } from './image'

export interface ImageResizeOptions {
  /** Narrowest an image may be dragged, in pixels. Default 32. */
  min?: number
  /** Widest. Default 4096. */
  max?: number
}

/**
 * A drag handle on every image, and a `width` attribute to remember it by.
 *
 * The attribute is added to the stock image node from outside, and the node
 * view replaces the image's rendering from outside too, so the image
 * extension knows nothing about resizing and an editor without this one
 * renders a plain `<img>`. Width is a whole number of pixels, written to the
 * `width` attribute so the HTML carries it and a browser honours it before
 * any CSS loads.
 */
export function imageResize(
  options: ImageResizeOptions = {},
): ExtensionDef<{ setImageWidth: Command<[width: number | null, at?: Pos]> }> {
  const min = Math.max(1, Math.round(options.min ?? 32))
  const max = Math.max(min, Math.round(options.max ?? 4096))
  const clamp = (value: number) => Math.min(max, Math.max(min, Math.round(value)))
  const isWidth = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

  const paint = (img: HTMLImageElement, node: DocNode) => {
    const attrs = node.attrs ?? {}
    if (isSafeImageSrc(attrs.src)) img.setAttribute('src', attrs.src)
    else img.removeAttribute('src')
    if (typeof attrs.alt === 'string') img.setAttribute('alt', attrs.alt)
    else img.removeAttribute('alt')
    if (typeof attrs.title === 'string') img.setAttribute('title', attrs.title)
    else img.removeAttribute('title')
    if (isWidth(attrs.width)) {
      img.setAttribute('width', String(attrs.width))
      img.style.width = `${attrs.width}px`
    } else {
      img.removeAttribute('width')
      img.style.width = ''
    }
  }

  return {
    kind: 'extension',
    name: 'imageResize',

    attributes: [
      {
        types: ['image'],
        attrs: {
          width: {
            default: null,
            render: (value) => (isWidth(value) ? { width: String(value) } : null),
            parse: (dom) => {
              const raw = dom.getAttribute('width') ?? (dom as HTMLElement).style?.width ?? ''
              const value = Number.parseInt(raw, 10)
              return isWidth(value) ? value : null
            },
          },
        },
      },
    ],

    nodeViews: {
      image: ({ node, getPos, editor }) => {
        const dom = document.createElement('span')
        dom.className = 'matra-image'
        dom.contentEditable = 'false'
        const img = document.createElement('img')
        img.draggable = false
        paint(img, node)
        const handle = document.createElement('span')
        handle.className = 'matra-image-handle'
        handle.setAttribute('aria-hidden', 'true')
        dom.append(img, handle)

        let dragging: { startX: number; startWidth: number; width: number } | null = null
        const commands = editor.commands as unknown as {
          setImageWidth(width: number | null, at?: Pos): boolean
        }

        const move = (event: PointerEvent | MouseEvent) => {
          if (!dragging) return
          dragging.width = clamp(dragging.startWidth + (event.clientX - dragging.startX))
          img.style.width = `${dragging.width}px`
        }
        const finish = () => {
          if (!dragging) return
          const { width } = dragging
          dragging = null
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', finish)
          commands.setImageWidth(width, getPos() as Pos)
        }
        handle.addEventListener('pointerdown', (event) => {
          event.preventDefault()
          dragging = {
            startX: event.clientX,
            startWidth: img.getBoundingClientRect().width || img.width || min,
            width: 0,
          }
          dragging.width = clamp(dragging.startWidth)
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', finish)
        })

        return {
          dom,
          update: (next) => {
            if (next.type !== 'image') return false
            paint(img, next)
            return true
          },
          destroy: () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', finish)
          },
          // The editor must not read a drag on the handle as a drag of the image.
          stopEvent: (event) => event.target === handle,
        }
      },
    },

    commands: {
      /** Set the width of the image at `at`, or the selected one. `null` clears it. */
      setImageWidth: (ctx, width, at) => {
        const { tr } = engine(ctx)
        const pos = at ?? tr.selection.from
        const node = tr.doc.resolve(pos).nodeAfter
        if (!node || node.type.name !== 'image') return false
        let value: number | null
        if (width === null) value = null
        else if (typeof width === 'number' && Number.isFinite(width)) value = clamp(width)
        else return false
        if (node.attrs.width === value) return false
        tr.setNodeAttrs(pos, { width: value })
        return true
      },
    },
  }
}

export const imageResizeCSS = `
.matra-image {
  position: relative;
  display: inline-block;
  max-width: 100%;
  line-height: 0;
}
.matra-image img {
  max-width: 100%;
  height: auto;
}
.matra-image-handle {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: var(--matra-handle, #4f46e5);
  border: 2px solid #fff;
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 120ms;
}
.matra-image:hover .matra-image-handle,
.matra-image:focus-within .matra-image-handle {
  opacity: 1;
}
`
