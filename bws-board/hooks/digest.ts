// The team digest: one HTML page per repository, built from the board's history files. It shows
// who worked when (and how long several worked at once), who held which files, the asks and how
// long they waited, the edits a claim refused, and the urgent wakes. Pure: register.tsx reads the
// files and writes the page.

import { relTo, shortId } from './board'
import type { HistEvent, History } from './history'

export type Span = { start: number; end: number }
export type Hold = Span & { file: string; edits: number }
export type Mark = { at: number; kind: 'ask' | 'take' | 'done' | 'decline' | 'withdraw' | 'deny' | 'wake' | 'send' | 'release'; label: string }
export type Lane = { id: string; name: string; start: number; end: number; isOpen: boolean; tasks: { at: number; task: string }[]; busy: Span[]; holds: Hold[]; marks: Mark[] }
export type AskRow = {
  id: string
  from: string
  to: string
  text: string
  urgent: boolean
  at: number
  outcome: 'open' | 'taken' | 'done' | 'declined' | 'withdrawn'
  taker?: string
  takeAt?: number
  doer?: string
  doneAt?: number
  note?: string
  decliners: string[]
}
// `isGit`: a git command refused for the git lease (`file` reads `git <verb>`).
export type BlockRow = { at: number; who: string; file: string; holder: string; isGit?: true }
export type FileRow = { file: string; holds: { name: string; start: number; end: number; edits: number }[]; isContested: boolean; denies: number }
export type WakeRow = { from: string; to: string; sent: number; failed: number; held: number }
export type Totals = { agents: number; busyMs: number; activeMs: number; overlapMs: number; asks: number; done: number; medianTakeMs?: number; medianDoneMs?: number; denies: number; gitWaits: number; wakes: number }
export type Digest = { folder: string; from: number; to: number; now: number; lanes: Lane[]; asks: AskRow[]; blocks: BlockRow[]; files: FileRow[]; wakes: WakeRow[]; totals: Totals }

const nameOf = (role: string | null | undefined, id: string) => (role ? `${role} (${shortId(id)})` : shortId(id))

const median = (xs: readonly number[]) => {
  if (xs.length === 0) return undefined
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m] : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2
}

// Milliseconds covered by at least `k` of the spans.
export function coverage(spans: readonly Span[], k: number): number {
  const edges = spans.flatMap(s => (s.end > s.start ? [{ t: s.start, d: 1 }, { t: s.end, d: -1 }] : []))
  edges.sort((a, b) => a.t - b.t || a.d - b.d)
  let n = 0
  let last = 0
  let total = 0
  for (const e of edges) {
    if (n >= k) total += e.t - last
    n += e.d
    last = e.t
  }
  return total
}

const clip = (s: Span, from: number, to: number): Span | undefined => {
  const start = Math.max(s.start, from)
  const end = Math.min(s.end, to)
  return end > start ? { start, end } : undefined
}

