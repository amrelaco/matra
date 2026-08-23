import { DOMParser } from '../model/dom-parser'
import type { Node } from '../model/node'
import type { Schema } from '../model/schema'
import type { EditorState } from '../state/state'
import type { Transaction } from '../state/transaction'
import { type InputHandlers, type InputIntent, applyIntent } from './input'
import { Renderer } from './render'
import { readSelection, writeSelection } from './selection-sync'

export interface EditorViewOptions {
  state: EditorState
  /** Called with every transaction the view produces. */
  dispatchTransaction(tr: Transaction): void
  editable?: () => boolean
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
    this.renderer = new Renderer(schema)
    this.parser = DOMParser.fromSchema(schema)

    this.dom = place
    this.dom.setAttribute('contenteditable', String(options.editable?.() ?? true))
    this.dom.classList.add('matra-editor')
    this.dom.setAttribute('role', 'textbox')
    this.dom.setAttribute('aria-multiline', 'true')

    this.render()
    this.listen()
  }

  get state(): EditorState {
    return this.stateValue
  }

  /** Swap in a new state and bring the DOM to match. */
  updateState(state: EditorState): void {
    const docChanged = !state.doc.eq(this.stateValue.doc)
    this.stateValue = state
    if (this.destroyed) return
    // Never redraw mid-composition: it would tear the candidate window down.
    if (this.composing) return
    if (docChanged) this.render()
    this.syncSelection()
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

  destroy(): void {
    this.destroyed = true
    for (const cleanup of this.cleanups) cleanup()
    this.cleanups.length = 0
    this.dom.removeAttribute('contenteditable')
  }

  private render(): void {
    this.renderer.render(this.stateValue.doc, this.dom)
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
    })
    this.on('compositionend', () => {
      this.composing = false
      this.readBackComposition()
    })
    this.on('paste', (event) => this.onPaste(event as ClipboardEvent))

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
    if (this.options.handleKeyDown?.(event)) {
      event.preventDefault()
    }
  }

  private onBeforeInput(event: InputEvent): void {
    if (this.composing) return
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
    const html = event.clipboardData?.getData('text/html') ?? null
    const text = event.clipboardData?.getData('text/plain') ?? null
    if (this.options.handlers?.onPaste?.(html, text)) {
      event.preventDefault()
      return
    }
    if (!html && !text) return

    event.preventDefault()
    const range = this.currentRange()
    if (!range) return

    const container = this.dom.ownerDocument.createElement('div')
    if (html) container.innerHTML = html
    else container.textContent = text

    const fragment = this.parser.parseFragment(container)
    const tr = this.stateValue.tr
    tr.replaceWith(range.from, range.to, fragment)
    tr.selectAt(range.from + fragment.size)
    this.options.dispatchTransaction(tr)
  }

  /**
   * After an IME finishes, the DOM holds text the model has not seen. Read the
   * affected block back rather than trying to reconstruct the keystrokes.
   */
  private readBackComposition(): void {
    const selection = readSelection(this.dom, this.renderer.map, this.stateValue.doc)
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
