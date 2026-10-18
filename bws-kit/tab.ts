// A mod's dashboard tab ({ plugin, key: 'tab' }): bws-cockpit draws it in its dashboard pane, next to Assumptions,
// Shelf and Board, so every mod is found in one place. Pure: no `$`.
//
// The tab is plain data. Cockpit knows nothing mod-specific: it draws these nodes, and sends a press or a submitted
// input back as a `TabEvent` in its own `{ plugin: 'bws-cockpit', key: 'tabEvent' }` atom, which the mod reads with a
// `state.set` hook filtered to its own plugin name. `raise` counts up when the mod has news: cockpit then brings the
// tab up (unless the person is using the pane or closed it). A mod that needs the dashboard at once, as the person's
// own open, sets `raise` and calls `$.ui.open({ id: DASHBOARD })` itself: pane drawing matches by id across plugins.
// `show` counts up when the person asked for the tab (a mod's own command): cockpit switches to it even if they had
// closed the dashboard; the mod opens the pane itself from that command, so the open is the person's.

export const DASHBOARD = 'dashboard'

export type TabTone = 'idle' | 'busy' | 'ok' | 'warn' | 'bad'
export const TAB_TONES: readonly TabTone[] = ['idle', 'busy', 'ok', 'warn', 'bad']

export type TabColor = 'ok' | 'warn' | 'bad' | 'accent'
const COLORS: readonly TabColor[] = ['ok', 'warn', 'bad', 'accent']

export type TabButton = { id: string; label: string; isPrimary?: boolean }

export type TabNode =
  | { kind: 'text'; text: string; color?: TabColor; isDim?: boolean; isBold?: boolean; isClipped?: boolean }
  | { kind: 'buttons'; items: TabButton[] }
  | { kind: 'input'; id: string; placeholder: string }
  | { kind: 'raster'; columns: number; rows: number; cells: string }
  | { kind: 'card'; title: string; color?: TabColor; body: TabNode[] }

export type ModTab = {
  title: string // the tab's label: "Diagram"
  badge: string // short text after the label ("3", "on"), or empty
  tone: TabTone // colours the badge; 'idle' draws it dim
  body: TabNode[]
  raise: number // counts up for news that should bring the tab up
  show?: number // counts up when the person asked for this tab
}

// A press (`id`, no value) or a submitted input (`id` and its text). `seq` counts up per cockpit process.
export type TabEvent = { seq: number; plugin: string; id: string; value?: string }

const MAX_TITLE = 24
const MAX_BADGE = 16
const MAX_TEXT = 2000
const MAX_ID = 64
const MAX_NODES = 200
const MAX_CELLS = 400_000

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const line = (v: unknown, max: number) => str(v, max * 2).replace(/\s+/g, ' ').trim().slice(0, max)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const color = (v: unknown): TabColor | undefined => (COLORS.includes(v as TabColor) ? (v as TabColor) : undefined)
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const id = (v: unknown) => (typeof v === 'string' && /^[\w:.-]{1,64}$/.test(v) ? v : '')

export const makeTab = (title: string, body: TabNode[], o: { badge?: string; tone?: TabTone; raise?: number; show?: number } = {}): ModTab => {
  const t: ModTab = { title: line(title, MAX_TITLE), badge: line(o.badge ?? '', MAX_BADGE), tone: o.tone ?? 'idle', body, raise: o.raise ?? 0 }
  if (o.show) t.show = o.show
  return t
}

export const text = (t: string, o: { color?: TabColor; isDim?: boolean; isBold?: boolean; isClipped?: boolean } = {}): TabNode => ({ kind: 'text', text: t, ...o })
export const buttons = (...items: TabButton[]): TabNode => ({ kind: 'buttons', items })
export const card = (title: string, body: TabNode[], c?: TabColor): TabNode => (c ? { kind: 'card', title, color: c, body } : { kind: 'card', title, body })

