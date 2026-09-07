/**
 * Ten hues, as text colours and as block backgrounds.
 *
 * Notion's shape — a row you colour the words with and a row you colour the
 * block with — in this site's palette rather than Notion's, so a coloured
 * paragraph still looks like it belongs on paper. Each pair is one hue at two
 * weights: the text value carries on a light background, the background value
 * carries black text.
 *
 * Names travel, values do not. The extension stores whatever string it is
 * given, so a real application would send `red` and map it in CSS; this sends
 * the value, because the playground has to show the result without owning a
 * theme. Both are supported and the difference is worth seeing.
 */
export interface Swatch {
  readonly name: string
  /** For the words. */
  readonly text: string
  /** For the block behind them. */
  readonly back: string
}

export const SWATCHES: readonly Swatch[] = [
  { name: 'Default', text: 'inherit', back: 'transparent' },
  { name: 'Grey', text: '#6b6a66', back: '#efedea' },
  { name: 'Brown', text: '#8a6244', back: '#f2e9e1' },
  { name: 'Orange', text: '#b4611b', back: '#fbe8d6' },
  { name: 'Yellow', text: '#9a7b16', back: '#faf0cf' },
  { name: 'Green', text: '#40714f', back: '#e3eee4' },
  { name: 'Blue', text: '#2f5f86', back: '#e0ebf4' },
  { name: 'Purple', text: '#6c4b96', back: '#ece4f5' },
  { name: 'Pink', text: '#9e4173', back: '#f8e2ed' },
  { name: 'Red', text: '#a83a34', back: '#f9e2e0' },
]

/**
 * Fill a row with swatch buttons.
 *
 * `data-color` is the value the command will be given, which keeps the click
 * handler free of any table: it reads the attribute and passes it on. The
 * first swatch is the clear, and says so rather than carrying a colour.
 */
export function paintSwatches(host: HTMLElement, kind: 'text' | 'back'): void {
  host.replaceChildren()
  for (const swatch of SWATCHES) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'pg-swatch'
    button.dataset.kind = kind
    const value = swatch[kind]
    const clears = swatch.name === 'Default'
    if (!clears) button.dataset.color = value
    button.dataset.tip = clears
      ? `No ${kind === 'text' ? 'colour' : 'background'}`
      : swatch.name
    button.setAttribute(
      'aria-label',
      clears ? `Clear ${kind === 'text' ? 'colour' : 'background'}` : swatch.name,
    )
    // The chip shows what it does: the letter in the hue for text, the fill
    // itself for a background.
    if (kind === 'text') {
      button.textContent = 'A'
      button.style.color = clears ? 'var(--ink)' : value
    } else {
      button.style.backgroundColor = clears ? 'transparent' : value
      button.textContent = clears ? '/' : ''
    }
    host.appendChild(button)
  }
}
