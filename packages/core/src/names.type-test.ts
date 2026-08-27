/**
 * Type-level tests, checked by `pnpm typecheck` rather than by vitest.
 *
 * `NamesOf` is a union of literals only for as long as every node and mark
 * definition keeps a literal `name`. One definition reverting to a plain
 * annotation — or one `as const` dropped from a `name:` line — widens the
 * union to `string`, and every check below starts passing again while
 * catching nothing. There is no runtime symptom to notice, so the guard has
 * to be a compile error.
 *
 * Each `@ts-expect-error` fails the build if the line it covers stops being
 * an error, which is exactly the direction this can rot in.
 */
import { createEditor } from './editor'
import { bold, document, paragraph, starterKit, text } from './extensions'
import type { NamesOf } from './types'

const full = createEditor({ extensions: starterKit })

full.isActive('bold')
full.isActive('heading', { level: 2 })
full.isActive('codeBlock')

// @ts-expect-error a misspelt name is a type error, not a silent false
full.isActive('bould')

// A comment box: four extensions, and the schema is the feature list.
const minimal = createEditor({ extensions: [document, paragraph, text, bold] })

minimal.isActive('bold')

// @ts-expect-error this editor has no heading, so it has no "heading" to ask about
minimal.isActive('heading')

// The union is literals, not `string`. If it ever widens, `string` becomes
// assignable to it and this stops erroring.
type Full = NamesOf<typeof starterKit>
// @ts-expect-error `string` is wider than the union of names
const widened: Full = 'anything' as string
void widened

// And the union really does contain what it should.
const named: Full = 'blockquote'
void named
