/**
 * One tooltip for the whole site, driven by `data-tip`.
 *
 * Two things rule out the usual `::after` trick here. Every strip this site
 * has scrolls — the toolbar sideways, the catalogue down — and a pseudo-element
 * inside a scrolling box is clipped by it, so the tooltip on the last button
 * would be cut in half. And `title` is the browser's own: a second and a half
 * of delay, no styling, and it never appears for a keyboard user at all.
 *
 * So: one element on `document.body`, moved to whatever is being pointed at.
 * Bound once, delegated, and it works for anything that grows a `data-tip`
 * later — which is the point, because the buttons on this site are built by
 * script as often as they are written in markup.
 *
 * `data-tip` is the label; keep `aria-label` for the accessibility tree. Do not
 * also set `title`, or the browser draws its own on top of this one.
 */
const DELAY = 260
const GAP = 8

let tip: HTMLElement | null = null
let showing: HTMLElement | null = null
let timer = 0

function element(): HTMLElement {
  if (tip?.isConnected) return tip
  tip = document.createElement('div')
  tip.className = 'mx-tip'
  tip.setAttribute('role', 'presentation')
  tip.hidden = true
  document.body.appendChild(tip)
  return tip
}

function place(target: HTMLElement, text: string): void {
  const node = element()
  node.textContent = text
  node.hidden = false

  const anchor = target.getBoundingClientRect()
  const box = node.getBoundingClientRect()
  const below = anchor.bottom + GAP

  /*
    Below by preference, above only when there is no room.

    Above reads better in the abstract and is wrong here: almost every control
    with a tooltip on this site lives in a bar at the top of its pane, so
    "above" put the tooltip over the header — the More button's tooltip landed
    across the interface switch. Below points away from the chrome.
  */
  const top = below + box.height < window.innerHeight ? below : anchor.top - box.height - GAP
  const left = anchor.left + anchor.width / 2 - box.width / 2

  node.style.top = `${Math.round(top + window.scrollY)}px`
  node.style.left = `${Math.round(
    Math.min(Math.max(GAP, left), window.innerWidth - box.width - GAP) + window.scrollX,
  )}px`
  node.dataset.below = top === below ? 'yes' : 'no'
}

function hide(): void {
  window.clearTimeout(timer)
  showing = null
  if (tip) tip.hidden = true
}

function show(target: HTMLElement, immediate = false): void {
  const text = target.dataset.tip
  if (!text || target === showing) return
  window.clearTimeout(timer)
  showing = target
  const run = () => {
    // Still the thing being pointed at when the delay ran out.
    if (showing === target && target.isConnected) place(target, text)
  }
  if (immediate) run()
  else timer = window.setTimeout(run, DELAY)
}

const tipTarget = (node: EventTarget | null): HTMLElement | null =>
  (node as HTMLElement | null)?.closest?.<HTMLElement>('[data-tip]') ?? null

document.addEventListener('pointerover', (event) => {
  const target = tipTarget(event.target)
  if (target) show(target)
  else if (showing) hide()
})
document.addEventListener('pointerdown', hide)
// A keyboard user gets it at once: they have already committed to the control.
document.addEventListener('focusin', (event) => {
  const target = tipTarget(event.target)
  if (target) show(target, true)
})
document.addEventListener('focusout', hide)
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hide()
})
window.addEventListener('scroll', hide, true)
// The router swaps the body out from under it.
document.addEventListener('astro:before-swap', hide)
