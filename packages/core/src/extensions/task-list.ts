import { liftListItem, sinkListItem, splitListItem } from '../engine/list-commands'
import { engine } from '../internal'
import type { Command, NodeDef, Pos } from '../types'

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
        // Wrapping in the list builds the item too — the schema says a list
        // holds items, and findWrapping fills in the levels between. The old
        // version tried to change the paragraph's *type* to taskItem, which a
        // node holding blocks can never be, so the rule was refused halfway
        // and `[] ` stayed on screen as two brackets and a space.
        if (!ctx.delete(range)) return false
        if (!ctx.wrapIn('taskList')) return false
        return checked ? ctx.setNodeAttrs('taskItem', { checked: true }) : true
      },
    },
  ],
}

const name = 'taskItem'

/** Enter, Tab and Shift-Tab, on whichever kind of item the caret is in. */
const runItem =
  (which: 'split' | 'lift' | 'sink'): Command =>
  (ctx) => {
    const { state, tr } = engine(ctx)
    const itemType = state.schema.nodes[name]
    if (!itemType) return false
    const apply =
      which === 'split' ? splitListItem : which === 'lift' ? liftListItem : sinkListItem
    return apply(state, tr, itemType)
  }

export const taskItem: NodeDef<{
  toggleTaskItem: Command<[at?: Pos]>
  splitTaskItem: Command
  liftTaskItem: Command
  sinkTaskItem: Command
}> = {
  kind: 'node',
  name,
  listItem: true,
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
        toggleTaskItem(at: number): boolean
      }
      // The view knows exactly which item it draws, so it says so. Moving the
      // caret onto the item first — which is what this did — meant ticking a
      // box halfway down a list dragged your cursor there with it.
      commands.toggleTaskItem(getPos())
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
    splitTaskItem: runItem('split'),
    liftTaskItem: runItem('lift'),
    sinkTaskItem: runItem('sink'),

    /**
     * Tick or untick, at the caret or at a position you already know.
     *
     * An attribute on the item, not a change of block type. The item holds
     * blocks, so `setBlockType` refused it outright and the box ticked itself
     * in the DOM while the document stayed exactly as it was.
     */
    toggleTaskItem: (ctx, at) => {
      if (at !== undefined) {
        const node = engine(ctx).tr.doc.resolve(at).nodeAfter
        if (!node || node.type.name !== name) return false
        return ctx.setNodeAttrs(name, { checked: node.attrs?.checked !== true }, at)
      }
      if (!ctx.inNode(name)) return false
      const checked = ctx.inNode(name, { checked: true })
      return ctx.setNodeAttrs(name, { checked: !checked })
    },
  },
  /**
   * The same keys a bullet list binds, bound again here.
   *
   * An editor may have checklists without bullet lists, and the bindings live
   * on the item extension · so a checklist on its own would otherwise have no
   * Enter, no Tab, and no way out. The commands resolve which kind of item the
   * caret is in, so having both is not a conflict.
   */
  keys: {
    'Mod-Enter': 'toggleTaskItem',
    Enter: 'splitTaskItem',
    Tab: 'sinkTaskItem',
    'Shift-Tab': 'liftTaskItem',
  },
}

/** Enough styling to make a checklist look like one. */
export const taskListCSS = `
.matra-task-list { list-style: none; padding-left: 0; }
.matra-task-item { display: flex; align-items: flex-start; gap: 0.5em; }
.matra-task-check { user-select: none; line-height: 1; padding-top: 0.2em; }
.matra-task-body { flex: 1 1 auto; }
.matra-task-item[data-checked="true"] .matra-task-body { opacity: 0.6; text-decoration: line-through; }
`
