// The Side chat tab bws-cockpit draws in its dashboard (bws-kit/tab.ts): what the Side chat and Decision tree panes used
// to show, one view at a time (`view`). Rows are laid out for a fixed width and window; ↑ / ↓ scroll them. Pure: no `$`.
//
// Ids sent back (and `/side --<id> [text]`, the same action): chat view: new, refresh, pull, end, older, newer, stop,
// model-<name> (default included), send-<message index>, ask-<n> (with the text), tree (shows the tree view);
// tree view: chat, map, back, decide, tree-close, older-t, newer-t, opt-<option>, node-<id>, answer-<n> (with the text).
import type { SideChat, TreePane } from '../types'
import { crumbOf, mapPaneRows, nodeRows } from './explain'
import type { PaneRow } from './explain'
import { buttons, makeTab, text } from './kit/tab'
import type { ModTab, TabButton, TabNode } from './kit/tab'
import { MODEL_CHOICES, askKey, clampBack, roomOf, scrollStep, transcriptRows, windowRows } from './side'
import { MAX_NODES, currentOf, decisionParagraph } from './tree'

// The width rows are laid out for, and the window of rows shown (as a pane this many rows tall would show).
export const TAB_COLS = 100
export const TAB_BODY_ROWS = 30
export const ROOM = roomOf(TAB_BODY_ROWS)
export const STEP = scrollStep(ROOM)

export type View = 'chat' | 'tree'

function chatNodes(c: SideChat, hasTree: boolean): TabNode[] {
  const rows = transcriptRows(c.msgs, c.live, TAB_COLS, true)
  const back = clampBack(c.back, rows.length, ROOM)
  const win = windowRows(rows.length, ROOM, back)
  const from = c.mainId === null ? 'not forked yet' : `forked from ${c.mainId.slice(0, 8)}`
  const ahead = c.isForked ? Math.max(0, c.mainTurns - c.forkTurns) : 0
  const mainState = [c.isMainBusy ? 'busy' : '', c.isForked ? (ahead > 0 ? `${ahead} ahead` : 'in sync') : ''].filter(t => t !== '').join(', ')
  const isCustom = c.model !== '' && !(MODEL_CHOICES as readonly string[]).includes(c.model)
  const models: TabButton[] = ['default', ...MODEL_CHOICES].map(name => {
    const isActive = name === 'default' ? c.model === '' : c.model === name
    return { id: `model-${name}`, label: isActive ? `● ${name}` : name }
  })
  const nodes: TabNode[] = [
    text(`Side chat · ${from}`, { isBold: true }),
    buttons({ id: 'new', label: 'New fork' }, { id: 'refresh', label: 'Refresh' }, { id: 'pull', label: 'Pull' }, { id: 'end', label: 'Close' }, ...(hasTree ? [{ id: 'tree', label: 'Decision tree' }] : [])),
    buttons(...models),
    text(`model: ${c.model === '' ? 'default' : c.model}${isCustom ? ' (custom)' : ''}${mainState !== '' ? ` · main: ${mainState}` : ''}`, { isDim: true }),
  ]
  if (rows.length === 0 && !c.isBusy) nodes.push(text('A copy of this conversation. Ask anything below; the main conversation is not touched. /fork starts a fresh copy.', { isDim: true }))
  if (win.above > 0) nodes.push(buttons({ id: 'older', label: `↑ ${win.above} rows above` }))
  for (const r of rows.slice(win.from, win.to)) {
    if (r.kind === 'send' && r.msgIndex !== undefined) nodes.push(buttons({ id: `send-${r.msgIndex}`, label: r.text }))
    else {
      const color = r.kind === 'you' ? ('ok' as const) : r.kind === 'note' ? ('warn' as const) : undefined
      nodes.push(text(r.text === '' ? ' ' : r.text, { isClipped: true, isBold: r.kind === 'you' || r.kind === 'claude', isDim: r.kind === 'tool' || r.kind === 'note', ...(color ? { color } : {}) }))
    }
  }
  if (win.below > 0) nodes.push(buttons({ id: 'newer', label: `↓ ${win.below} rows below` }))
  if (c.isBusy) nodes.push(text(c.live === '' ? 'thinking…' : 'answering…', { isDim: true }), buttons({ id: 'stop', label: 'Stop' }))
  nodes.push({ kind: 'input', id: askKey(c.asks), placeholder: c.isBusy ? 'wait for the answer…' : 'ask in the side chat, Enter sends', isFocused: true })
  return nodes
}

