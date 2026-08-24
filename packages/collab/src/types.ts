/** One change, as it travels between clients. */
export interface CollabStep {
  /** The step, serialised. */
  step: Record<string, unknown>
  /** Who made it, so a client can recognise its own work coming back. */
  clientId: string
}

export interface Sendable {
  /** The document version these steps apply to. */
  version: number
  steps: CollabStep[]
  clientId: string
}

/** Where another person's caret is, in this client's coordinates. */
export interface Presence {
  clientId: string
  anchor: number
  head: number
  /** Free-form, for a name and a colour. */
  meta?: Record<string, unknown>
}
