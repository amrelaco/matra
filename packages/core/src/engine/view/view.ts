import { DOMParser } from '../model/dom-parser'
import { Fragment } from '../model/fragment'
import type { Node } from '../model/node'
import type { Schema } from '../model/schema'
import type { Selection } from '../state/selection'
import type { EditorState } from '../state/state'
import type { Transaction } from '../state/transaction'
import { insertPasted } from '../transform/insert'
import { Mapping } from '../transform/step-map'
import { DecorationSet } from './decoration'
import { DropCursor, blockDropTarget, blockIndexAt } from './drag'
import { type InputHandlers, type InputIntent, applyIntent } from './input'
import type { NodeViewFactory } from './node-view'
import { Renderer } from './render'
import { readSelection, writeSelection } from './selection-sync'

export interface EditorViewOptions {
  state: EditorState
  /** Node views by type name. */
  nodeViews?: Record<string, NodeViewFactory>
  /** Recomputed on every redraw. */
  decorations?(): DecorationSet
  /** Called with every transaction the view produces. */
  dispatchTransaction(tr: Transaction): void
  editable?: () => boolean
  /**
   * Move a block. Returns true if the move happened.
   *
   * The view knows where a drop landed; what a move *means* is the editor's
   * business, so the arithmetic stays out of here.
   */
  moveBlock?(from: number, to: number): boolean
  handlers?: InputHandlers
  /** Return true to say a key was handled. */
  handleKeyDown?(event: KeyboardEvent): boolean
}

/**
 * The editable surface.
 *
 * Written on `beforeinput`: the browser announces what it is about to do, the
 * view cancels it, applies the equivalent change to the model, and re-renders.
 * The DOM is therefore always a projection of the document rather than a second
 * source of truth that has to be reconciled.
 *
 * Composition (IME) is the exception. While a candidate window is open the
 * browser must be left alone — cancelling its input mid-composition breaks
 * Japanese, Chinese and Korean entry outright — so the view stands back and
 * reads the result when composition ends.
 */
export class EditorView {
  readonly dom: HTMLElement
  private readonly renderer: Renderer
  private readonly parser: DOMParser
  private stateValue: EditorState
  private composing = false
  private destroyed = false
  private readonly cleanups: Array<() => void> = []

  constructor(
    place: HTMLElement,
    private readonly schema: Schema,
    private readonly options: EditorViewOptions,
  ) {
    this.stateValue = options.state
    this.renderer = new Renderer(schema, { factories: options.nodeViews ?? {} })
    this.parser = DOMParser.fromSchema(schema)

    this.dom = place
    this.dom.setAttribute('contenteditable', String(options.editable?.() ?? true))
    this.dom.classList.add('matra-editor')
    this.dom.setAttribute('role', 'textbox')
    this.dom.setAttribute('aria-multiline', 'true')

    this.render(this.collectDecorations())
    this.listen()
  }

  get state(): EditorState {
    return this.stateValue
  }

  /** Swap in a new state and bring the DOM to match. */
  updateState(state: EditorState, mapping?: Mapping): void {
    const docChanged = !state.doc.eq(this.stateValue.doc)
    // Told what moved, the position map shifts what it already knows instead of
    // being rebuilt from the document on every keystroke.
    if (mapping && docChanged) {
      this.renderer.map.shift(mapping)
      this.absorb(mapping)
    }
    this.stateValue = state
    if (this.destroyed) return
    // Never redraw mid-composition: it would tear the candidate window down.
    if (this.composing) return
    // Asked once per update. Every extension that decorates is consulted, and
    // this used to ask them twice per keystroke — once to decide whether to
    // redraw and once more to redraw.
    const decorations = this.collectDecorations()
    // Decorations can change without the document changing — a selection-driven
    // highlight, or a remote cursor moving.
    if (docChanged || !this.lastDecorations.eq(decorations)) this.render(decorations)
    this.lastDecorations = decorations
    this.syncSelection()
  }