// Reads whatever another plugin wrote under `tab`. Anything malformed is dropped (a broken node is skipped, a broken
// tab is null), so one mod can never fail the dashboard. Sizes are capped.
export function parseTab(v: unknown): ModTab | null {
  if (!isObj(v)) return null
  const title = line(v.title, MAX_TITLE)
  if (!title) return null
  const budget = { nodes: MAX_NODES, cells: MAX_CELLS }
  const t: ModTab = {
    title,
    badge: line(v.badge, MAX_BADGE),
    tone: TAB_TONES.includes(v.tone as TabTone) ? (v.tone as TabTone) : 'idle',
    body: parseNodes(v.body, budget, 0),
    raise: count(v.raise),
  }
  if (count(v.show) > 0) t.show = count(v.show)
  return t
}

function parseNodes(v: unknown, budget: { nodes: number; cells: number }, depth: number): TabNode[] {
  if (!Array.isArray(v)) return []
  const out: TabNode[] = []
  for (const n of v) {
    if (budget.nodes <= 0) break
    const node = parseNode(n, budget, depth)
    if (node) {
      out.push(node)
      budget.nodes--
    }
  }
  return out
}

function parseNode(n: unknown, budget: { nodes: number; cells: number }, depth: number): TabNode | null {
  if (!isObj(n)) return null
  if (n.kind === 'text') {
    const node: TabNode = { kind: 'text', text: str(n.text, MAX_TEXT) }
    const c = color(n.color)
    if (c) node.color = c
    if (n.isDim === true) node.isDim = true
    if (n.isBold === true) node.isBold = true
    if (n.isClipped === true) node.isClipped = true
    return node
  }
  if (n.kind === 'buttons' && Array.isArray(n.items)) {
    const items: TabButton[] = []
    for (const b of n.items.slice(0, 12)) {
      if (!isObj(b) || !id(b.id) || !line(b.label, 40)) continue
      items.push(b.isPrimary === true ? { id: id(b.id), label: line(b.label, 40), isPrimary: true } : { id: id(b.id), label: line(b.label, 40) })
    }
    return items.length > 0 ? { kind: 'buttons', items } : null
  }
  if (n.kind === 'input' && id(n.id)) return { kind: 'input', id: id(n.id), placeholder: line(n.placeholder, 80) }
  if (n.kind === 'raster') {
    const cols = Number(n.columns)
    const rows = Number(n.rows)
    const cells = str(n.cells, MAX_CELLS)
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols > 400 || rows > 200) return null
    if (cells.length === 0 || cells.length > budget.cells) return null
    budget.cells -= cells.length
    return { kind: 'raster', columns: cols, rows, cells }
  }
  if (n.kind === 'card' && depth === 0) {
    const node: TabNode = { kind: 'card', title: line(n.title, 80), body: parseNodes(n.body, budget, depth + 1) }
    const c = color(n.color)
    if (c) node.color = c
    return node
  }
  return null
}

export function parseEvent(v: unknown): TabEvent | null {
  if (!isObj(v) || typeof v.seq !== 'number' || typeof v.plugin !== 'string' || !id(v.id)) return null
  const e: TabEvent = { seq: v.seq, plugin: v.plugin, id: id(v.id) }
  if (typeof v.value === 'string') e.value = v.value.slice(0, MAX_TEXT)
  return e
}

// The tab as plain text, for /dashboard headless and the mobile fallback.
export function tabText(t: ModTab): string {
  const head = t.badge ? `${t.title} (${t.badge})` : t.title
  return [head, ...nodeLines(t.body, '')].join('\n')
}

function nodeLines(nodes: readonly TabNode[], indent: string): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.kind === 'text') out.push(`${indent}${n.text}`)
    else if (n.kind === 'buttons') out.push(`${indent}[${n.items.map(b => b.label).join('] [')}]`)
    else if (n.kind === 'card') out.push(`${indent}${n.title}`, ...nodeLines(n.body, `${indent}  `))
    else if (n.kind === 'raster') out.push(`${indent}(picture ${n.columns}x${n.rows}, shown in the dashboard)`)
  }
  return out
}