// One session's lane: when it was on the board, its busy turns, the files it held and its board acts.
// `isLive`: its card is live now, so open spans run to `now`; else they end at its last event.
function laneOf(h: History, isLive: boolean, now: number, claimMs: number): Omit<Lane, 'name'> & { role: string | null } {
  const evs = [...h.events].sort((a, b) => a.at - b.at)
  const first = evs[0]?.at ?? now
  const ended = evs.find(e => e.kind === 'end')?.at
  const end = ended ?? (isLive ? now : (evs[evs.length - 1]?.at ?? first))
  const role = [...evs].reverse().find(e => e.role !== null)?.role ?? null
  const busy: Span[] = []
  let busyAt: number | undefined
  const open = new Map<string, { start: number; last: number; edits: number }>()
  const holds: Hold[] = []
  const close = (file: string, at: number) => {
    const o = open.get(file)
    if (o === undefined) return
    holds.push({ file, start: o.start, end: Math.min(at, o.last + claimMs), edits: o.edits })
    open.delete(file)
  }
  const tasks: { at: number; task: string }[] = []
  const marks: Mark[] = []
  for (const e of evs) {
    if (e.at > end) break
    if (e.kind === 'busy' && busyAt === undefined) busyAt = e.at
    if ((e.kind === 'idle' || e.kind === 'end') && busyAt !== undefined) {
      busy.push({ start: busyAt, end: e.at })
      busyAt = undefined
    }
    if ((e.kind === 'busy' || e.kind === 'task') && e.task && tasks[tasks.length - 1]?.task !== e.task) tasks.push({ at: e.at, task: e.task })
    if ((e.kind === 'claim' || e.kind === 'edit') && e.file) {
      const o = open.get(e.file)
      if (o !== undefined && e.at - o.last >= claimMs) close(e.file, e.at)
      const cur = open.get(e.file)
      open.set(e.file, cur ? { ...cur, last: e.at, edits: cur.edits + 1 } : { start: e.at, last: e.at, edits: 1 })
    }
    if (e.kind === 'release') {
      for (const f of e.files && e.files.length > 0 ? e.files : [...open.keys()]) close(f, e.at)
      marks.push({ at: e.at, kind: 'release', label: `released ${e.files && e.files.length > 0 ? e.files.length : 'all'} file(s)` })
    }
    if (e.kind === 'end') for (const f of [...open.keys()]) close(f, e.at)
    if (e.kind === 'ask') marks.push({ at: e.at, kind: 'ask', label: `asked ${e.askId ?? ''}${e.urgent ? ' (urgent)' : ''}` })
    if (e.kind === 'take' || e.kind === 'done' || e.kind === 'decline') marks.push({ at: e.at, kind: e.kind, label: `${e.kind} ${e.askId ?? ''}` })
    if (e.kind === 'withdraw') marks.push({ at: e.at, kind: 'withdraw', label: `withdrew ${e.askId ?? ''}` })
    if (e.kind === 'gitWait') marks.push({ at: e.at, kind: 'deny', label: `git ${e.verb ?? ''} refused: lease held by ${e.holder ? nameOf(e.holderRole, e.holder) : 'another session'}` })
    if (e.kind === 'deny') marks.push({ at: e.at, kind: 'deny', label: `edit refused: held by ${e.holder ? nameOf(e.holderRole, e.holder) : 'another session'}` })
    if (e.kind === 'wake') marks.push({ at: e.at, kind: 'wake', label: `${e.delivered ? 'woke' : 'could not wake'} ${e.to ? shortId(e.to) : ''}` })
    if (e.kind === 'send') marks.push({ at: e.at, kind: 'send', label: `message to ${e.to === 'all' ? 'all' : e.to ? shortId(e.to) : '?'}` })
  }
  if (busyAt !== undefined) busy.push({ start: busyAt, end })
  for (const f of [...open.keys()]) close(f, end)
  return { id: h.sessionId, role, start: first, end, isOpen: ended === undefined && isLive, tasks, busy, holds, marks }
}

