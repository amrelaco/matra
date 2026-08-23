/**
 * Key binding matching — ours, not ProseMirror's.
 *
 * Bindings are written the way every editor writes them: `Mod-b`, `Shift-Enter`,
 * `Mod-Alt-1`. `Mod` is Cmd on Apple platforms and Ctrl everywhere else.
 */

const IS_APPLE =
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform)

/** Normalised description of one physical key press. */
export interface KeyStroke {
  key: string
  shift: boolean
  alt: boolean
  ctrl: boolean
  meta: boolean
}

const ALIASES: Record<string, string> = {
  esc: 'Escape',
  return: 'Enter',
  del: 'Delete',
  space: ' ',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
}

function normaliseKey(key: string): string {
  const alias = ALIASES[key.toLowerCase()]
  if (alias) return alias
  // Single characters compare case-insensitively; `Mod-B` and `Mod-b` are one binding.
  return key.length === 1 ? key.toLowerCase() : key
}

/** Parse `Mod-Shift-x` into the stroke it matches. */
export function parseBinding(binding: string): KeyStroke {
  const parts = binding.split('-')
  const key = parts.pop() ?? ''
  const stroke: KeyStroke = {
    key: normaliseKey(key),
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
  }
  for (const part of parts) {
    switch (part.toLowerCase()) {
      case 'mod':
        if (IS_APPLE) stroke.meta = true
        else stroke.ctrl = true
        break
      case 'cmd':
      case 'meta':
        stroke.meta = true
        break
      case 'ctrl':
      case 'control':
        stroke.ctrl = true
        break
      case 'alt':
      case 'option':
        stroke.alt = true
        break
      case 'shift':
        stroke.shift = true
        break
      default:
        throw new Error(`Matra: unknown key modifier "${part}" in "${binding}"`)
    }
  }
  return stroke
}

export function strokeFromEvent(event: KeyboardEvent): KeyStroke {
  return {
    key: normaliseKey(event.key),
    shift: event.shiftKey,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
  }
}

export function strokesMatch(a: KeyStroke, b: KeyStroke): boolean {
  // Shift is implied by the character on most layouts, so it is only compared
  // for named keys like Enter or Tab.
  const compareShift = a.key.length > 1
  return (
    a.key === b.key &&
    a.alt === b.alt &&
    a.ctrl === b.ctrl &&
    a.meta === b.meta &&
    (!compareShift || a.shift === b.shift)
  )
}

/** A resolved keymap: strokes paired with the handler they fire. */
export class Keymap {
  private readonly entries: Array<{ stroke: KeyStroke; run: () => boolean }> = []

  add(binding: string, run: () => boolean): void {
    this.entries.push({ stroke: parseBinding(binding), run })
  }

  /** Returns true when a binding claimed the event. */
  handle(event: KeyboardEvent): boolean {
    const stroke = strokeFromEvent(event)
    for (const entry of this.entries) {
      if (strokesMatch(entry.stroke, stroke) && entry.run()) return true
    }
    return false
  }
}