function treeNodes(st: TreePane): TabNode[] {
  const t = st.tree
  const node = t === null ? undefined : (currentOf(t) ?? t.nodes[0])
  if (t === null || node === undefined) return [text('Decision tree', { isBold: true }), text('Type /explain after a reply that lists options.', { isDim: true }), buttons({ id: 'chat', label: 'Side chat' })]
  const isMap = st.view === 'map'
  const rows: PaneRow[] = isMap ? mapPaneRows(t, TAB_COLS) : nodeRows(t, node, TAB_COLS)
  const back = clampBack(st.back, rows.length, ROOM)
  const win = windowRows(rows.length, ROOM, back)
  const crumb = crumbOf(t, node)
  const head: TabButton[] = [{ id: 'map', label: isMap ? 'Node' : 'Map' }]
  if (!isMap && node.parentId !== null) head.push({ id: 'back', label: 'Back' })
  if (decisionParagraph(t) !== null) head.push({ id: 'decide', label: 'Decide' })
  head.push({ id: 'tree-close', label: 'Close' }, { id: 'chat', label: 'Side chat' })
  const nodes: TabNode[] = [
    text(`Decision tree · ${t.nodes.length}/${MAX_NODES}`, { isBold: true }),
    buttons(...head),
    text(isMap ? 'the whole tree; pick a node to go there' : crumb === '' ? 'the question of the last reply' : crumb, { isDim: true, isClipped: true }),
  ]
  if (win.above > 0) nodes.push(buttons({ id: 'older-t', label: `↑ ${win.above} rows above` }))
  for (const r of rows.slice(win.from, win.to)) {
    if (r.kind === 'option') nodes.push(buttons({ id: `opt-${r.option}`, label: r.text }))
    else if (r.kind === 'node') nodes.push(buttons({ id: `node-${r.nodeId}`, label: r.text }))
    else nodes.push(text(r.text === '' ? ' ' : r.text, { isClipped: true, isBold: r.kind === 'bold', isDim: r.kind === 'dim', ...(r.kind === 'warn' ? { color: 'warn' as const } : {}) }))
  }
  if (win.below > 0) nodes.push(buttons({ id: 'newer-t', label: `↓ ${win.below} rows below` }))
  if (!isMap && node.state === 'ready' && node.options.length > 0) nodes.push({ kind: 'input', id: `answer-${st.answers}`, placeholder: 'your own answer to explore, Enter sends' })
  return nodes
}

export function sideTab(c: SideChat, st: TreePane, view: View, o: { show: number; open: number; exploring: number }): ModTab {
  const isTree = view === 'tree'
  const badge = c.isBusy || o.exploring > 0 ? '…' : isTree && st.tree !== null ? 'tree' : c.msgs.length > 0 ? String(c.msgs.filter(m => m.role === 'user').length) : ''
  const tone = c.isBusy || o.exploring > 0 ? 'busy' : c.msgs.length > 0 || st.tree !== null ? 'ok' : 'idle'
  return makeTab('Side chat', isTree ? treeNodes(st) : chatNodes(c, st.tree !== null), { badge, tone, show: o.show, open: o.open, isPinnedEnd: !isTree })
}

// `/side --<id> [text]`: a tab id and the text an input sent.
export function pressOf(args: string): { id: string; value?: string } | null {
  const m = /^--([\w:.-]+)(?:\s+([\s\S]*))?$/.exec(args.trim())
  if (!m || m[1] === undefined) return null
  return m[2] === undefined ? { id: m[1] } : { id: m[1], value: m[2] }
}
