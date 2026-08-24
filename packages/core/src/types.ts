/**
 * matra — public API surface.
 *
 * Design rule: no ProseMirror type appears in this file. The engine is an
 * implementation detail reachable only through `editor.unsafe`.
 */

// ---------------------------------------------------------------------------
// Document — plain JSON. Serializable, inspectable, framework-free.
// ---------------------------------------------------------------------------

export interface DocNode {
  type: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
  marks?: DocMark[]
  text?: string
}

export interface DocMark {
  type: string
  attrs?: Record<string, unknown>
}

/** A position in the document. Opaque on purpose — arithmetic on it is a bug. */
export type Pos = number & { readonly __brand: unique symbol }

export interface Range {
  from: Pos
  to: Pos
}

export interface Selection extends Range {
  readonly empty: boolean
  readonly anchor: Pos
  readonly head: Pos
}

// ---------------------------------------------------------------------------
// Command context — the only thing a command may touch.
// ---------------------------------------------------------------------------

export interface Ctx {
  readonly doc: DocNode
  readonly selection: Selection

  /** True if the mark is active across the whole selection. */
  hasMark(name: string, attrs?: Record<string, unknown>): boolean
  /** True if the selection sits inside a node of this type. */
  inNode(name: string, attrs?: Record<string, unknown>): boolean

  addMark(name: string, attrs?: Record<string, unknown>, range?: Range): boolean
  /**
   * Remove a mark across a range.
   *
   * With no `attrs`, every mark of that type in the range goes. Pass `attrs` to
   * remove only matching ones — which is how overlapping comment threads are
   * removed one at a time.
   */
  removeMark(name: string, range?: Range, attrs?: Record<string, unknown>): boolean
  toggleMark(name: string, attrs?: Record<string, unknown>): boolean

  setBlockType(name: string, attrs?: Record<string, unknown>): boolean
  wrapIn(name: string, attrs?: Record<string, unknown>): boolean
  lift(): boolean

  insert(content: DocNode | DocNode[] | string, at?: Pos): boolean
  replace(range: Range, content: DocNode | DocNode[] | string): boolean
  delete(range?: Range): boolean

  select(range: Range | Pos): boolean
  /** Move a whole block to another position, as a drag does. */
  moveBlock(from: Pos, to: Pos): boolean
  focus(): boolean

  /**
   * Map a position through every change applied since `mark()` was taken.
   * This is what makes async work (AI streaming) safe against concurrent edits.
   */
  mark(): PosMarker
}

export interface PosMarker {
  /** Re-resolve a position against the current document. */
  map(pos: Pos): Pos
  mapRange(range: Range): Range
}

/** A command is a plain function. No `this`, no currying, no nesting. */
export type Command<A extends unknown[] = []> = (ctx: Ctx, ...args: A) => boolean

/**
 * Any command, regardless of arity. Used for constraints only.
 * biome-ignore lint/suspicious/noExplicitAny: variance here needs `any`;
 * `unknown[]` would reject commands that take concrete argument types.
 */
export type AnyCommand = (ctx: Ctx, ...args: any[]) => boolean

export type CommandMap = Record<string, AnyCommand>

// ---------------------------------------------------------------------------
// Definitions — three primitives, all plain objects.
// ---------------------------------------------------------------------------

/** What a node view hands back to the editor. */
export interface NodeViewSpec {
  dom: HTMLElement
  /** Where child content renders. Omit for an atom that owns its inside. */
  contentDOM?: HTMLElement | null
  /** Return false when the view cannot represent the new node; it is rebuilt. */
  update?(node: DocNode): boolean
  destroy?(): void
  /** Return true to keep the editor's hands off an event inside your UI. */
  stopEvent?(event: Event): boolean
}

export interface NodeViewProps {
  node: DocNode
  /** Where this node starts, read at call time rather than cached. */
  getPos(): number
}

export type NodeViewFactory = (props: NodeViewProps) => NodeViewSpec

export interface NodeDef<C extends CommandMap = CommandMap> {
  kind: 'node'
  name: string
  /** ProseMirror content expression, e.g. 'inline*' or 'block+'. */
  content?: string
  group?: string
  inline?: boolean
  atom?: boolean
  draggable?: boolean
  selectable?: boolean
  attrs?: Record<string, AttrSpec>
  parseDOM?: ParseRule[]
  toDOM?: (node: DocNode) => DomOutput
  /**
   * Render this node with your own DOM.
   *
   * Use it when a node needs behaviour the document cannot express — a table
   * with resize handles, an embed, an image with its own controls.
   */
  nodeView?: NodeViewFactory
  commands?: C
  keys?: Record<string, keyof C | Command<never[]>>
  inputRules?: InputRule[]
  priority?: number
}

