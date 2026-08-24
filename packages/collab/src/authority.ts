import type { CollabStep } from './types'

/**
 * The server side of the protocol, as a plain object.
 *
 * An authority is barely anything: a list of steps and the rule that a client
 * may only append if it is up to date. Keeping it transport-free means the same
 * object works over WebSocket, HTTP polling or an in-memory channel in tests.
 */
export class Authority {
  private readonly history: CollabStep[] = []

  constructor(private readonly onChange?: (version: number) => void) {}

  get version(): number {
    return this.history.length
  }

  /**
   * Append steps if the client is current.
   *
   * Returns false when it is not — the client should pull what it missed,
   * rebase, and try again. Rejecting rather than merging is what keeps the
   * history linear and every client's version meaningful.
   */
  receive(version: number, steps: CollabStep[]): boolean {
    if (version !== this.version) return false
    this.history.push(...steps)
    this.onChange?.(this.version)
    return true
  }

  /** Everything that happened after `version`. */
  since(version: number): CollabStep[] {
    return this.history.slice(version)
  }
}
