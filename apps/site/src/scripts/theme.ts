/**
 * Light by default, dark by choice, and the switch drawn as a wipe.
 *
 * The stored preference wins over the system one, and the absence of a stored
 * preference means light rather than whatever the machine is set to. Somebody
 * who picked a theme here meant it; having the operating system quietly
 * override that on the next visit reads as a bug.
 */
const KEY = 'matra-theme'

type Theme = 'light' | 'dark'

const PAPER = { light: '#f5f1e8', dark: '#111114' }

const read = (): Theme => (localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light')

const toggles = () => Array.from(document.querySelectorAll<HTMLElement>('[data-theme-toggle]'))

function write(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(KEY, theme)

  // The browser paints its own chrome from this, so leaving it on the old
  // value puts a light strip above a dark page on a phone.
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', PAPER[theme])

  const label = theme === 'dark' ? 'Use the light theme' : 'Use the dark theme'
  for (const button of toggles()) {
    button.setAttribute('aria-pressed', String(theme === 'dark'))
    button.setAttribute('aria-label', label)
  }
}

/**
 * Uncover the new theme from the top down.
 *
 * `startViewTransition` freezes the old page as an image and paints the new one
 * above it, so the whole document can be replaced in one animation with nothing
 * re-rendering mid-flight — no duplicated stylesheet, no second copy of the page
 * in the DOM, no library.
 *
 * What moves is the mask, not the page. Translating the new layer made it read
 * as a second screen arriving over the first, because the words underneath were
 * sliding past the words on top. Clipping it instead holds every line exactly
 * where it already is and only changes how much of the new one is visible, so
 * the page appears to change colour under a falling edge rather than be
 * replaced. Without the API the theme simply changes, which is the right
 * fallback rather than a lesser one.
 */
function toggle(): void {
  const next: Theme = read() === 'dark' ? 'light' : 'dark'

  const view = document as Document & {
    startViewTransition?: (fn: () => void) => { ready: Promise<void>; finished: Promise<void> }
  }
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (!view.startViewTransition || still) {
    write(next)
    return
  }

  // Only name the root while this is in flight: the same pseudo-elements drive
  // Astro's page transitions, and claiming them permanently would make every
  // navigation wipe as well.
  document.documentElement.dataset.themeChanging = ''

  const transition = view.startViewTransition(() => write(next))

  transition.ready.then(() => {
    document.documentElement.animate(
      // Bottom inset from all of it to none of it: the new theme is uncovered
      // in place, top edge first.
      { clipPath: ['inset(0 0 100% 0)', 'inset(0 0 0% 0)'] },
      {
        duration: 620,
        easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
        pseudoElement: '::view-transition-new(root)',
      },
    )
  })

  transition.finished.finally(() => {
    delete document.documentElement.dataset.themeChanging
  })
}

function wire(): void {
  write(read())
  for (const button of toggles()) {
    if (button.dataset.wired === 'true') continue
    button.dataset.wired = 'true'
    button.addEventListener('click', () => toggle())
  }
}

wire()
document.addEventListener('astro:page-load', wire)

// The router builds the next page from freshly-parsed markup, which carries the
// default theme. Stamping the incoming document before it is swapped in is what
// stops a dark page flashing light on every navigation.
document.addEventListener('astro:before-swap', (event) => {
  const incoming = (event as Event & { newDocument?: Document }).newDocument
  if (incoming) incoming.documentElement.dataset.theme = read()
})
