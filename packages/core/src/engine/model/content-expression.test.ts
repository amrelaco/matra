import { describe, expect, it } from 'vitest'
import { ContentMatch, type MatchableType } from './content-expression'

const TYPES: Record<string, MatchableType> = {
  doc: { name: 'doc', groups: [] },
  paragraph: { name: 'paragraph', groups: ['block'] },
  heading: { name: 'heading', groups: ['block'] },
  blockquote: { name: 'blockquote', groups: ['block'] },
  listItem: { name: 'listItem', groups: [] },
  image: { name: 'image', groups: ['inline'] },
  text: { name: 'text', groups: ['inline'] },
  caption: { name: 'caption', groups: [], fillable: false },
}

/** Resolve a name to the types it covers — a node name or a group name. */
const resolve = (name: string): MatchableType[] => {
  const direct = TYPES[name]
  if (direct) return [direct]
  const group = Object.values(TYPES).filter((t) => t.groups.includes(name))
  if (!group.length) throw new Error(`Matra: no node type or group named "${name}"`)
  return group
}

const compile = (expression: string) => ContentMatch.parse(expression, resolve)
const run = (expression: string, names: string[]) =>
  compile(expression).matchTypes(names.map((n) => TYPES[n] as MatchableType))

describe('content expressions', () => {
  it('matches a simple sequence', () => {
    const match = run('paragraph paragraph', ['paragraph', 'paragraph'])
    expect(match?.validEnd).toBe(true)
    expect(run('paragraph paragraph', ['paragraph'])?.validEnd).toBe(false)
  })

  it('matches one-or-more', () => {
    expect(run('block+', [])?.validEnd).toBe(false)
    expect(run('block+', ['paragraph'])?.validEnd).toBe(true)
    expect(run('block+', ['paragraph', 'heading', 'blockquote'])?.validEnd).toBe(true)
  })

  it('matches zero-or-more', () => {
    expect(run('inline*', [])?.validEnd).toBe(true)
    expect(run('inline*', ['text', 'image'])?.validEnd).toBe(true)
  })

  it('matches optional', () => {
    expect(run('heading? block+', ['paragraph'])?.validEnd).toBe(true)
    expect(run('heading? block+', ['heading', 'paragraph'])?.validEnd).toBe(true)
  })

  it('matches a choice', () => {
    expect(run('(paragraph | heading)+', ['heading', 'paragraph'])?.validEnd).toBe(true)
    expect(run('(paragraph | heading)+', ['image'])).toBeNull()
  })

  it('matches a counted range', () => {
    expect(run('heading{1,3}', [])?.validEnd).toBe(false)
    expect(run('heading{1,3}', ['heading'])?.validEnd).toBe(true)
    expect(run('heading{1,3}', ['heading', 'heading', 'heading'])?.validEnd).toBe(true)
    expect(run('heading{1,3}', ['heading', 'heading', 'heading', 'heading'])).toBeNull()
  })

  it('resolves group names to every member', () => {
    const allowed = compile('block+')
      .allowed.map((t) => t.name)
      .sort()
    expect(allowed).toEqual(['blockquote', 'heading', 'paragraph'])
  })

  it('rejects a type that cannot appear', () => {
    expect(run('paragraph+', ['image'])).toBeNull()
  })

  it('is the real list-item shape', () => {
    // What listItem actually declares.
    expect(run('paragraph block*', ['paragraph'])?.validEnd).toBe(true)
    expect(run('paragraph block*', ['paragraph', 'blockquote'])?.validEnd).toBe(true)
    expect(run('paragraph block*', ['blockquote'])).toBeNull()
  })
})

describe('repair', () => {
  it('reports nothing to fill when already valid', () => {
    expect(compile('inline*').fillBefore()).toEqual([])
  })

  it('names the shortest run that closes the match', () => {
    const fill = compile('paragraph block*').fillBefore()
    expect(fill?.map((t) => t.name)).toEqual(['paragraph'])
  })

  it('walks more than one step when it has to', () => {
    const fill = compile('heading paragraph').fillBefore()
    expect(fill?.map((t) => t.name)).toEqual(['heading', 'paragraph'])
  })

  it('gives up when no fillable type can close it', () => {
    expect(compile('caption+').fillBefore()).toBeNull()
  })
})

describe('bad expressions', () => {
  it('names the offending expression', () => {
    expect(() => compile('paragraph (')).toThrow(/content expression/)
    expect(() => compile('paragraph {1')).toThrow(/unclosed/)
    expect(() => compile('para$graph')).toThrow(/unexpected/)
    expect(() => compile('nosuchtype+')).toThrow(/no node type or group/)
  })
})
