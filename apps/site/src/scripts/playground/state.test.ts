import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SELECTION,
  initialMode,
  initialSelection,
  remember,
  rememberMode,
  withRequirements,
} from './state'

/**
 * The selection has to outlive the page.
 *
 * The bug this file exists for: tick a dozen extensions, go and read a doc
 * page, click Playground in the nav, and the editor is the starter set again.
 * The hash went with the URL you navigated away from, and the nav link carries
 * no hash — so the only place the selection had ever lived was gone.
 */
const CATALOGUE = new Set([
  'bold',
  'italic',
  'link',
  'heading',
  'bulletList',
  'listItem',
  'placeholder',
  'comment',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'emoji',
])

const at = (url: string) => {
  window.history.replaceState(null, '', url)
}

describe('what the playground opens with', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    at('/playground')
  })

  it('falls back to the starter set on a first visit', () => {
    expect(initialSelection(CATALOGUE)).toEqual(DEFAULT_SELECTION)
  })

  it('reads a shared link out of the hash', () => {
    at('/playground#comment,table,emoji')
    expect(initialSelection(CATALOGUE)).toEqual(['comment', 'table', 'emoji'])
  })

  it('drops names the catalogue no longer has', () => {
    at('/playground#comment,renamedLastYear,emoji')
    expect(initialSelection(CATALOGUE)).toEqual(['comment', 'emoji'])
  })

  it('remembers the selection when the URL does not', () => {
    remember(['comment', 'emoji'])
    // Leaving and coming back through a nav link: same path, no hash.
    at('/playground')
    expect(initialSelection(CATALOGUE)).toEqual(['comment', 'emoji'])
  })

  it('lets a shared link win over what was last open', () => {
    remember(['comment', 'emoji'])
    at('/playground#table,bold')
    expect(initialSelection(CATALOGUE)).toEqual(['table', 'bold'])
  })

  it('remembers the interface too', () => {
    rememberMode('docs')
    expect(initialMode()).toBe('docs')
  })

  it('ignores a mode that no longer exists', () => {
    rememberMode('skeuomorphic')
    expect(initialMode()).toBe('paper')
  })
})

describe('closing a selection over what it needs', () => {
  it('brings the parts a schema would throw without', () => {
    expect(withRequirements(['table']).sort()).toEqual([
      'table',
      'tableCell',
      'tableHeader',
      'tableRow',
    ])
  })

  it('settles rather than looping on a mutual requirement', () => {
    expect(withRequirements(['listItem']).sort()).toEqual(['bulletList', 'listItem'])
  })

  it('leaves an independent extension alone', () => {
    expect(withRequirements(['bold'])).toEqual(['bold'])
  })
})
