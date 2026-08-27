import type { NodeDef } from '../types'

export const document = {
  kind: 'node',
  name: 'doc' as const,
  content: 'block+',
} satisfies NodeDef
