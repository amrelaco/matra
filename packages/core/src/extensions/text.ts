import type { NodeDef } from '../types'

export const text = {
  kind: 'node',
  name: 'text' as const,
  group: 'inline',
} satisfies NodeDef
