import type { Range } from '@matra/core'

/** What the model is asked to do and what it streams back. */
export interface AiRequest {
  /** The text currently selected, which the model is asked to act on. */
  text: string
  /** Free-form instruction: "make this shorter", "fix the grammar". */
  instruction: string
  signal: AbortSignal
}

/** Any function that streams a replacement, chunk by chunk. */
export type AiStream = (request: AiRequest) => AsyncIterable<string>

export type AiStatus = 'idle' | 'streaming' | 'done' | 'error' | 'cancelled'

export interface AiSession {
  readonly id: number
  readonly status: AiStatus
  /** The range being rewritten, re-resolved against the current document. */
  readonly range: Range
  readonly received: string
  readonly error?: Error
}
