// The Memory tab bws-cockpit draws in its dashboard (bws-kit/tab.ts): what the Memory and Dream panes used to show, as
// two cards. Pure: no `$`.
import type { DreamView, View } from '../types'
import { actionLine, actionSessions, BACKUP_DIR, counts, countsText, fromLine, SHOWN_ACTIONS } from './dreamapply'
import { buttons, card, makeTab, text } from './kit/tab'
import type { ModTab, TabNode } from './kit/tab'

function memoryCard(v: View): TabNode {
  if (v.phase === 'working') return card('Last memory update', [text('memory updating…', { color: 'accent' })])
  if (v.phase === 'error') return card('Last memory update', [text(`Memory not saved: ${v.note}`, { color: 'warn' }), buttons({ id: 'memory-ok', label: 'OK' })], 'warn')
  if (v.phase === 'idle') return card('Last memory update', [text('No memory changes yet. /remember saves one now.', { isDim: true })])
  return card(
    'Last memory update',
    [
      text(`Memory updated: ${v.written.length} file${v.written.length === 1 ? '' : 's'}`, { color: 'ok' }),
      ...v.written.map(w => text(`${w.kind === 'new' ? 'new ' : 'edit'} ${w.file} +${w.added} -${w.removed}`, { isClipped: true })),
      buttons({ id: 'memory-ok', label: 'OK' }, { id: 'memory-undo', label: 'Undo it' }),
    ],
    'ok',
  )
}

function dreamCard(d: DreamView): TabNode {
  if (d.phase === 'working') return card('Dream', [text('dreaming…', { color: 'accent' })])
  if (d.phase === 'error') return card('Dream', [text(`Dream: ${d.note}`, { color: 'warn' }), buttons({ id: 'dream-dismiss', label: 'Close' })], 'warn')
  if (d.phase === 'idle') {
    return card('Dream', [
      text(d.due ? 'A dream is due: the memory could use consolidating.' : 'Merge duplicates, drop stale entries, rewrite for clarity.', d.due ? { color: 'warn' } : { isDim: true }),
      buttons({ id: 'dream-plan', label: 'Plan a dream', isPrimary: d.due }),
    ])
  }
  const shown = d.actions.slice(0, SHOWN_ACTIONS)
  const rows = shown.flatMap(a => [
    text(actionLine(a), { isClipped: true }),
    text(`  ${a.reason}`, { isDim: true, isClipped: true }),
    text(`  ${fromLine(actionSessions(a, d.sessions))}`, { isDim: true, isClipped: true }),
  ])
  const more = d.actions.length - shown.length
  if (d.phase === 'applied') {
    return card(
      'Dream',
      [
        text(`Dream applied: ${countsText(counts(d.actions))}`, { color: 'ok' }),
        text(`Backup: ${BACKUP_DIR}/${d.backup}/ (/dream undo restores it)`, { isDim: true, isClipped: true }),
        ...rows,
        ...(more > 0 ? [text(`+${more} more`, { isDim: true })] : []),
        buttons({ id: 'dream-dismiss', label: 'Close' }),
      ],
      'ok',
    )
  }
  return card(
    'Dream',
    [
      text(`Dream plan: ${d.actions.length} action${d.actions.length === 1 ? '' : 's'}${d.due ? ' (due)' : ''}`, { color: 'accent' }),
      buttons({ id: 'dream-apply', label: 'Apply', isPrimary: true }, { id: 'dream-dismiss', label: 'Dismiss' }),
      ...rows,
      ...(more > 0 ? [text(`+${more} more (all are applied)`, { isDim: true })] : []),
    ],
    'accent',
  )
}

export function memoryTab(v: View, d: DreamView, o: { raise: number }): ModTab {
  const busy = v.phase === 'working' || d.phase === 'working'
  const warn = v.phase === 'error' || d.phase === 'error'
  const badge = busy ? '…' : warn ? '!' : d.phase === 'preview' ? 'plan' : d.due ? 'due' : v.phase === 'done' ? String(v.written.length) : ''
  const tone = busy ? 'busy' : warn ? 'warn' : d.phase === 'preview' || d.due ? 'warn' : v.phase === 'done' ? 'ok' : 'idle'
  return makeTab('Memory', [memoryCard(v), dreamCard(d)], { badge, tone, raise: o.raise })
}
