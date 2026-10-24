// The Side chat tab bws-cockpit draws in its dashboard (bws-kit/tab.ts): the side chat as a conversation (one card a
// message, its markdown drawn, chips that open its documents and links in the browser, pictures under it) or the
// decision tree (`view`). The chat is drawn whole and the dashboard scrolls it; the tree keeps its own window, ↑ / ↓
// scroll it. Pure: no `$`.
//
// Ids sent back (and `/side --<id> [text]`, the same action): chat view: new, refresh, pull, end, stop, link (with the
// URL), open-<message>-<n> (a link chip), model-<name> (default included), send-<message index>, ask-<n> (with the
// text), tree (shows the tree view);
// tree view: chat, map, back, decide, tree-close, older-t, newer-t, opt-<option>, node-<id>, answer-<n> (with the text).
import type { SideChat, SideMsg, TreePane } from '../types'
import { crumbOf, mapPaneRows, nodeRows } from './explain'
import type { PaneRow } from './explain'
import { buttons, card, makeTab, markdown, text } from './kit/tab'
import type { ModTab, TabButton, TabNode } from './kit/tab'
import { refsOf } from './links'
import { MODEL_CHOICES, askKey, clampBack, roomOf, scrollStep, windowRows } from './side'
import { MAX_NODES, currentOf, decisionParagraph } from './tree'

// The width the tree's rows are laid out for, and the window of rows it shows (as a pane this many rows tall would).
export const TAB_COLS = 100
export const TAB_BODY_ROWS = 30
export const ROOM = roomOf(TAB_BODY_ROWS)
export const STEP = scrollStep(ROOM)

export type View = 'chat' | 'tree'

// A picture ready to draw (a bws-kit/tab.ts image node without its kind).
export type Picture = { alt: string; columns: number; rows: number; cells?: string; svg?: string }

// What the chat view knows beyond the messages: the session's folder (relative paths start there), the paths and URLs
// that resolve (as written → the URL a click opens) and the pictures read so far (by absolute path).
export type Media = { cwd: string; links: ReadonlyMap<string, string>; pictures: ReadonlyMap<string, Picture> }

export const NO_MEDIA: Media = { cwd: '', links: new Map(), pictures: new Map() }

// The dashboard draws at most 200 nodes (bws-kit/tab.ts): the newest messages that fit in this many are shown.
const NODE_BUDGET = 170
const MAX_PICTURES = 4 // pictures drawn, newest first: each is a large write on every streamed piece

const MAX_CHIPS = 8

