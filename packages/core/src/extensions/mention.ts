import type { Command, NodeDef } from '../types'

export interface MentionOptions {
  /** What appears in the document. Defaults to `@label`. */
  render?: (attrs: { id: string; label: string }) => string
  /** Node name, if you need two kinds of mention in one editor. */
  name?: string
}

/**
 * A mention, as a node rather than styled text.
 *
 * An atom: the caret steps over it, backspace removes the whole thing, and it
 * cannot be half-deleted into `@Nahi`. That is the entire argument for making
 * it a node — styled text looks identical until someone edits it, and then it
 * quietly stops being a reference to anybody.
 *
 * The id travels with it, so the document keeps a reference rather than a name
 * that was true when it was typed.
 */
export function mention(options: MentionOptions = {}): NodeDef<{
  insertMention: Command<[attrs: { id: string; label: string }]>
}> {
  const name = options.name ?? 'mention'
  const render = options.render ?? ((attrs) => `@${attrs.label}`)

  return {
    kind: 'node',
    name,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,
    attrs: {
      id: { required: true },
      label: { default: '' },
    },
    parseDOM: [
      {
        tag: `span[data-${name}-id]`,
        getAttrs: (dom) => {
          const element = dom as Element
          const id = element.getAttribute(`data-${name}-id`)
          if (!id) return false
          return {
            id,
            label: element.getAttribute(`data-${name}-label`) ?? element.textContent,
          }
        },
      },
    ],
    toDOM: (node) => {
      const id = String(node.attrs?.id ?? '')
      const label = String(node.attrs?.label ?? '')
      return [
        'span',
        {
          [`data-${name}-id`]: id,
          [`data-${name}-label`]: label,
          class: `matra-${name}`,
        },
        render({ id, label }),
      ]
    },
    commands: {
      insertMention: (ctx, attrs) => {
        if (!attrs || typeof attrs.id !== 'string' || !attrs.id) return false
        return ctx.insert({
          type: name,
          attrs: { id: attrs.id, label: attrs.label ?? '' },
        })
      },
    },
  }
}