  private lastDecorations = DecorationSet.empty
  /** The document span the pending updates touched, in new coordinates. */
  private dirty: { from: number; to: number } | null = null
  /**
   * Every change since the last render, as one mapping.
   *
   * Usually one transaction. During a composition renders are held back, and a
   * remote step or a streamed chunk arriving then must not be forgotten when
   * the next render narrows to the span of the last change alone.
   */
  private pending: Mapping | null = null

  private absorb(mapping: Mapping): void {
    const span = touchedSpan(mapping)
    if (span) {
      this.dirty = this.dirty
        ? { from: Math.min(this.dirty.from, span.from), to: Math.max(this.dirty.to, span.to) }
        : span
    }
    if (!this.pending) this.pending = mapping
    else {
      const combined = new Mapping([...this.pending.maps])
      combined.appendMapping(mapping)
      this.pending = combined
    }
  }

  private collectDecorations(): DecorationSet {
    return this.options.decorations?.() ?? DecorationSet.empty
  }

  focus(): void {
    this.dom.focus()
    this.syncSelection()
  }

  get hasFocus(): boolean {
    return this.dom.ownerDocument.activeElement === this.dom
  }

  setEditable(editable: boolean): void {
    this.dom.setAttribute('contenteditable', String(editable))
  }

  /** The block being dragged, as a document range. */
  private dragged: { from: number; to: number } | null = null
  /** The block an in-progress composition is writing into. */
  private composedBlock: { dom: HTMLElement; index: number } | null = null
  private dropCursor: DropCursor | null = null

  private onDragStart(event: DragEvent): void {
    const block = this.blockAt(event.clientY)
    if (!block) return
    this.dragged = block
    event.dataTransfer?.setData(
      'text/plain',
      this.stateValue.doc.textBetween(block.from, block.to),
    )
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    this.dropCursor = this.dropCursor ?? new DropCursor(this.dom.ownerDocument)
  }

  private onDragOver(event: DragEvent): void {
    // Preventing the default is what makes an element a drop target at all —
    // for a block being moved, and for a file or text arriving from outside.
    event.preventDefault()
    if (!this.dragged) {
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      return
    }
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    const target = blockDropTarget(this.dom, this.stateValue.doc, event.clientY)
    if (target) this.dropCursor?.show(target.rect)
  }

  private onDrop(event: DragEvent): void {
    const dragged = this.dragged
    if (!dragged) {
      this.onExternalDrop(event)
      return
    }
    event.preventDefault()
    const target = blockDropTarget(this.dom, this.stateValue.doc, event.clientY)
    this.endDrag()
    if (!target) return
    // Dropping a block back into itself is a no-op, not a delete.
    if (target.pos >= dragged.from && target.pos <= dragged.to) return
    this.options.moveBlock?.(dragged.from, target.pos)
  }

  /**
   * Something from outside landed on the editor: a file, text, a piece of a
   * web page. Left to the browser it would be written into the DOM behind the
   * document's back and lost on the next redraw, so it is taken like a paste,
   * at the point it was dropped.
   */
  private onExternalDrop(event: DragEvent): void {
    const transfer = event.dataTransfer
    if (!transfer) return
    const files = Array.from(transfer.files ?? [])
    const html = transfer.getData('text/html') || null
    const text = transfer.getData('text/plain') || null
    if (!files.length && !html && !text) return
    event.preventDefault()

    const pos = this.posAtPoint(event.clientX, event.clientY)
    if (this.options.handlers?.onDrop?.({ html, text, files, pos })) return
    if (!html && !text) return
    const at = pos ?? this.stateValue.selection.from
    this.insertContent(html, text, at, at)
  }

  private endDrag(): void {
    this.dragged = null
    this.dropCursor?.hide()
  }

  /** The top-level block whose box contains this y, as a document range. */
  private blockAt(y: number): { from: number; to: number } | null {
    const index = blockIndexAt(this.dom.children, y)
    const content = this.stateValue.doc.content
    if (index < 0 || index >= content.childCount) return null
    const from = content.offsetAt(index)
    return { from, to: from + content.child(index).nodeSize }
  }

