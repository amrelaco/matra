import type { Node } from '../engine/model'
import { engine } from '../internal'
import type { DecorationSpec, ExtensionDef, Pos } from '../types'
import { type BlockCache, scanBlocks, textblocksIn } from './block-scan'

/** One coloured run inside a code block, as offsets into its text. */
export interface CodeToken {
  from: number
  to: number
  /** Class for the span. `matra-token-keyword`, say. */
  class?: string
  /** Inline colour, for highlighters that speak in colours rather than classes. */
  color?: string
}

export type Highlighter = (code: string, language: string | null) => CodeToken[]

export interface CodeHighlightOptions {
  /**
   * Tokenise code. Left off, a small built-in tokeniser colours comments,
   * strings, numbers and the keywords most languages share. Plug in lowlight,
   * Prism or Shiki here for the real thing.
   */
  highlight?: Highlighter
  /** Which node types are code. Default `codeBlock`. */
  types?: readonly string[]
}

const KEYWORDS = /* @__PURE__ */ new Set(
  (
    'abstract as async await break case catch class const continue debugger default delete do ' +
    'else enum export extends false finally for from function if implements import in instanceof ' +
    'interface let new null of package private protected public return static super switch this ' +
    'throw true try type typeof undefined var void while with yield ' +
    'def elif except lambda pass raise with is not and or None True False print self ' +
    'fn impl let mut pub struct trait use match loop where ' +
    'func go chan defer select map range struct package ' +
    'int float double char bool string long short unsigned signed struct union sizeof ' +
    'begin end then fi esac done local echo ' +
    'select insert update delete where join group order by limit create table drop alter'
  ).split(' '),
)

const TOKEN =
  /(\/\/[^\n]*|#[^\n]*|--[^\n]*)|(\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\b0x[\da-f]+\b)|([A-Za-z_$][\w$]*)/gi

/**
 * A tokeniser good enough to make code look like code.
 *
 * Not a parser for any language, and not trying to be: comments, strings,
 * numbers and a shared keyword list are what the eye uses to find its way
 * around a block. A `#` line is a comment in Python, shell and YAML and a
 * colour in CSS; the built-in guesses comment, and a real highlighter can be
 * supplied for a document where the difference matters.
 */
export function basicHighlighter(code: string): CodeToken[] {
  const out: CodeToken[] = []
  TOKEN.lastIndex = 0
  let match: RegExpExecArray | null = TOKEN.exec(code)
  while (match) {
    const [text, line, block, string, number, word] = match
    const from = match.index
    const to = from + text.length
    if (line || block) out.push({ from, to, class: 'matra-token-comment' })
    else if (string) out.push({ from, to, class: 'matra-token-string' })
    else if (number) out.push({ from, to, class: 'matra-token-number' })
    else if (word && KEYWORDS.has(word)) out.push({ from, to, class: 'matra-token-keyword' })
    match = TOKEN.exec(code)
  }
  return out
}

/**
 * Syntax highlighting for code blocks, as decorations.
 *
 * The tokens never enter the document — a code block's content stays plain
 * text, which is what copying it out and saving it both want. Each block is
 * tokenised when it changes and remembered until it does again, keyed on the
 * block node itself; typing in one code block does not re-colour another.
 */
export function codeHighlight(options: CodeHighlightOptions = {}): ExtensionDef {
  const highlight = options.highlight ?? basicHighlighter
  const types = new Set(options.types ?? ['codeBlock'])
  const cache: BlockCache<Array<CodeToken & { at: number }>> = new WeakMap()

  const tokensIn = (block: Node): Array<CodeToken & { at: number }> => {
    const out: Array<CodeToken & { at: number }> = []
    textblocksIn(block, (textblock, offset) => {
      if (!types.has(textblock.type.name)) return
      const language = textblock.attrs.language
      let tokens: CodeToken[]
      try {
        tokens = highlight(
          textblock.textContent,
          typeof language === 'string' ? language : null,
        )
      } catch {
        // A highlighter that throws on one block should not take the editor down.
        return
      }
      for (const token of tokens) {
        if (token.to <= token.from) continue
        out.push({ ...token, at: offset })
      }
    })
    return out
  }

  return {
    kind: 'extension',
    name: 'codeHighlight',
    decorations(ctx) {
      const out: DecorationSpec[] = []
      scanBlocks(engine(ctx).state.doc, cache, tokensIn, (tokens, _block, pos) => {
        for (const token of tokens) {
          const attrs: Record<string, string> = {}
          if (token.class) attrs.class = token.class
          if (
            token.color &&
            /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,%]+\))$/i.test(token.color)
          ) {
            attrs.style = `color: ${token.color}`
          }
          out.push({
            type: 'inline',
            from: (pos + token.at + token.from) as Pos,
            to: (pos + token.at + token.to) as Pos,
            attrs,
          })
        }
      })
      return out
    },
  }
}

/** A palette for the built-in tokeniser's classes. */
export const codeHighlightCSS = `
.matra-token-comment { color: var(--matra-code-comment, #6a737d); font-style: italic; }
.matra-token-string { color: var(--matra-code-string, #0a7a3b); }
.matra-token-number { color: var(--matra-code-number, #b35c00); }
.matra-token-keyword { color: var(--matra-code-keyword, #a626a4); }
`