// The digest of every session that worked on the board between `from` and `to` (one that only
// started and ended, like one opened to run /board digest, is left out). The window then narrows
// to the time those sessions were on the board, so a short run fills the timeline.
export function buildDigest(histories: readonly History[], opts: { folder: string; from: number; to: number; now: number; claimMs: number; live: ReadonlySet<string> }): Digest {
  const raw = histories
    .filter(h => h.events.some(e => e.kind !== 'start' && e.kind !== 'end'))
    .map(h => laneOf(h, opts.live.has(h.sessionId), opts.now, opts.claimMs))
    .filter(l => l.end >= opts.from && l.start <= opts.to)
  const o =
    raw.length === 0
      ? opts
      : { ...opts, from: Math.max(opts.from, Math.min(...raw.map(l => l.start))), to: Math.min(opts.to, Math.max(...raw.map(l => l.end))) }
  const names = new Map(histories.map(h => [h.sessionId, nameOf([...h.events].reverse().find(e => e.role !== null)?.role, h.sessionId)]))
  const nm = (id: string) => names.get(id) ?? shortId(id)
  const inWin = (at: number) => at >= o.from && at <= o.to
  const lanes: Lane[] = raw
    .map(l => ({
      id: l.id,
      name: nm(l.id),
      start: Math.max(l.start, o.from),
      end: Math.min(l.end, o.to),
      isOpen: l.isOpen,
      tasks: l.tasks.filter(t => inWin(t.at)),
      busy: l.busy.flatMap(s => clip(s, o.from, o.to) ?? []),
      holds: l.holds.flatMap(hd => {
        const c = clip(hd, o.from, o.to)
        return c ? [{ ...hd, ...c }] : []
      }),
      marks: l.marks.filter(m => inWin(m.at)),
    }))
    .sort((a, b) => a.start - b.start)
  const ids = new Set(lanes.map(l => l.id))
  const evs = histories.filter(h => ids.has(h.sessionId)).flatMap(h => h.events.map(e => ({ ...e, sid: h.sessionId })))
  evs.sort((a, b) => a.at - b.at)

  // Asks posted in the window, with every other session's acts on them.
  const asks: AskRow[] = []
  for (const e of evs) {
    if (e.kind !== 'ask' || !e.askId || !inWin(e.at)) continue
    const acts = evs.filter(x => x.askId === e.askId && x.sid !== e.sid)
    const take = acts.find(x => x.kind === 'take')
    const done = acts.find(x => x.kind === 'done')
    const withdrawn = evs.find(x => x.kind === 'withdraw' && x.askId === e.askId && x.sid === e.sid)
    const decliners = [...new Set(acts.filter(x => x.kind === 'decline').map(x => nm(x.sid)))]
    const outcome: AskRow['outcome'] = done ? 'done' : withdrawn ? 'withdrawn' : take ? 'taken' : decliners.length > 0 ? 'declined' : 'open'
    asks.push({
      id: e.askId,
      from: nm(e.sid),
      to: e.to === undefined ? 'anyone' : e.to.startsWith('role:') ? e.to.slice(5) : e.to.startsWith('session:') ? nm(e.to.slice(8)) : e.to,
      text: e.text ?? '',
      urgent: e.urgent === true,
      at: e.at,
      outcome,
      decliners,
      ...(take ? { taker: nm(take.sid), takeAt: take.at } : {}),
      ...(done ? { doer: nm(done.sid), doneAt: done.at, ...(done.note ? { note: done.note } : {}) } : {}),
    })
  }

  const blocks: BlockRow[] = evs
    .filter(e => ((e.kind === 'deny' && e.file) || e.kind === 'gitWait') && inWin(e.at))
    .map(e => ({
      at: e.at,
      who: nm(e.sid),
      file: e.kind === 'gitWait' ? `git ${e.verb ?? ''}`.trim() : relTo(e.file ?? '', o.folder),
      holder: e.holder ? (names.has(e.holder) ? nm(e.holder) : nameOf(e.holderRole, e.holder)) : '?',
      ...(e.kind === 'gitWait' ? { isGit: true as const } : {}),
    }))

  const byFile = new Map<string, FileRow>()
  for (const l of lanes)
    for (const hd of l.holds) {
      const file = relTo(hd.file, o.folder)
      const row = byFile.get(file) ?? { file, holds: [], isContested: false, denies: 0 }
      row.holds.push({ name: l.name, start: hd.start, end: hd.end, edits: hd.edits })
      byFile.set(file, row)
    }
  for (const b of blocks.filter(x => !x.isGit)) {
    const row = byFile.get(b.file) ?? { file: b.file, holds: [], isContested: false, denies: 0 }
    row.denies += 1
    byFile.set(b.file, row)
  }
  const files = [...byFile.values()]
    .map(r => ({ ...r, isContested: r.denies > 0 || new Set(r.holds.map(x => x.name)).size > 1 }))
    .sort((a, b) => Number(b.isContested) - Number(a.isContested) || b.holds.length - a.holds.length || a.file.localeCompare(b.file))

  const wakeMap = new Map<string, WakeRow>()
  for (const e of evs) {
    if ((e.kind !== 'wake' && e.kind !== 'wakeHeld') || !e.to || !inWin(e.at)) continue
    const key = `${e.sid}>${e.to}`
    const row = wakeMap.get(key) ?? { from: nm(e.sid), to: nm(e.to), sent: 0, failed: 0, held: 0 }
    if (e.kind === 'wakeHeld') row.held += 1
    else if (e.delivered) row.sent += 1
    else row.failed += 1
    wakeMap.set(key, row)
  }
  const wakes = [...wakeMap.values()].sort((a, b) => b.sent - a.sent)

  const allBusy = lanes.flatMap(l => l.busy)
  const totals: Totals = {
    agents: lanes.length,
    busyMs: allBusy.reduce((n, s) => n + (s.end - s.start), 0),
    activeMs: coverage(allBusy, 1),
    overlapMs: coverage(allBusy, 2),
    asks: asks.length,
    done: asks.filter(a => a.outcome === 'done').length,
    medianTakeMs: median(asks.flatMap(a => (a.takeAt !== undefined ? [a.takeAt - a.at] : []))),
    medianDoneMs: median(asks.flatMap(a => (a.doneAt !== undefined ? [a.doneAt - a.at] : []))),
    denies: blocks.filter(x => !x.isGit).length,
    gitWaits: blocks.filter(x => x.isGit).length,
    wakes: wakes.reduce((n, w) => n + w.sent, 0),
  }
  return { folder: o.folder, from: o.from, to: Math.max(o.to, o.from + 1), now: o.now, lanes, asks, blocks, files, wakes, totals }
}