// A link chip's label: an icon and the file's name, or the URL's host and path.
function chipLabel(written: string, url: string): string {
  const icon = /^https?:/i.test(url) ? '🌐' : /\.png$/i.test(url) ? '📷' : '📄'
  const name = /^https?:/i.test(url) ? url.replace(/^https?:\/\//i, '').replace(/\/$/, '') : (written.split(/[\\/]/).pop() ?? written)
  return `${icon} ${name.length > 40 ? `${name.slice(0, 39)}…` : name}`
}

// The link a chip `open-<message>-<n>` opens: the n-th path or URL message `i` names that resolves; '' when none.
export function chipUrl(msgs: readonly SideMsg[], id: string, media: Media): string {
  const m = /^open-(\d+)-(\d+)$/.exec(id)
  const msg = m === null ? undefined : msgs[Number(m[1])]
  if (m === null || msg === undefined) return ''
  const urls = refsOf(msg.text, media.cwd).flatMap(r => media.links.get(r.written) ?? [])
  return urls[Number(m[2])] ?? ''
}

// One message as nodes: a card for what you and Claude said, a dim line for the tools Claude ran, a warning for a note.
// Under the words: a chip for each document or URL it names (a press opens it in the browser), then its pictures.
function messageNodes(m: SideMsg, i: number, media: Media, pictures: { left: number }): TabNode[] {
  if (m.role === 'tool') return [text(`🔧 ${m.text}`, { isDim: true, isClipped: true })]
  if (m.role === 'note') return [text(`❗ ${m.text}`, { color: 'warn' })]
  const refs = refsOf(m.text, media.cwd)
  const body: TabNode[] = [markdown(m.text)]
  const chips = refs.flatMap(r => {
    const url = media.links.get(r.written)
    return url === undefined ? [] : [{ written: r.written, url }]
  })
  if (chips.length > 0) body.push(buttons(...chips.slice(0, MAX_CHIPS).map((c, n) => ({ id: `open-${i}-${n}`, label: chipLabel(c.written, c.url) }))))
  for (const r of refs) {
    const pic = r.isImage ? media.pictures.get(r.target) : undefined
    if (pic === undefined || pictures.left <= 0) continue
    pictures.left--
    body.push(text(`📷 ${pic.alt}`, { isDim: true }), { kind: 'image', ...pic })
  }
  if (m.role === 'user') return [card('🧑 You', body, 'ok')]
  body.push(buttons({ id: `send-${i}`, label: '📤 Send to main' }))
  return [card('🤖 Claude', body, 'accent')]
}

const countNodes = (ns: readonly TabNode[]): number => ns.reduce((s, n) => s + 1 + (n.kind === 'card' ? countNodes(n.body) : 0), 0)

// Consecutive tool lines folded into one: `Read a · Grep b`.
function foldTools(msgs: readonly SideMsg[]): { m: SideMsg; i: number }[] {
  const out: { m: SideMsg; i: number }[] = []
  for (const [i, m] of msgs.entries()) {
    const prev = out[out.length - 1]
    if (m.role === 'tool' && prev !== undefined && prev.m.role === 'tool') prev.m = { role: 'tool', text: `${prev.m.text} · ${m.text}` }
    else out.push({ m, i })
  }
  return out
}

export function chatNodes(c: SideChat, hasTree: boolean, media: Media = NO_MEDIA): TabNode[] {
  const from = c.mainId === null ? 'not forked yet' : `forked from ${c.mainId.slice(0, 8)}`
  const ahead = c.isForked ? Math.max(0, c.mainTurns - c.forkTurns) : 0
  const mainState = c.isMainBusy ? '⏳ main is busy' : !c.isForked ? '' : ahead > 0 ? `🟡 main is ${ahead} turn${ahead === 1 ? '' : 's'} ahead` : '🟢 in sync with main'
  const isCustom = c.model !== '' && !(MODEL_CHOICES as readonly string[]).includes(c.model)
  const models: TabButton[] = ['default', ...MODEL_CHOICES].map(name => {
    const isActive = name === 'default' ? c.model === '' : c.model === name
    return isActive ? { id: `model-${name}`, label: `● ${name}`, isPrimary: true } : { id: `model-${name}`, label: name }
  })
  const head: TabNode[] = [
    text('💬 Side chat', { isBold: true, color: 'accent' }),
    text([`🍴 ${from}`, `🧠 ${c.model === '' ? 'default model' : c.model}${isCustom ? ' (custom)' : ''}`, mainState].filter(t => t !== '').join('  ·  '), { isDim: true }),
    buttons(
      { id: 'new', label: '✨ New fork' },
      { id: 'refresh', label: '🔄 Refresh' },
      { id: 'pull', label: '📥 Pull main' },
      ...(hasTree ? [{ id: 'tree', label: '🌳 Decision tree' }] : []),
      { id: 'end', label: '✖ Close' },
    ),
    buttons(...models),
  ]
  const tail: TabNode[] = []
  if (c.live !== '') tail.push(card('🤖 Claude  ✏ answering…', [markdown(`${c.live}▌`)], 'accent'))
  else if (c.isBusy) tail.push(text('🤔 thinking…', { color: 'accent' }))
  if (c.isBusy) tail.push(buttons({ id: 'stop', label: '⏹ Stop' }))
  tail.push({ kind: 'input', id: askKey(c.asks), placeholder: c.isBusy ? '⏳ wait for the answer…' : '💭 ask the side chat, Enter sends', isFocused: true })

  // The newest messages that fit, drawn oldest first.
  const items = foldTools(c.msgs)
  const pictures = { left: MAX_PICTURES }
  let room = NODE_BUDGET - countNodes(head) - countNodes(tail) - 1
  const shown: TabNode[][] = []
  for (let k = items.length - 1; k >= 0; k--) {
    const it = items[k] as { m: SideMsg; i: number }
    const ns = messageNodes(it.m, it.i, media, pictures)
    const n = countNodes(ns)
    if (n > room) break
    room -= n
    shown.unshift(ns)
  }
  const body = [...head]
  if (items.length === 0 && !c.isBusy) {
    const tips = [
      'A copy of this conversation: ask anything here, and the main conversation is never touched.',
      '',
      '- 🔗 Documents and links an answer names get a button that opens them in your browser',
      '- 📷 PNG pictures an answer names show right here',
      '- 📤 **Send to main** puts an answer into the main conversation',
      '- ✨ **New fork** starts again from main as it is now',
    ]
    body.push(card('👋 Ask on the side', [markdown(tips.join('\n'))], 'accent'))
  }
  if (shown.length < items.length) body.push(text(`⋯ ${items.length - shown.length} earlier messages not shown`, { isDim: true }))
  for (const ns of shown) body.push(...ns)
  return [...body, ...tail]
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

// The chat stays pinned to its end only while an answer streams in, so reading an older answer is never pulled away.
export function sideTab(c: SideChat, st: TreePane, view: View, o: { show: number; open: number; exploring: number; media?: Media; isPin?: boolean }): ModTab {
  const isTree = view === 'tree'
  const badge = c.isBusy || o.exploring > 0 ? '…' : isTree && st.tree !== null ? 'tree' : c.msgs.length > 0 ? String(c.msgs.filter(m => m.role === 'user').length) : ''
  const tone = c.isBusy || o.exploring > 0 ? 'busy' : c.msgs.length > 0 || st.tree !== null ? 'ok' : 'idle'
  return makeTab('Side chat', isTree ? treeNodes(st) : chatNodes(c, st.tree !== null, o.media), { badge, tone, show: o.show, open: o.open, isPinnedEnd: !isTree && (c.isBusy || o.isPin === true) })
}

// `/side --<id> [text]`: a tab id and the text an input sent.
export function pressOf(args: string): { id: string; value?: string } | null {
  const m = /^--([\w:.-]+)(?:\s+([\s\S]*))?$/.exec(args.trim())
  if (!m || m[1] === undefined) return null
  return m[2] === undefined ? { id: m[1] } : { id: m[1], value: m[2] }
}
