// The Mask tab (bws-kit/tab.ts, drawn by bws-cockpit), its summary chip and the /mask text: pure. Shows counts and
// rules only, never a hidden value or a configured term: the tab is on screen too.
import { card, makeTab, text, type ModTab, type TabNode } from './kit/tab'
import { KINDS, type Kind } from './mask'

export type Tally = Record<Kind, number>
export const NO_TALLY: Tally = { email: 0, name: 0, phone: 0, amount: 0, key: 0, user: 0, term: 0 }

const LABEL: Record<Kind, [emoji: string, one: string, many: string, rule: string]> = {
  email: ['📧', 'email', 'emails', 'Email addresses'],
  name: ['👤', 'name', 'names', 'Names before an <email>'],
  phone: ['📞', 'phone number', 'phone numbers', 'Phone numbers (+44 …, (415) 555-0132)'],
  amount: ['💵', 'amount', 'amounts', 'Money ($4,250, €12k, 300 USD)'],
  key: ['🔑', 'key or token', 'keys and tokens', 'Keys, tokens, passwords (sk-…, ghp_…, Bearer …)'],
  user: ['🏠', 'account name', 'account names', 'Account names in home paths (C:/Users/<name>)'],
  term: ['🏷️', 'custom term', 'custom terms', 'Your terms'],
}

const total = (t: Tally) => KINDS.reduce((n, k) => n + t[k], 0)
const plural = (n: number, k: Kind) => `${n} ${n === 1 ? LABEL[k][1] : LABEL[k][2]}`

export type View = { isOn: boolean; tally: Tally; terms: number; hasAutoUser: boolean; show: number }

export function maskTab(v: View): ModTab {
  const hidden = total(v.tally)
  const status: TabNode[] = v.isOn
    ? [text('🟢 On: private data draws as ▒▒▒ bars of the same length', { isBold: true, color: 'ok' })]
    : [text('⚪ Off: everything draws as normal', { isBold: true })]
  status.push(text('🧠 Only the screen changes: Claude still reads the real data', { isDim: true }))
  if (v.isOn) status.push(text(`📊 ${hidden} distinct value${hidden === 1 ? '' : 's'} hidden so far`))
  const body: TabNode[] = [card('🙈 Screen-share masking', status, v.isOn ? 'ok' : 'accent')]
  if (hidden > 0) {
    const rows = KINDS.filter(k => v.tally[k] > 0).map(k => text(`${LABEL[k][0]} ${plural(v.tally[k], k)}`))
    body.push(card(`📊 Hidden on screen · ${hidden}`, rows, 'accent'))
  }
  const rules = KINDS.filter(k => k !== 'term').map(k => text(`${LABEL[k][0]} ${LABEL[k][3]}`, { isDim: !v.isOn }))
  if (v.hasAutoUser) rules.push(text('🏠 Your account name, anywhere it appears', { isDim: !v.isOn }))
  rules.push(
    v.terms > 0
      ? text(`🏷️ ${plural(v.terms, 'term')} from the plugin's terms option`, { isDim: !v.isOn })
      : text('➖ No custom terms yet: set the terms option in /plugin', { isDim: true }),
  )
  body.push(card('🧩 What is hidden', rules, v.isOn ? 'ok' : undefined))
  body.push(
    card(
      '⚠️ Not covered',
      [text('⌨️ The prompt box as you type'), text('🗂️ Dashboard tabs and other panes'), text('🖼️ Images and screenshots')],
      'warn',
    ),
  )
  body.push({ kind: 'buttons', items: [v.isOn ? { id: 'toggle', label: '👁️ Turn off', hotkey: 'm', isPrimary: true } : { id: 'toggle', label: '🙈 Turn on', hotkey: 'm', isPrimary: true }] })
  return makeTab('Mask', body, { badge: v.isOn ? '🙈' : '', tone: v.isOn ? 'ok' : 'idle', show: v.show })
}

export type SummaryState = 'idle' | 'busy' | 'ok' | 'warn' | 'bad'

export function maskChip(isOn: boolean, tally: Tally): { state: SummaryState; label: string; detail?: string } | null {
  if (!isOn) return null
  const n = total(tally)
  return { state: 'ok', label: 'masking on', detail: `${n} value${n === 1 ? '' : 's'} hidden` }
}

export function maskText(v: Omit<View, 'show'>): string {
  const head = v.isOn ? 'Masking on: private data draws as bars on screen; Claude still reads the real data.' : 'Masking off.'
  const n = total(v.tally)
  if (n === 0) return head
  return `${head}\nHidden so far: ${KINDS.filter(k => v.tally[k] > 0).map(k => plural(v.tally[k], k)).join(', ')}.`
}