// ---------- HTML ----------

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function durText(ms: number | undefined): string {
  if (ms === undefined) return '–'
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const hrs = Math.floor(m / 60)
  return `${hrs}h ${m % 60}m`
}

const iso = (ms: number) => new Date(ms).toISOString()
// A time the page's script shows in the viewer's zone; UTC until it runs. `f`: t (time), s (time
// with seconds) or d (date and time).
const tm = (ms: number, f: 't' | 's' | 'd' = 't') =>
  `<time datetime="${iso(ms)}" data-ms="${ms}" data-f="${f}">${f === 'd' ? iso(ms).slice(0, 16).replace('T', ' ') : iso(ms).slice(11, f === 's' ? 19 : 16)} UTC</time>`

const LANE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#ec4899', '#84cc16']
const GLYPH: Record<Mark['kind'], string> = { ask: '?', take: '→', done: '✓', decline: '×', withdraw: '↺', deny: '⛔', wake: '⚡', send: '✉', release: '⇣' }

function timeline(d: Digest): string {
  const span = Math.max(1, d.to - d.from)
  const pct = (t: number) => `${(((Math.min(Math.max(t, d.from), d.to) - d.from) / span) * 100).toFixed(3)}%`
  const wid = (a: number, b: number) => `${Math.max(0.25, ((Math.min(b, d.to) - Math.max(a, d.from)) / span) * 100).toFixed(3)}%`
  const ticks = Array.from({ length: 6 }, (_, i) => d.from + (span * i) / 5)
  const axis = `<div class="axis"><div class="lab"></div><div class="track">${ticks.map((t, i) => `<span class="tick" style="left:${(i * 20).toFixed(0)}%">${tm(Math.round(t), span > 20 * 3600_000 ? 'd' : span < 30 * 60_000 ? 's' : 't')}</span>`).join('')}</div></div>`
  const rows = d.lanes.map((l, i) => {
    const color = LANE_COLORS[i % LANE_COLORS.length] ?? '#3b82f6'
    const on = `<div class="on" style="left:${pct(l.start)};width:${wid(l.start, l.end)}" title="on the board ${esc(durText(l.end - l.start))}"></div>`
    const busy = l.busy.map(s => `<div class="busy" style="left:${pct(s.start)};width:${wid(s.start, s.end)};background:${color}" title="busy ${esc(durText(s.end - s.start))}"></div>`).join('')
    const holds = l.holds
      .map(hd => `<div class="hold" style="left:${pct(hd.start)};width:${wid(hd.start, hd.end)}" title="${esc(`${relTo(hd.file, d.folder)} · held ${durText(hd.end - hd.start)} · ${hd.edits} edit(s)`)}"></div>`)
      .join('')
    const marks = l.marks.map(m => `<span class="mark k-${m.kind}" style="left:${pct(m.at)}" title="${esc(`${m.label} · ${iso(m.at).slice(11, 19)} UTC`)}">${GLYPH[m.kind]}</span>`).join('')
    const task = l.tasks[l.tasks.length - 1]?.task
    return (
      `<div class="lane"><div class="lab"><span class="dot" style="background:${color}"></span><b>${esc(l.name)}</b>` +
      `${l.isOpen ? ' <span class="live">live</span>' : ''}${task ? `<small>${esc(task)}</small>` : ''}</div>` +
      `<div class="track">${on}${busy}<div class="holds">${holds}</div>${marks}</div></div>`
    )
  })
  const legend =
    `<div class="legend"><span><i class="sw busy-sw"></i>busy turn</span><span><i class="sw hold-sw"></i>file held</span>` +
    (Object.keys(GLYPH) as Mark['kind'][]).map(k => `<span><b class="k-${k}">${GLYPH[k]}</b> ${k === 'deny' ? 'edit refused' : k}</span>`).join('') +
    '</div>'
  return `<section><h2>Timeline</h2>${axis}${rows.join('')}${legend}</section>`
}

