/**
 * The Matra engine.
 *
 * Written from scratch: document model, transforms and editor state. Nothing
 * here depends on another editor framework.
 */
export * from './model'
export * from './state'
export * from './transform'
export { History, type HistoryEntry, type HistoryOptions } from './history'
export { InputRules, type TextContext } from './input-rules'
export { Keymap, type KeyStroke, parseBinding, strokeFromEvent, strokesMatch } from './keys'
