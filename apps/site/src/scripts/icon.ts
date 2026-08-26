/**
 * A hugeicon as an SVG element.
 *
 * The same conversion `Icon.astro` does at build time, for the places that
 * build their DOM at runtime. Importing an icon by name pulls in that icon's
 * path data and nothing else, so the menu below costs a dozen small arrays
 * rather than a sprite sheet.
 */
export type IconData = [string, Record<string, string>][]

const SVG = 'http://www.w3.org/2000/svg'
const toAttribute = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

export function icon(data: IconData, size = 16): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')

  for (const [tag, attrs] of data) {
    const node = document.createElementNS(SVG, tag)
    for (const [key, value] of Object.entries(attrs)) {
      // `key` is React's list bookkeeping, not an attribute.
      if (key === 'key') continue
      node.setAttribute(toAttribute(key), value)
    }
    svg.appendChild(node)
  }
  return svg
}
