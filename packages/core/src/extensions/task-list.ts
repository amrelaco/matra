import type { Command, NodeDef } from '../types'

/**
 * A checklist.
 *
 * The checkbox is real DOM rather than a `::before`, because a checklist people
 * cannot tick with the mouse is a bulleted list with extra steps. It carries
 * `contenteditable="false"` so the caret never lands inside it.
 */
export const taskList: NodeDef<{ toggleTaskList: Command }> = {
  kind: 'node',
  name: 'taskList',
  content: 'taskItem+',
  group: 'block',
  // A task list is a <ul>, so the bullet-list rule matches it too. Higher
  // priority makes the more specific rule win.
  priority: 100,
  parseDOM: [{ tag: 'ul[data-type="taskList"]' }],
  toDOM: () => ['ul', { 'data-type': 'taskList', class: 'matra-task-list' }, 0],
  commands: {
    toggleTaskList: (ctx) => (ctx.inNode('taskList') ? ctx.lift() : ctx.wrapIn('taskList')),
  },
  keys: { 'Mod-Shift-7': 'toggleTaskList' },
  inputRules: [
    {
      // "[] " or "[x] " at the start of a block.
      match: /^\s*\[([ xX]?)\]\s$/,
      handler: (ctx, match, range) => {
        const checked = (match[1] ?? '').toLowerCase() === 'x'
        return (
          ctx.delete(range) &&
          ctx.wrapIn('taskList') &&
          ctx.setBlockType('taskItem', { checked })
        )
      },
    },
  ],
}

const name = 'taskItem'

export const taskItem: NodeDef<{ toggleTaskItem: Command }> = {
  kind: 'node',
  name,
  priority: 100,
  content: 'paragraph block*',
  attrs: { checked: { default: false } },
  parseDOM: [
    {
      tag: 'li[data-checked]',
      getAttrs: (dom) => ({
        checked: (dom as Element).getAttribute('data-checked') === 'true',
      }),
    },
  ],
  toDOM: (node) => {
    const checked = node.attrs?.checked === true
    return [
      'li',
      { 'data-checked': String(checked), class: 'matra-task-item' },
      [
        'label',
        { contenteditable: 'false', class: 'matra-task-check' },
        ['input', checked ? { type: 'checkbox', checked: 'checked' } : { type: 'checkbox' }],
      ],
      ['div', { class: 'matra-task-body' }, 0],
    ]
  },
  /**
   * A node view, so the checkbox does something.
   *
   * Rendered through toDOM the box was the browser's own: clicking it flipped
   * its appearance and left the document alone, so nothing that depends on the
   * attribute — the strike-through, the JSON you save — ever changed. The view
   * owns the click and writes the attribute, which is the only version of this
   * that is not a lie.
   */
  nodeView: ({ node, getPos, editor }) => {
    const checked = node.attrs?.checked === true

    const item = document.createElement('li')
    item.className = 'matra-task-item'
    item.setAttribute('data-checked', String(checked))

    const label = document.createElement('label')
    label.className = 'matra-task-check'
    label.contentEditable = 'false'

    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = checked
    box.addEventListener('mousedown', (event) => event.preventDefault())
    box.addEventListener('change', () => {
      // The generic Editor type does not know this extension's commands, which
      // is the price of the extension not knowing the editor's.
      const commands = editor.commands as unknown as {
        select(at: number): boolean
        toggleTaskItem(): boolean
      }
      // Put the selection inside the item first: the command reads where the
      // caret is, and a click on a checkbox does not move it.
      commands.select(getPos() + 1)
      commands.toggleTaskItem()
    })

    label.appendChild(box)
    const body = document.createElement('div')
    body.className = 'matra-task-body'

    item.append(label, body)

    return {
      dom: item,
      contentDOM: body,
      update: (next) => {
        if (next.type !== name) return false
        const now = next.attrs?.checked === true
        item.setAttribute('data-checked', String(now))
        box.checked = now
        return true
      },
      // The checkbox is ours; the editor should not treat a click on it as a
      // click into the document.
      stopEvent: (event) => event.target === box,
    }
  },

  commands: {
    toggleTaskItem: (ctx) => {
      if (!ctx.inNode('taskItem')) return false
      const checked = ctx.inNode('taskItem', { checked: true })
      return ctx.setBlockType('taskItem', { checked: !checked })
    },
  },
  keys: { 'Mod-Enter': 'toggleTaskItem' },
}

/** Enough styling to make a checklist look like one. */
export const taskListCSS = `
.matra-task-list { list-style: none; padding-left: 0; }
.matra-task-item { display: flex; align-items: flex-start; gap: 0.5em; }
.matra-task-check { user-select: none; line-height: 1; padding-top: 0.2em; }
.matra-task-body { flex: 1 1 auto; }
.matra-task-item[data-checked="true"] .matra-task-body { opacity: 0.6; text-decoration: line-through; }
`
