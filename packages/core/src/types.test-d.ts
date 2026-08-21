import type { NodeDef, MarkDef, Ctx, Editor, EditorOptions, CommandMap } from './types'

declare function defineNode<C extends CommandMap>(d: Omit<NodeDef<C>, 'kind'>): NodeDef<C>
declare function defineMark<C extends CommandMap>(d: Omit<MarkDef<C>, 'kind'>): MarkDef<C>
declare function createEditor<const T extends readonly (NodeDef<any> | MarkDef<any>)[]>(o: EditorOptions<T>): Editor<T>

const heading = defineNode({
  name: 'heading',
  content: 'inline*',
  group: 'block',
  commands: {
    setHeading: (ctx: Ctx, level: 1 | 2 | 3) => ctx.setBlockType('heading', { level }),
  },
})

const bold = defineMark({
  name: 'bold',
  commands: {
    toggleBold: (ctx: Ctx) => ctx.toggleMark('bold'),
  },
})

const editor = createEditor({ extensions: [heading, bold] })

// --- these must all typecheck ---
editor.commands.setHeading(2)
editor.commands.toggleBold()
editor.batch((c: typeof editor.commands) => { c.toggleBold(); c.setHeading(1) })

// --- these must all ERROR ---
// @ts-expect-error level 9 is not 1|2|3
editor.commands.setHeading(9)
// @ts-expect-error command does not exist
editor.commands.toggleItalic()
// @ts-expect-error missing required arg
editor.commands.setHeading()
