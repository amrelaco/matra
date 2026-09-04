import type { EditorState } from '../engine/state'
import { engine } from '../internal'
import type { Command, Editor, ExtensionDef, Pos } from '../types'

export interface DictationOptions {
  /** BCP 47 tag. Defaults to the browser's language. */
  lang?: string
  /** Keep listening after a pause. Default true. */
  continuous?: boolean
  /** Show what is being said before it is final. Default true. */
  interim?: boolean
  /** Class on the provisional text. Default `matra-dictation-interim`. */
  className?: string
}

export interface DictationState {
  listening: boolean
  /** Words the recogniser has heard but not yet settled on. */
  interim: string
  error: string | null
}

// The Web Speech API, as much of it as is used. It has no lib.dom typing in
// every TypeScript configuration, and none is needed for five members.
interface RecognitionAlternative {
  transcript: string
}
interface RecognitionResult {
  isFinal: boolean
  readonly length: number
  [index: number]: RecognitionAlternative
}
interface RecognitionEvent {
  resultIndex: number
  results: { readonly length: number; [index: number]: RecognitionResult }
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((event: RecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
}
type RecognitionCtor = new () => Recognition

function recognitionClass(): RecognitionCtor | null {
  const scope = globalThis as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

/** Can this browser listen at all? Chrome, Edge and Safari can; Firefox cannot yet. */
export function dictationSupported(): boolean {
  return recognitionClass() !== null
}

const META = 'dictation:set'
const IDLE: DictationState = { listening: false, interim: '', error: null }

/**
 * A space before the spoken words when the caret follows a word.
 *
 * Recognisers return "hello world" with no idea what precedes the caret, and
 * "textHello world" is the result of trusting them.
 */
function spaced(editor: Editor, text: string): string {
  if (!text || /^\s/.test(text)) return text
  const state = editor.unsafe.state as EditorState
  const $from = state.selection.$from
  if ($from.parentOffset === 0) return text
  const previous = $from.parent.textBetween($from.parentOffset - 1, $from.parentOffset)
  return previous && !/\s/.test(previous) ? ` ${text}` : text
}

/**
 * Speak, and the words arrive at the caret.
 *
 * Built on the browser's own speech recognition, so nothing is sent anywhere
 * the browser does not already send it and nothing is downloaded. Words the
 * recogniser is still deciding on are drawn after the caret as a decoration,
 * and become document text only once it settles — so a half-heard phrase is
 * never in the undo history.
 *
 * `startDictation` needs a mounted editor and a browser that can listen;
 * `editor.can.startDictation()` says whether both are true without turning
 * the microphone on. Where the API is missing, every command returns false.
 */
export function dictation(options: DictationOptions = {}): ExtensionDef<
  {
    startDictation: Command
    stopDictation: Command
    toggleDictation: Command
    setDictation: Command<[patch: Partial<DictationState>]>
  },
  DictationState
> {
  const className = options.className ?? 'matra-dictation-interim'
  type Commands = {
    setDictation(patch: Partial<DictationState>): boolean
    insert(content: string, at?: Pos): boolean
  }
  /** One recogniser per editor this extension is mounted in. */
  const sessions = new Map<Editor, { recognition: Recognition | null }>()

  /**
   * The editor a command is running in.
   *
   * A command only sees its context, and the context holds the editor's
   * state — an object no other editor shares, so it names the editor.
   */
  const editorOf = (ctx: Parameters<Command>[0]): Editor | null => {
    const state = engine(ctx).state
    for (const editor of sessions.keys()) {
      if (editor.unsafe.state === state) return editor
    }
    return null
  }

  const start = (editor: Editor): boolean => {
    const Ctor = recognitionClass()
    const session = sessions.get(editor)
    if (!Ctor || !session) return false
    if (session.recognition) return true
    const commands = editor.commands as unknown as Commands
    const recognition = new Ctor()
    recognition.lang =
      options.lang ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US')
    recognition.continuous = options.continuous ?? true
    recognition.interimResults = options.interim ?? true

    recognition.onresult = (event) => {
      let settled = ''
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result?.[0]?.transcript ?? ''
        if (result?.isFinal) settled += transcript
        else interim += transcript
      }
      if (settled) commands.insert(spaced(editor, settled))
      commands.setDictation({ interim })
    }
    recognition.onerror = (event) => {
      if (session.recognition !== recognition) return
      session.recognition = null
      commands.setDictation({ listening: false, interim: '', error: event.error ?? 'error' })
    }
    recognition.onend = () => {
      if (session.recognition !== recognition) return
      session.recognition = null
      commands.setDictation({ listening: false, interim: '' })
    }

    try {
      recognition.start()
    } catch {
      return false
    }
    session.recognition = recognition
    return true
  }

  const stop = (editor: Editor): boolean => {
    const session = sessions.get(editor)
    const recognition = session?.recognition
    if (!session || !recognition) return false
    session.recognition = null
    try {
      recognition.stop()
    } catch {
      // Already stopped, which is what was wanted.
    }
    return true
  }

  const listening = (editor: Editor | null) =>
    editor !== null && (sessions.get(editor)?.recognition ?? null) !== null

  return {
    kind: 'extension',
    name: 'dictation',

    state: {
      init: () => IDLE,
      apply: (ctx, previous) => {
        const patch = engine(ctx).tr.getMeta(META) as Partial<DictationState> | undefined
        return patch ? { ...previous, ...patch } : previous
      },
    },

    decorations: (ctx) => {
      const state = engine(ctx).pluginState('dictation') as DictationState | undefined
      if (!state?.interim) return []
      const { from, empty } = ctx.selection
      if (!empty) return []
      const text = state.interim
      return [
        {
          type: 'widget',
          pos: from,
          side: 1,
          key: `dictation:${text}`,
          render: () => {
            const span = document.createElement('span')
            span.className = className
            span.textContent = spaced(editorOf(ctx) ?? ({} as Editor), text)
            span.contentEditable = 'false'
            span.setAttribute('aria-hidden', 'true')
            return span
          },
        },
      ]
    },

    commands: {
      startDictation: (ctx) => {
        const access = engine(ctx)
        const editor = editorOf(ctx)
        if (!recognitionClass() || !editor) return false
        if (access.dry) return true
        if (!start(editor)) return false
        access.tr.setMeta(META, { listening: true, interim: '', error: null })
        return true
      },
      stopDictation: (ctx) => {
        const access = engine(ctx)
        const editor = editorOf(ctx)
        if (!listening(editor)) return false
        if (access.dry) return true
        stop(editor as Editor)
        access.tr.setMeta(META, { listening: false, interim: '' })
        return true
      },
      toggleDictation: (ctx) => {
        const access = engine(ctx)
        const editor = editorOf(ctx)
        if (!editor) return false
        if (listening(editor)) {
          if (access.dry) return true
          stop(editor)
          access.tr.setMeta(META, { listening: false, interim: '' })
          return true
        }
        if (!recognitionClass()) return false
        if (access.dry) return true
        if (!start(editor)) return false
        access.tr.setMeta(META, { listening: true, interim: '', error: null })
        return true
      },
      setDictation: (ctx, patch) => {
        if (!patch || typeof patch !== 'object') return false
        engine(ctx).tr.setMeta(META, patch)
        return true
      },
    },

    onCreate: (editor) => {
      sessions.set(editor, { recognition: null })
    },
    onDestroy: (editor) => {
      stop(editor)
      sessions.delete(editor)
    },
  }
}

export const dictationCSS = `
.matra-dictation-interim {
  opacity: 0.5;
  pointer-events: none;
  user-select: none;
}
`