export interface MarkDef<C extends CommandMap = CommandMap> {
  kind: 'mark'
  name: string
  inclusive?: boolean
  excludes?: string
  spanning?: boolean
  attrs?: Record<string, AttrSpec>
  parseDOM?: ParseRule[]
  toDOM?: (mark: DocMark) => DomOutput
  commands?: C
  keys?: Record<string, keyof C | Command<never[]>>
  inputRules?: InputRule[]
  priority?: number
}

export interface ExtensionDef<C extends CommandMap = CommandMap, S = unknown> {
  kind: 'extension'
  name: string
  commands?: C
  keys?: Record<string, keyof C | Command<never[]>>
  inputRules?: InputRule[]
  /**
   * Decorations to draw over the document.
   *
   * Recomputed whenever the document or selection changes. Return the same
   * array when nothing changed and the editor will skip the redraw.
   */
  decorations?(ctx: Ctx): DecorationSpec[]

  /** Per-extension state, reduced on every change. */
  state?: {
    init(ctx: Ctx): S
    apply(ctx: Ctx, prev: S): S
  }
  /** Lifecycle. All receive the editor explicitly — nothing is bound to `this`. */
  onCreate?(editor: Editor): void
  onChange?(editor: Editor): void
  onDestroy?(editor: Editor): void
  priority?: number
}

/** A decoration, described in plain data. */
export type DecorationSpec =
  | { type: 'inline'; from: Pos; to: Pos; attrs: Record<string, string> }
  | { type: 'node'; from: Pos; to: Pos; attrs: Record<string, string> }
  | { type: 'widget'; pos: Pos; render(): HTMLElement; side?: number; key?: string }

export type AnyDef = NodeDef | MarkDef | ExtensionDef

export interface AttrSpec {
  default?: unknown
  required?: boolean
  parse?: (dom: Element) => unknown
  serialize?: (value: unknown) => string | null
}

export interface ParseRule {
  tag?: string
  style?: string
  attrs?: Record<string, unknown>
  getAttrs?: (dom: Element | string) => Record<string, unknown> | false | null
  priority?: number
}

export type DomOutput = string | [string, ...unknown[]]

export interface InputRule {
  match: RegExp
  handler: (ctx: Ctx, match: RegExpMatchArray, range: Range) => boolean
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

/** Collects the command maps of every definition into one typed surface. */
export type CommandsOf<T extends readonly AnyDef[]> = UnionToIntersection<
  DefCommands<T[number]>
> extends infer R
  ? [R] extends [never]
    ? EmptyCommands
    : unknown extends R
      ? EmptyCommands
      : R
  : never

type EmptyCommands = Record<never, never>

/** `commands` is optional on every def, so the pattern must be optional too. */
type DefCommands<D> = D extends { commands?: infer C }
  ? [NonNullable<C>] extends [CommandMap]
    ? BindCommands<NonNullable<C>>
    : never
  : never

/** Strip the injected `ctx` param; keep the caller-facing arguments. */
type BindCommands<C> = {
  [K in keyof C]: C[K] extends (ctx: Ctx, ...args: infer A) => boolean
    ? (...args: A) => boolean
    : never
}

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never

export interface EditorOptions<T extends readonly AnyDef[]> {
  extensions: T
  content?: DocNode | string
  editable?: boolean
  autofocus?: boolean | 'start' | 'end'
}

/** Commands the engine always provides, whatever definitions you pass. */
export interface CoreCommands {
  select(target: Range | Pos): boolean
  insert(content: DocNode | DocNode[] | string, at?: Pos): boolean
  replace(range: Range, content: DocNode | DocNode[] | string): boolean
  remove(range?: Range): boolean
  moveBlock(from: Pos, to: Pos): boolean
  focus(): boolean
}

export interface Editor<T extends readonly AnyDef[] = readonly AnyDef[]> {
  readonly commands: CommandsOf<T> & CoreCommands

  /** Run several commands as one undo step. Rolls back entirely if any returns false. */
  batch(run: (c: CommandsOf<T> & CoreCommands) => void): boolean

  getJSON(): DocNode
  getHTML(): string
  getText(): string
  setContent(content: DocNode | string): void

  readonly selection: Selection
  readonly editable: boolean
  setEditable(value: boolean): void

  on(
    event: 'change' | 'focus' | 'blur' | 'selectionChange',
    fn: (editor: Editor<T>) => void,
  ): () => void

  /**
   * The state an extension is keeping, by extension name.
   *
   * Extensions that declare `state` have it reduced on every transaction;
   * this is how a toolbar reads a character count or a collaboration version
   * without the extension having to publish a global.
   */
  extensionState<S = unknown>(name: string): S | undefined

  mount(element: HTMLElement): void
  destroy(): void

  /**
   * Raw engine access. Everything here is unstable and excluded from semver.
   * If you need this, open an issue — it means the public API has a gap.
   */
  readonly unsafe: {
    readonly view: unknown
    readonly state: unknown
    readonly schema: unknown
  }
}
