/**
 * The whole box, in one editor.
 *
 * Every bundled extension is meant to work beside every other, and the one
 * way to know is to build an editor with all of them. A command name defined
 * twice is a thrown error at construction — the columns extension and the
 * table extension both once called a command `deleteColumn`, and nothing
 * noticed until a page that used both was opened in a browser.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import * as all from './extensions'
import type { AnyDef } from './types'

const element = () => document.createElement('div')

/** Every extension, instantiated the way a user would with no options. */
function everything(): AnyDef[] {
  const defs: AnyDef[] = []
  const seen = new Set<string>()
  const add = (def: AnyDef) => {
    // A kit hands back the same nodes its parts do; one of each is the editor.
    if (seen.has(def.name)) return
    seen.add(def.name)
    defs.push(def)
  }
  const skip = new Set(['core', 'starterKit', 'tableKit', 'detailsKit', 'columnsKit'])
  const isDef = (value: unknown): value is AnyDef =>
    typeof value === 'object' && value !== null && 'kind' in value && 'name' in value
  const args: Record<string, unknown[]> = {
    bubbleMenu: [{ element: element() }],
    floatingMenu: [{ element: element() }],
    ghostText: [{ suggest: () => null }],
    autosave: [{ save: () => undefined }],
    fileHandler: [{ onDrop: () => undefined }],
    snippets: [[{ trigger: 'sig', content: 'x' }]],
    suggestion: [{ char: '@' }],
    mention: [],
    hashtag: [],
  }
  for (const [name, value] of Object.entries(all)) {
    if (skip.has(name)) continue
    if (isDef(value)) {
      add(value)
      continue
    }
    if (typeof value !== 'function' || !/^[a-z]/.test(name)) continue
    // Helpers return strings, arrays or nothing; extensions return a def or a kit.
    let made: unknown
    try {
      made = (value as (...a: unknown[]) => unknown)(...(args[name] ?? []))
    } catch {
      continue
    }
    if (isDef(made)) add(made)
    else if (Array.isArray(made)) for (const item of made) if (isDef(item)) add(item)
  }
  for (const kit of [all.starterKit, all.tableKit, all.detailsKit, all.columnsKit]) {
    for (const def of kit) add(def)
  }
  return defs
}

describe('the catalogue', () => {
  it('builds one editor out of every extension, with no command defined twice', () => {
    const defs = everything()
    expect(defs.length).toBeGreaterThan(70)
    const names = new Map<string, string>()
    for (const def of defs) {
      for (const command of Object.keys(def.commands ?? {})) {
        expect(
          names.get(command),
          `${command} is defined by ${names.get(command)} and ${def.name}`,
        ).toBeUndefined()
        names.set(command, def.name)
      }
    }
    const editor = createEditor({ extensions: defs, content: '<p>everything</p>' })
    const host = element()
    document.body.appendChild(host)
    editor.mount(host)
    const commands = editor.commands as unknown as {
      select(range: { from: number; to: number }): boolean
      toggleBold(): boolean
    }
    commands.select({ from: 1, to: 11 })
    expect(commands.toggleBold()).toBe(true)
    expect(editor.getHTML()).toBe('<p><strong>everything</strong></p>')
    editor.destroy()
  })
})