  /** The document position under a point on screen, if it is inside the text. */
  private posAtPoint(x: number, y: number): number | null {
    const doc = this.dom.ownerDocument as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: globalThis.Node; offset: number } | null
      caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    let node: globalThis.Node | null = null
    let offset = 0
    if (typeof doc.caretPositionFromPoint === 'function') {
      const caret = doc.caretPositionFromPoint(x, y)
      if (caret) {
        node = caret.offsetNode
        offset = caret.offset
      }
    } else if (typeof doc.caretRangeFromPoint === 'function') {
      const range = doc.caretRangeFromPoint(x, y)
      if (range) {
        node = range.startContainer
        offset = range.startOffset
      }
    }
    if (!node || !this.dom.contains(node)) return null
    return this.renderer.map.posFromDOM(this.dom, node, offset)
  }

  destroy(): void {
    this.destroyed = true
    this.dropCursor?.destroy()
    this.dropCursor = null
    this.renderer.reset()
    for (const cleanup of this.cleanups) cleanup()
    this.cleanups.length = 0
    this.dom.removeAttribute('contenteditable')
  }

  private render(decorations: DecorationSet): void {
    this.renderer.render(this.stateValue.doc, this.dom, decorations, this.dirty, this.pending)
    this.dirty = null
    this.pending = null
  }

  /**
   * Put the DOM back to what the document says, whatever the browser did.
   *
   * A change read back from the DOM — an IME's composed text, mostly — can
   * be refused by a filter, and then the screen shows text the document does
   * not hold. Redrawing the whole document is the honest fix: what is on
   * screen is what would be saved.
   */
  restore(): void {
    if (this.destroyed || this.composing) return
    this.dirty = null
    this.pending = null
    const decorations = this.collectDecorations()
    this.render(decorations)
    this.lastDecorations = decorations
    this.syncSelection()
  }

  private syncSelection(): void {
    if (!this.hasFocus) return
    writeSelection(this.dom, this.renderer.map, this.stateValue.doc, this.stateValue.selection)
  }

  private on<K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
  ): void {
    const listener = handler as EventListener
    this.dom.addEventListener(type, listener)
    this.cleanups.push(() => this.dom.removeEventListener(type, listener))
  }

  private listen(): void {
    this.on('beforeinput', (event) => this.onBeforeInput(event as InputEvent))
    this.on('keydown', (event) => this.onKeyDown(event))
    this.on('compositionstart', () => {
      this.composing = true
      // Remember which block the IME is writing into, so the read-back can
      // re-parse that block rather than the whole document.
      this.composedBlock = this.blockUnderSelection()
    })
    this.on('compositionend', () => {
      this.composing = false
      this.readBackComposition()
      this.composedBlock = null
    })
    this.on('paste', (event) => this.onPaste(event as ClipboardEvent))
    this.on('dragstart', (event) => this.onDragStart(event as DragEvent))
    this.on('dragover', (event) => this.onDragOver(event as DragEvent))
    this.on('dragleave', () => this.dropCursor?.hide())
    this.on('drop', (event) => this.onDrop(event as DragEvent))
    this.on('dragend', () => this.endDrag())

    const onSelectionChange = () => {
      if (this.composing || !this.hasFocus) return
      this.readSelectionFromDOM()
    }
    const doc = this.dom.ownerDocument
    doc.addEventListener('selectionchange', onSelectionChange)
    this.cleanups.push(() => doc.removeEventListener('selectionchange', onSelectionChange))
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.composing) return
    if (this.renderer.nodeViews.stopsEvent(event.target as globalThis.Node, event)) return
    // Read where the caret actually is before asking a command about it.
    // `beforeinput` already works from the DOM; keymaps worked from whatever
    // the model was last told, and `selectionchange` does not always land
    // before the next key — click into a paragraph and type immediately and
    // the command ran against the previous caret.
    this.readSelectionFromDOM()
    if (this.options.handleKeyDown?.(event)) {
      event.preventDefault()
    }
  }

  private onBeforeInput(event: InputEvent): void {
    if (this.composing) return
    // A node view may own this interaction entirely.
    if (this.renderer.nodeViews.stopsEvent(event.target as globalThis.Node, event)) return
    if (this.options.editable && !this.options.editable()) {
      event.preventDefault()
      return
    }

    const range = this.currentRange()
    if (!range) return

    const intent: InputIntent = {
      type: event.inputType,
      data: event.data ?? dataFromClipboard(event),
      from: range.from,
      to: range.to,
    }

    const tr = applyIntent(this.stateValue, this.schema, intent, this.options.handlers)
    if (!tr) {
      // Unknown intents are refused rather than allowed to mutate the DOM
      // behind the model's back.
      if (KNOWN_INTENTS.has(event.inputType)) event.preventDefault()
      return
    }

    event.preventDefault()
    this.options.dispatchTransaction(tr)
  }

  private onPaste(event: ClipboardEvent): void {
    const clipboard = event.clipboardData
    const html = clipboard?.getData('text/html') || null
    const text = clipboard?.getData('text/plain') || null
    const files = Array.from(clipboard?.files ?? [])
    if (this.options.handlers?.onPaste?.({ html, text, files })) {
      event.preventDefault()
      return
    }
    if (!html && !text) {
      // Files nobody claimed. The browser has nothing sensible to do with them
      // in an editable element either, so the paste is cancelled rather than
      // left to become whatever the platform decides an image pastes as.
      if (files.length) event.preventDefault()
      return
    }

    event.preventDefault()
    const range = this.currentRange()
    if (!range) return
    this.insertContent(html, text, range.from, range.to)
  }

  /** Parse pasted or dropped content and put it in the document. */
  private insertContent(
    html: string | null,
    text: string | null,
    from: number,
    to: number,
  ): void {
    const tr = this.stateValue.tr
    let landing: number | null = null
    if (html) {
      const container = this.dom.ownerDocument.createElement('div')
      container.innerHTML = html
      landing = insertPasted(tr, from, to, this.parser.parseFragment(container))
    }
    if (landing === null && text) {
      landing = insertPasted(tr, from, to, this.textFragment(from, text))
    }
    if (landing === null) return
    tr.selectAt(landing)
    this.options.dispatchTransaction(tr)
  }

  /**
   * Plain text as the editor would hold it.
   *
   * Lines become blocks like the one the caret is in, so three lines pasted
   * from a text file are three paragraphs and not one with the breaks
   * collapsed into spaces. Inside a block that holds code the line breaks are
   * content, and the text goes in as it is.
   */
  private textFragment(at: number, text: string): Fragment {
    const doc = this.stateValue.doc
    const normalised = text.replace(/\r\n?/g, '\n')
    const parent = doc.resolve(at).parent
    if (!normalised.includes('\n') || (parent.isTextblock && parent.type.spec.code)) {
      return Fragment.from(this.schema.text(normalised))
    }
    const type = parent.isTextblock ? parent.type : this.schema.nodes.paragraph
    if (!type) return Fragment.from(this.schema.text(normalised.replace(/\n/g, ' ')))
    return Fragment.from(
      normalised
        .split('\n')
        .map((line) => type.create(null, line ? this.schema.text(line) : null)),
    )
  }

  /** The top-level block the selection sits in, and where it starts. */
  private blockUnderSelection(): { dom: HTMLElement; index: number } | null {
    const selection = this.dom.ownerDocument.getSelection()
    const node = selection?.anchorNode
    if (!node) return null

    let element: globalThis.Node | null = node
    while (element && element.parentNode !== this.dom) element = element.parentNode
    if (!element || element.nodeType !== 1) return null

    const index = Array.prototype.indexOf.call(this.dom.children, element)
    return index === -1 ? null : { dom: element as HTMLElement, index }
  }

  /**
   * Take the DOM back after the IME has finished writing into it.
   *
   * Composition is the one time the DOM changes without a transaction, so the
   * document has to be brought back into line with it afterwards. Re-parsing
   * everything is the obvious way and it costs the size of the document per
   * composed character — which is a bill paid only by people writing Bangla,
   * Chinese, Japanese or Korean, because everyone else never enters this path.
   *
   * So the block the IME was writing in is re-parsed on its own, and only that
   * block is replaced. The whole-document read-back stays as the fallback for
   * anything that cannot be localised: a composition spanning blocks, or one
   * whose block has since gone.
   */
  private readBackComposition(): void {
    const selection = readSelection(this.dom, this.renderer.map, this.stateValue.doc)
    const local = this.composedBlock
    if (local && local.dom.parentNode === this.dom && this.replaceOneBlock(local, selection)) {
      return
    }

    const parsed = this.parser.parse(this.dom)
    if (parsed.eq(this.stateValue.doc)) {
      if (selection) this.dispatchSelection(selection)
      return
    }

    const tr = this.stateValue.tr
    tr.replaceWith(0, this.stateValue.doc.content.size, parsed.content)
    if (selection) tr.selectAt(Math.min(selection.anchor, tr.doc.content.size))
    this.options.dispatchTransaction(tr)
  }

  /** Re-parse one block and swap it in. False means "could not, use the fallback". */
  private replaceOneBlock(
    local: { dom: HTMLElement; index: number },
    selection: Selection | null,
  ): boolean {
    const doc = this.stateValue.doc
    // The DOM and the document must still agree on how many blocks there are;
    // if the IME added or removed one, this is not a single-block edit.
    if (this.dom.children.length !== doc.content.childCount) return false
    if (local.index >= doc.content.childCount) return false

    const container = this.dom.ownerDocument.createElement('div')
    container.appendChild(local.dom.cloneNode(true))
    const parsed = this.parser.parse(container)
    if (parsed.content.childCount !== 1) return false

    const replacement = parsed.content.child(0)
    const existing = doc.content.child(local.index)
    if (replacement.eq(existing)) {
      if (selection) this.dispatchSelection(selection)
      return true
    }
    // Only the text inside a block may change this way. A different node type
    // means the IME did something structural, and that needs the full path.
    if (replacement.type !== existing.type) return false

    const from = doc.content.offsetAt(local.index)

    const tr = this.stateValue.tr
    tr.replaceWith(from, from + existing.nodeSize, replacement)
    if (selection) tr.selectAt(Math.min(selection.anchor, tr.doc.content.size))
    this.options.dispatchTransaction(tr)
    return true
  }

  private readSelectionFromDOM(): void {
    const selection = readSelection(this.dom, this.renderer.map, this.stateValue.doc)
    if (!selection || selection.eq(this.stateValue.selection)) return
    this.dispatchSelection(selection)
  }

  private dispatchSelection(selection: ReturnType<typeof readSelection>): void {
    if (!selection) return
    const tr = this.stateValue.tr
    tr.setSelection(selection)
    this.options.dispatchTransaction(tr)
  }

  private currentRange(): { from: number; to: number } | null {
    const selection = readSelection(this.dom, this.renderer.map, this.stateValue.doc)
    if (selection) return { from: selection.from, to: selection.to }
    const fallback = this.stateValue.selection
    return { from: fallback.from, to: fallback.to }
  }

  /** The document as the view currently understands it. */
  get doc(): Node {
    return this.stateValue.doc
  }
}

const KNOWN_INTENTS = new Set([
  'insertText',
  'insertReplacementText',
  'insertParagraph',
  'insertLineBreak',
  'deleteContentBackward',
  'deleteContentForward',
  'deleteByCut',
  'deleteContent',
])

function dataFromClipboard(event: InputEvent): string | null {
  return event.dataTransfer?.getData('text/plain') ?? null
}

/**
 * The span an edit touched, in the coordinates of the document after it.
 *
 * Everything outside it holds the same nodes in the same DOM, so the renderer
 * can walk past it without asking any questions. Without this the diff visits
 * every block on every keystroke, and typing costs the size of the document
 * however cheap each visit is.
 */
function touchedSpan(mapping: Mapping): { from: number; to: number } | null {
  let from = Number.POSITIVE_INFINITY
  let to = Number.NEGATIVE_INFINITY
  for (const map of mapping.maps) {
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      if (newStart < from) from = newStart
      if (newEnd > to) to = newEnd
    })
  }
  if (from > to) return null
  return { from, to }
}