const table = (head: readonly string[], rows: readonly string[][], empty: string) =>
  rows.length === 0
    ? `<p class="empty">${esc(empty)}</p>`
    : `<div class="tw"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`

export function digestHtml(d: Digest): string {
  const t = d.totals
  const share = t.activeMs > 0 ? Math.round((t.overlapMs / t.activeMs) * 100) : 0
  const kpis: [string, string, string][] = [
    ['Agents', String(t.agents), 'sessions on the board'],
    ['Busy time', durText(t.busyMs), 'summed over agents'],
    ['Parallel', durText(t.overlapMs), `${share}% of working time had 2+ agents busy`],
    ['Asks done', `${t.done}/${t.asks}`, `median ${durText(t.medianDoneMs)} to done`],
    ['Time to take', durText(t.medianTakeMs), 'median'],
    ['Refused edits', String(t.denies), `claims that stopped a clip${t.gitWaits > 0 ? ` · ${t.gitWaits} git wait(s)` : ''}`],
    ['Wakes', String(t.wakes), 'urgent asks that woke a session'],
  ]
  const kpiHtml = `<div class="kpis">${kpis.map(([k, v, s]) => `<div class="kpi${k === 'Refused edits' && t.denies > 0 ? ' warn' : ''}"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join('')}</div>`
  const files = table(
    ['File', 'Held by', 'Refused edits'],
    d.files.map(f => [
      `<code>${esc(f.file)}</code>${f.isContested ? ' <span class="tag">contested</span>' : ''}`,
      f.holds.map(hd => `${esc(hd.name)} ${tm(hd.start)}–${tm(hd.end)} <small>(${hd.edits} edit${hd.edits === 1 ? '' : 's'})</small>`).join('<br>') || '–',
      String(f.denies),
    ]),
    'No file was claimed in this window.',
  )
  const asks = table(
    ['Ask', 'From → to', 'What', 'Posted', 'Taken after', 'Done after', 'Outcome'],
    d.asks.map(a => [
      `<code>${esc(a.id)}</code>${a.urgent ? ' <span class="tag">urgent</span>' : ''}`,
      `${esc(a.from)} → ${esc(a.to)}`,
      `${esc(a.text)}${a.note ? `<br><small>note: ${esc(a.note)}</small>` : ''}`,
      tm(a.at),
      a.takeAt !== undefined ? `${durText(a.takeAt - a.at)} <small>by ${esc(a.taker ?? '')}</small>` : '–',
      a.doneAt !== undefined ? `${durText(a.doneAt - a.at)} <small>by ${esc(a.doer ?? '')}</small>` : '–',
      `<span class="o-${a.outcome}">${a.outcome}</span>${a.decliners.length > 0 ? `<br><small>declined by ${esc(a.decliners.join(', '))}</small>` : ''}`,
    ]),
    'No asks in this window.',
  )
  const blocks = table(
    ['When', 'Blocked', 'File', 'Held by'],
    d.blocks.map(b => [tm(b.at), esc(b.who), `<code>${esc(b.file)}</code>`, esc(b.holder)]),
    'No edit was refused in this window: no agent tried to change a file another one held.',
  )
  const wakes = table(
    ['From', 'To', 'Woken', 'Held back', 'Failed'],
    d.wakes.map(w => [esc(w.from), esc(w.to), String(w.sent), String(w.held), String(w.failed)]),
    'No urgent wake in this window.',
  )
  const tasks = d.lanes
    .filter(l => l.tasks.length > 0)
    .map(l => `<li><b>${esc(l.name)}</b><ul>${l.tasks.map(x => `<li>${tm(x.at)} ${esc(x.task)}</li>`).join('')}</ul></li>`)
    .join('')
  const body =
    d.lanes.length === 0
      ? '<p class="empty">No board history in this window. History is written by bws-board 0.2.0 and later while sessions work in this repository.</p>'
      : `${kpiHtml}${timeline(d)}<section><h2>Files held</h2>${files}</section><section><h2>Asks</h2>${asks}</section>` +
        `<section><h2>Refused edits and git waits</h2>${blocks}</section><section><h2>Wakes</h2>${wakes}</section>` +
        (tasks ? `<section><h2>What each worked on</h2><ul class="tasks">${tasks}</ul></section>` : '')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Board digest</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--ink:#1c1c1a;--mute:#6b6b66;--line:#e3e2dd;--track:#efeee9;--hold:#9ca3af;--warn:#dc2626;--ok:#059669;--accent:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1e1e1c;--ink:#ecebe6;--mute:#9a9992;--line:#33322f;--track:#262624;--hold:#6b7280;--warn:#f87171;--ok:#34d399;--accent:#60a5fa}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 48px}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 10px;text-transform:uppercase;letter-spacing:.06em;color:var(--mute)}
.sub{color:var(--mute);margin:0 0 20px;overflow-wrap:anywhere}code{font:12.5px ui-monospace,Consolas,monospace}small{color:var(--mute)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.kpi .k{color:var(--mute);font-size:12px}.kpi .v{font-size:22px;font-weight:650;margin:2px 0}.kpi .s{color:var(--mute);font-size:12px}.kpi.warn .v{color:var(--warn)}
section{margin-top:8px}.lane,.axis{display:grid;grid-template-columns:200px 1fr;gap:10px;align-items:center}.lane{padding:6px 0;border-top:1px solid var(--line)}
.lab{overflow:hidden}.lab b{font-weight:600}.lab small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
.live{font-size:11px;color:var(--ok);border:1px solid var(--ok);border-radius:8px;padding:0 5px}
.track{position:relative;height:40px;background:var(--track);border-radius:6px}.axis .track{height:22px;background:none}.tick{position:absolute;top:2px;transform:translateX(-50%);font-size:11px;color:var(--mute);white-space:nowrap}
.tick:first-child{transform:none}.tick:last-child{transform:translateX(-100%)}
.on{position:absolute;top:0;height:100%;border-left:2px solid var(--line);border-right:2px solid var(--line)}.busy{position:absolute;top:5px;height:14px;border-radius:4px;opacity:.85}
.holds{position:absolute;left:0;right:0;top:24px;height:10px}.hold{position:absolute;height:8px;border-radius:3px;background:var(--hold);opacity:.75}
.mark{position:absolute;top:2px;transform:translateX(-50%);font-size:13px;line-height:18px;font-weight:700;cursor:default;text-shadow:0 0 3px var(--bg)}
.k-deny{color:var(--warn)}.k-done{color:var(--ok)}.k-ask{color:var(--accent)}.k-wake{color:#d97706}
.legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;color:var(--mute);font-size:12px}.sw{display:inline-block;width:14px;height:8px;border-radius:3px;margin-right:5px;vertical-align:middle}.busy-sw{background:var(--accent)}.hold-sw{background:var(--hold)}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}th,td{text-align:left;padding:8px 10px;border-top:1px solid var(--line);vertical-align:top}
th{border-top:0;font-size:12px;color:var(--mute);font-weight:600}.tag{font-size:11px;border:1px solid var(--warn);color:var(--warn);border-radius:8px;padding:0 5px}
.o-done{color:var(--ok)}.o-open,.o-declined{color:var(--warn)}.empty{color:var(--mute)}.tasks li{margin:4px 0}
@media (max-width:640px){.lane,.axis{grid-template-columns:1fr}.axis .lab{display:none}}
</style></head><body><main>
<h1>Board digest</h1>
<p class="sub"><code>${esc(d.folder)}</code> · ${tm(d.from, 'd')} – ${tm(d.to, 'd')} · made ${tm(d.now, 'd')}</p>
${body}
</main>
<script>
for (const t of document.querySelectorAll('time[data-ms]')) {
  const d = new Date(Number(t.dataset.ms))
  const f = t.dataset.f
  t.textContent = f === 'd' ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(f === 's' ? { second: '2-digit' } : {}) })
}
</script>
</body></html>
`
}
