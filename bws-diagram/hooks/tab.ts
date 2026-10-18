// The Diagram tab bws-cockpit draws in its dashboard (bws-kit/tab.ts): what the side pane used to show. The rows are
// drawn at a fixed width, clipped at the pane's edge. Pure: no `$`.
import type { Board } from '../types'
import { footerOf, heading, shownEntry } from './diagram'
import { buttons, makeTab, text } from './kit/tab'
import type { ModTab, TabButton, TabNode } from './kit/tab'
import { legendOf, textRows } from './render'

// The width the diagram is laid out for: the old pane asked for 100 columns.
export const TAB_COLUMNS = 100

export function diagramTab(b: Board, o: { raise: number; show: number }): ModTab {
  const entry = shownEntry(b)
  const nav: TabButton[] = [{ id: 'draw', label: 'Draw the session' }]
  if (b.phase === 'error') nav.push({ id: 'dismiss', label: 'Dismiss the failure' })
  const notes: TabNode[] = [
    ...(b.phase === 'working' ? [text('A diagram is being drawn…', { color: 'accent' as const })] : []),
    ...(b.phase === 'error' ? [text(`Last attempt failed: ${b.note}`, { color: 'warn' as const })] : []),
  ]
  const badge = b.phase === 'working' ? '…' : b.phase === 'error' ? '!' : b.entries.length > 0 ? String(b.entries.length) : ''
  const tone = b.phase === 'working' ? 'busy' : b.phase === 'error' ? 'warn' : b.entries.length > 0 ? 'ok' : 'idle'
  const opts = { badge, tone, raise: o.raise, show: o.show } as const
  if (entry === null) return makeTab('Diagram', [text('No diagrams yet. /diagram draws the session.', { isDim: true }), ...notes, buttons(...nav)], opts)

  const body: TabNode[] = [text(heading(b), { isBold: true, isClipped: true })]
  let footer = footerOf(entry)
  if (entry.diagram) {
    const drawn = textRows(entry.diagram, TAB_COLUMNS)
    if (drawn.isCut) footer += `; it needs ${drawn.needed} columns, so the right side is cut`
    body.push(text(legendOf(entry.diagram), { color: 'accent' }), ...drawn.rows.map(r => text(r === '' ? ' ' : r, { isClipped: true })))
  } else {
    body.push(text('Not a flowchart this tab can draw; the source:', { isDim: true }), ...entry.source.split('\n').map(l => text(l, { isClipped: true })))
  }
  body.push(text(footer, { isDim: true }))
  const pinned = b.entries.flatMap((x, i) => (x.origin === 'pinned' ? [{ x, i }] : []))
  if (pinned.length > 0) {
    body.push(text('Pinned diagrams:', { isDim: true }), ...pinned.map(p => text(`${p.i === b.shown ? '> ' : '  '}${p.i + 1}. ${p.x.title}`, { isBold: p.i === b.shown, isClipped: true })))
  }
  const pos: TabButton[] = []
  if (b.shown > 0) pos.push({ id: 'prev', label: '< Prev' })
  if (b.shown < b.entries.length - 1) pos.push({ id: 'next', label: 'Next >' })
  return makeTab('Diagram', [...body, ...notes, buttons(...pos, ...nav)], opts)
}
