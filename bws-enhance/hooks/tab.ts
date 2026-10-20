// The Enhance tab bws-cockpit draws in its dashboard (bws-kit/tab.ts): what the Enhance pane used to show, with the
// same letter keys while the dashboard has the keyboard. Pure: no `$`.
import type { View } from '../types'
import type { BounceMode } from './bounce'
import { buttons, makeTab, text } from './kit/tab'
import type { ModTab, TabNode } from './kit/tab'

// The ids a button sends back; `/enhance --<id>` runs the same action.
export const ACTIONS = ['send', 'revert', 'put', 'dismiss', 'cancel', 'sendanyway', 'enhance', 'edit', 'draft'] as const
export type Action = (typeof ACTIONS)[number]
export const actionOf = (word: string): Action | null => {
  const w = word.trim().toLowerCase().replace(/^--/, '')
  return ACTIONS.includes(w as Action) ? (w as Action) : null
}

export function enhanceTab(v: View, mode: BounceMode, o: { show: number; open: number }): ModTab {
  const opts = (badge: string, tone: ModTab['tone']) => ({ badge, tone, show: o.show, open: o.open })
  const bounceLine = text(`Vague-prompt check (/bounce): ${mode}.`, { isDim: true })
  if (v.phase === 'working') {
    return makeTab('Enhance', [text('✦ Enhancing…', { color: 'accent' }), text(v.original, { isDim: true, isClipped: true }), buttons({ id: 'cancel', label: 'Cancel', hotkey: 'c', isFocused: true })], opts('…', 'busy'))
  }
  if (v.phase === 'error') {
    return makeTab('Enhance', [text(`✦ Enhance failed: ${v.note}`, { color: 'bad' }), buttons({ id: 'dismiss', label: 'Dismiss', hotkey: 'd', isFocused: true })], opts('!', 'bad'))
  }
  if (v.phase === 'bounced') {
    const body: TabNode[] = [
      text(`✦ Held as vague: ${v.note}`, { color: 'warn' }),
      ...(mode === 'warn' ? [text('Enter in the box sends it as it is.', { isDim: true })] : []),
      buttons({ id: 'sendanyway', label: 'Send anyway', hotkey: 's', isPrimary: true, isFocused: true }, { id: 'enhance', label: 'Enhance', hotkey: 'e' }, { id: 'edit', label: 'Edit', hotkey: 'x' }),
    ]
    return makeTab('Enhance', body, opts('held', 'warn'))
  }
  if (v.phase === 'idle') {
    const idle = [
      text('Nothing to enhance. Type a rough prompt in the box, then Enhance draft (or ✦ enhance in the footer); or /enhance <rough prompt>.', { isDim: true }),
      bounceLine,
      buttons({ id: 'draft', label: 'Enhance draft', hotkey: 'e', isFocused: true }),
    ]
    return makeTab('Enhance', idle, opts('', 'idle'))
  }
  const isInTab = !v.isFilled && v.note === 'in-tab'
  const body: TabNode[] = [
    text(v.isFilled ? '✦ The enhanced prompt is in the box.' : isInTab ? '✦ Enhanced prompt ready:' : '✦ Enhanced prompt ready. The box had other text, so it was left alone.'),
    text(isInTab ? 's send · p put it in the box to edit · d dismiss' : v.isFilled ? 's send · r revert · d dismiss (with the dashboard focused) · Esc to edit in the box' : 's send · p put in box · d dismiss', { isDim: true }),
    ...(v.isFilled ? [] : [text(v.enhanced)]),
    buttons(
      { id: 'send', label: 'Send', hotkey: 's', isPrimary: true, isFocused: true },
      v.isFilled ? { id: 'revert', label: 'Revert', hotkey: 'r' } : { id: 'put', label: 'Put in box', hotkey: 'p' },
      { id: 'dismiss', label: 'Dismiss', hotkey: 'd' },
    ),
  ]
  return makeTab('Enhance', body, opts('✦', 'ok'))
}
