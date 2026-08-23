import { blockquote } from './blockquote'
import { bold } from './bold'
import { code } from './code'
import { codeBlock } from './code-block'
import { document } from './document'
import { hardBreak } from './hard-break'
import { heading } from './heading'
import { history } from './history'
import { horizontalRule } from './horizontal-rule'
import { italic } from './italic'
import { link } from './link'
import { bulletList, listItem, orderedList } from './lists'
import { paragraph } from './paragraph'
import { strike } from './strike'
import { text } from './text'

/**
 * Everything most editors want, in one array.
 *
 * `as const` is deliberate: it keeps the tuple literal so `CommandsOf` can
 * infer every command in the kit.
 */
export const starterKit = [
  document,
  paragraph,
  text,
  heading,
  blockquote,
  codeBlock,
  bulletList,
  orderedList,
  listItem,
  horizontalRule,
  hardBreak,
  bold,
  italic,
  strike,
  code,
  link,
  history,
] as const
