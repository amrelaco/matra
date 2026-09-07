/**
 * Buttons, bound to whatever the editor happens to have.
 *
 * One function for every strip of commands on the page — the bar above the
 * document, the bubble over the selection, the block menu on an empty line —
 * because they differ only in which rows they hold. A button is shown when
 * `editor.commands` has its command and hidden when it does not, which is the
 * whole reason the playground can rebuild the editor underneath them and stay
 * honest: unticking `bold` does not disable the bold button, it removes it.
 */
type AnyEditor = {
  commands: Record<string, ((...args: unknown[]) => boolean) | undefined>
  isActive: (name: string, attrs?: Record<string, unknown>) => boolean
}

export interface ToolHooks {
  /** Asked for an address when the link button has none. */
  link?: (editor: AnyEditor) => void
  /** Comments are a thread in the margin, not a mark you toggle. */
  comment?: (editor: AnyEditor) => void
}

const parse = (raw: string | undefined): unknown[] => {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value : [value]
  } catch {
    return []
  }
}

/**
 * Bind every button under `root`, once.
 *
 * `mousedown` rather than `click`: clicking moves focus out of the editor
 * first, and a command with no selection left to work on does nothing. The
 * bound flag is on the element, so a strip rebuilt by the router is bound
 * again and one that survived is not bound twice — two handlers on one button
 * means bold goes on and straight back off.
 */
export function bindTools(
  root: ParentNode,
  getEditor: () => AnyEditor | null,
  hooks: ToolHooks = {},
): void {
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('[data-cmd]'))) {
    if (button.dataset.bound === 'yes') continue
    button.dataset.bound = 'yes'
    button.addEventListener('mousedown', (event) => {
      event.preventDefault()
      const editor = getEditor()
      if (!editor) return
      const name = button.dataset.cmd ?? ''
      if (name === 'setLink' && hooks.link) return hooks.link(editor)
      if (name === 'addComment' && hooks.comment) return hooks.comment(editor)
      editor.commands[name]?.(...parse(button.dataset.args))
      paintTools(root, editor)
    })
  }
}

/**
 * Show the commands this editor can actually run, and hide the rest.
 *
 * Returns how many survived, because a strip with nothing in it should say so
 * rather than sit there as an empty rule.
 */
export function syncTools(root: ParentNode, editor: AnyEditor | null): number {
  let shown = 0
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('[data-cmd]'))) {
    const name = button.dataset.cmd ?? ''
    const available = typeof editor?.commands?.[name] === 'function'
    button.hidden = !available
    if (available) shown += 1
  }
  // A separator with no buttons left on either side is a line in mid-air.
  for (const group of Array.from(root.querySelectorAll<HTMLElement>('[data-tool-group]'))) {
    group.hidden = group.querySelector('[data-cmd]:not([hidden])') === null
  }
  paintTools(root, editor)
  return shown
}

/** Light a button when the thing it does is already true of the selection. */
export function paintTools(root: ParentNode, editor: AnyEditor | null): void {
  if (!editor) return
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('[data-cmd]'))) {
    if (button.hidden) continue
    const name = button.dataset.active ?? button.dataset.ext ?? ''
    if (!name) continue
    const attrs = button.dataset.activeAttrs
    try {
      button.setAttribute(
        'aria-pressed',
        String(editor.isActive(name, attrs ? JSON.parse(attrs) : undefined)),
      )
    } catch {
      // A node this schema does not have is not an error, it is a no.
      button.removeAttribute('aria-pressed')
    }
  }
}
