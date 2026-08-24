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

export const taskItem: NodeDef<{ toggleTaskItem: Command }> = {
  kind: 'node',
  name: 'taskItem',
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
