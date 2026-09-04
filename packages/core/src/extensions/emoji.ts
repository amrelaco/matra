import type { ExtensionDef, InputRule } from '../types'

export interface EmojiOptions {
  /** Your own shortcodes, added to or overriding the built-in set. */
  emojis?: Record<string, string>
  /** Also replace `:)`, `:(`, `<3` and friends as they are typed. Default false. */
  emoticons?: boolean
}

/**
 * The shortcodes people actually type. Small on purpose — a full table is
 * eighteen hundred entries and belongs in the picker, not in the bundle.
 */
export const EMOJI: Record<string, string> = {
  smile: '😄',
  grin: '😁',
  joy: '😂',
  rofl: '🤣',
  wink: '😉',
  blush: '😊',
  heart_eyes: '😍',
  thinking: '🤔',
  neutral_face: '😐',
  cry: '😢',
  sob: '😭',
  angry: '😠',
  scream: '😱',
  sunglasses: '😎',
  sweat_smile: '😅',
  see_no_evil: '🙈',
  thumbsup: '👍',
  '+1': '👍',
  thumbsdown: '👎',
  '-1': '👎',
  clap: '👏',
  wave: '👋',
  pray: '🙏',
  muscle: '💪',
  ok_hand: '👌',
  point_right: '👉',
  eyes: '👀',
  heart: '❤️',
  broken_heart: '💔',
  fire: '🔥',
  star: '⭐',
  sparkles: '✨',
  tada: '🎉',
  rocket: '🚀',
  bulb: '💡',
  warning: '⚠️',
  x: '❌',
  white_check_mark: '✅',
  heavy_check_mark: '✔️',
  question: '❓',
  exclamation: '❗',
  zap: '⚡',
  bug: '🐛',
  memo: '📝',
  book: '📖',
  bookmark: '🔖',
  link: '🔗',
  lock: '🔒',
  key: '🔑',
  bell: '🔔',
  calendar: '📅',
  clock: '🕐',
  coffee: '☕',
  pizza: '🍕',
  cake: '🎂',
  gift: '🎁',
  sun: '☀️',
  moon: '🌙',
  rainbow: '🌈',
  earth: '🌍',
  dog: '🐶',
  cat: '🐱',
  '100': '💯',
  wrench: '🔧',
  hammer: '🔨',
  package: '📦',
  chart: '📈',
  computer: '💻',
  phone: '📱',
  email: '📧',
  house: '🏠',
  car: '🚗',
  airplane: '✈️',
  flag: '🚩',
  trophy: '🏆',
  medal: '🏅',
  soccer: '⚽',
  music: '🎵',
  art: '🎨',
  camera: '📷',
  bangladesh: '🇧🇩',
}

const EMOTICONS: Array<[RegExp, string]> = [
  [/(^|\s):-?\)$/, '🙂'],
  [/(^|\s):-?\($/, '🙁'],
  [/(^|\s):-?D$/, '😃'],
  [/(^|\s);-?\)$/, '😉'],
  [/(^|\s):-?P$/i, '😛'],
  [/(^|\s):-?O$/i, '😮'],
  [/(^|\s)<3$/, '❤️'],
  [/(^|\s):'\($/, '😢'],
]

/**
 * Emoji as you type: `:tada:` becomes 🎉 the moment the closing colon lands.
 *
 * Detection only, like mentions and slash commands — a picker is an interface,
 * and `suggestion({ char: ':' })` plus `searchEmoji` are what one is built on.
 */
export function emoji(options: EmojiOptions = {}): ExtensionDef {
  const table = options.emojis ? { ...EMOJI, ...options.emojis } : EMOJI
  const rules: InputRule[] = [
    {
      match: /(^|[^\w:]):([\w+-]{1,30}):$/,
      handler: (ctx, match, range) => {
        const found = table[match[2] ?? '']
        if (!found) return false
        // Keep whatever came before the colon; only the code is replaced.
        const lead = (match[1] ?? '').length
        return ctx.replace(
          { from: (range.from + lead) as typeof range.from, to: range.to },
          found,
        )
      },
    },
  ]
  if (options.emoticons) {
    for (const [pattern, glyph] of EMOTICONS) {
      rules.push({
        match: pattern,
        handler: (ctx, match, range) => {
          const lead = (match[1] ?? '').length
          return ctx.replace(
            { from: (range.from + lead) as typeof range.from, to: range.to },
            glyph,
          )
        },
      })
    }
  }
  return { kind: 'extension', name: 'emoji', inputRules: rules }
}

/** Shortcodes starting with the query, for a picker. */
export function searchEmoji(
  query: string,
  limit = 8,
  table: Record<string, string> = EMOJI,
): Array<{ name: string; emoji: string }> {
  const needle = query.toLowerCase().replace(/^:/, '')
  const out: Array<{ name: string; emoji: string }> = []
  for (const name in table) {
    if (!name.startsWith(needle)) continue
    out.push({ name, emoji: table[name] as string })
    if (out.length >= limit) break
  }
  return out
}
