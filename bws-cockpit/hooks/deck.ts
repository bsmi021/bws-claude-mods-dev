// The Assumptions deck: a Client surface module (no `$`) the dashboard's Assumptions tab draws on the terminal and
// Desktop. One card at a time, heaviest first: what Claude assumed, why, and its blast radius (the edits and files built
// on it since). ← or a drag left marks it Wrong and opens an inline "Instead:" line (Enter sends it flying left); → or a
// drag right marks it Right and flies it off right; ↑↓ browse, u takes a verdict back, s sends the judged ones to Claude.
// A card glows while an edit lands on it. It posts judge / fix / send to the hooks module (`ui.message`). The step
// functions are pure and exported for the tests.
import type { ClientKeyEvent, ClientPointerEvent, ClientSurface, RenderElement } from 'claude-code'

export type CardVerdict = 'open' | 'right' | 'wrong'
export type Card = { n: number; text: string; why: string; verdict: CardVerdict; correction: string; edits: number; files: string[]; bumped: number }
export type DeckProps = { cards: Card[]; sent: number }
export type Fly = { card: Card; dir: -1 | 1; f: number }
export type DeckState = { cur: number | null; fly: Fly | null; dragX: number | null; dx: number; edit: string | null; tick: number }
export type DeckPost = { op: 'judge'; n: number; verdict: CardVerdict } | { op: 'fix'; n: number; text: string } | { op: 'send' }
export type Step = { s: DeckState; post?: DeckPost }

export const FLY_FRAMES = 7
export const DRAG_AT = 6 // columns a drag must travel to judge
export const GLOW_MS = 1500
export const TICK_MS = 60
export const CARD_MAX = 64
export const BAR = 12

export const START: DeckState = { cur: null, fly: null, dragX: null, dx: 0, edit: null, tick: 0 }

// The card shown: the one browsed to while it is in the deck, else the first still to judge, else the first.
export function current(cards: readonly Card[], cur: number | null): Card | null {
  return cards.find(c => c.n === cur) ?? cards.find(c => c.verdict === 'open') ?? cards[0] ?? null
}

// After judging `n`: the next card still to judge, going round from it; null when none is left.
export function nextOpen(cards: readonly Card[], n: number): number | null {
  const at = Math.max(0, cards.findIndex(c => c.n === n))
  for (let i = 1; i <= cards.length; i++) {
    const c = cards[(at + i) % cards.length]
    if (c && c.n !== n && c.verdict === 'open') return c.n
  }
  return null
}

function browse(cards: readonly Card[], cur: number | null, by: 1 | -1): number | null {
  const c = current(cards, cur)
  if (!c || cards.length === 0) return null
  const at = cards.findIndex(x => x.n === c.n)
  return cards[(at + by + cards.length) % cards.length]?.n ?? null
}

const right = (s: DeckState, cards: readonly Card[], c: Card): Step => ({
  s: { ...s, fly: { card: { ...c, verdict: 'right' }, dir: 1, f: 0 }, cur: nextOpen(cards, c.n), edit: null, dragX: null, dx: 0 },
  post: { op: 'judge', n: c.n, verdict: 'right' },
})

const wrong = (s: DeckState, c: Card): Step => ({
  s: { ...s, cur: c.n, edit: c.correction, dragX: null, dx: 0 },
  post: { op: 'judge', n: c.n, verdict: 'wrong' },
})

const SPECIAL = new Set(['up', 'down', 'left', 'right', 'tab', 'pageup', 'pagedown', 'home', 'end', 'escape', 'insert', 'delete'])

export function keyStep(s: DeckState, k: ClientKeyEvent, cards: readonly Card[]): Step {
  const c = current(cards, s.cur)
  if (!c) return k.key === 's' ? { s, post: { op: 'send' } } : { s }
  if (s.edit !== null) {
    // Typing the correction: Enter saves it (empty: Claude asks) and flies the card off left.
    if (k.key === 'return' || k.key === 'enter') {
      const card = { ...c, verdict: 'wrong' as const, correction: s.edit }
      return { s: { ...s, edit: null, fly: { card, dir: -1, f: 0 }, cur: nextOpen(cards, c.n) }, post: { op: 'fix', n: c.n, text: s.edit.trim() } }
    }
    if (k.key === 'backspace') return { s: { ...s, edit: [...s.edit].slice(0, -1).join('') } }
    if (k.ctrl && k.key === 'u') return { s: { ...s, edit: '' } }
    if (k.key === 'up' || k.key === 'down') return { s: { ...s, edit: null, cur: browse(cards, c.n, k.key === 'up' ? -1 : 1) } }
    if (k.ctrl || k.meta || SPECIAL.has(k.key) || /^f\d{1,2}$/.test(k.key)) return { s }
    if (k.key === 'space') return { s: { ...s, edit: `${s.edit} ` } }
    return { s: { ...s, edit: s.edit + k.key.replace(/[\r\n]/g, '') } }
  }
  switch (k.key) {
    case 'left':
    case 'h':
    case 'w':
      return wrong(s, c)
    case 'right':
    case 'l':
    case 'r':
      return right(s, cards, c)
    case 'up':
    case 'k':
      return { s: { ...s, cur: browse(cards, c.n, -1) } }
    case 'down':
    case 'j':
      return { s: { ...s, cur: browse(cards, c.n, 1) } }
    case 'e':
    case 'return':
    case 'enter':
      return c.verdict === 'wrong' ? { s: { ...s, cur: c.n, edit: c.correction } } : { s }
    case 'u':
      return { s: { ...s, cur: c.n }, post: { op: 'judge', n: c.n, verdict: 'open' } }
    case 's':
      return { s, post: { op: 'send' } }
    default:
      return { s }
  }
}

// Drag the card: it follows the pointer; let go past DRAG_AT columns either side to judge it.
export function pointerStep(s: DeckState, p: ClientPointerEvent, cards: readonly Card[]): Step {
  if (s.edit !== null || s.fly !== null) return { s }
  if (p.type === 'down' && p.button === 'left') return { s: { ...s, dragX: p.x, dx: 0 } }
  if (p.type === 'move' && s.dragX !== null && p.button !== undefined) return { s: { ...s, dx: p.x - s.dragX } }
  if (p.type === 'up' && s.dragX !== null) {
    const c = current(cards, s.cur)
    const done = { ...s, dragX: null, dx: 0 }
    if (!c) return { s: done }
    if (s.dx <= -DRAG_AT) return wrong(done, c)
    if (s.dx >= DRAG_AT) return right(done, cards, c)
    return { s: done }
  }
  return { s }
}

export const isGlowing = (c: Card, now: number) => c.bumped > 0 && now - c.bumped < GLOW_MS

// One frame of the clock: the flying card moves on; a glowing card needs a redraw to fade. Null: nothing to draw.
export function tickStep(s: DeckState, cards: readonly Card[], now: number): DeckState | null {
  if (s.fly) return { ...s, fly: s.fly.f + 1 >= FLY_FRAMES ? null : { ...s.fly, f: s.fly.f + 1 }, tick: s.tick + 1 }
  if (cards.some(c => isGlowing(c, now))) return { ...s, tick: s.tick + 1 }
  return null
}

// Where the card sits: centred, pushed `offset` columns; past an edge it is cut, not wrapped.
export function place(columns: number, offset: number): { left: number; width: number } {
  const width = Math.min(Math.max(columns, 8), CARD_MAX)
  const left = Math.floor((columns - width) / 2) + offset
  if (left < 0) return { left: 0, width: Math.max(4, width + left) }
  return { left, width: Math.max(4, Math.min(width, columns - left)) }
}

// The fly accelerates: 0, 1, 4, 10, 17, 27, 38…
export const flyOffset = (f: number, dir: -1 | 1) => dir * Math.round(f * f * 1.1)

export function bar(edits: number, max: number): string {
  const k = max <= 0 || edits <= 0 ? 0 : Math.max(1, Math.round((edits / max) * BAR))
  return '▓'.repeat(k) + '░'.repeat(BAR - k)
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

let latest: Card[] = [] // the props of the last draw, for the clock (one deck per dashboard)

export default function AssumptionDeck(props: unknown, surface: ClientSurface<DeckState>): RenderElement {
  const { Box, Text } = surface.elements
  const p = (props ?? {}) as Partial<DeckProps>
  const cards = Array.isArray(p.cards) ? p.cards : []
  latest = cards
  if (surface.state === undefined) {
    const apply = (st: Step) => {
      if (st.post) surface.post(st.post)
      surface.setState(st.s)
    }
    surface.onKey(k => apply(keyStep(surface.state ?? START, k, latest)))
    surface.onPointer(e => apply(pointerStep(surface.state ?? START, e, latest)))
    surface.every(TICK_MS, () => {
      const next = tickStep(surface.state ?? START, latest, Date.now())
      if (next) surface.setState(next)
    })
    surface.setState(START)
  }
  const s = surface.state ?? START
  const columns = surface.columns > 0 ? surface.columns : CARD_MAX
  const now = Date.now()
  const open = cards.filter(c => c.verdict === 'open').length
  const judged = cards.length - open
  const shown = current(cards, s.cur)
  const max = cards.reduce((m, c) => Math.max(m, c.edits), 0)

  const head = Box({
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: columns,
    children: [
      Text({ bold: true, children: `⚑ ${open} to judge · ${judged} judged${p.sent ? ` · ${p.sent} sent` : ''}` }),
      Box({
        flexDirection: 'row',
        children: cards.slice(0, 40).map(c =>
          Text({
            color: c.verdict === 'right' ? 'success' : c.verdict === 'wrong' ? 'error' : c.n === shown?.n ? 'claude' : undefined,
            dimColor: c.verdict === 'open' && c.n !== shown?.n,
            children: c.n === shown?.n ? '◆' : c.verdict === 'open' ? '○' : '●',
          }),
        ),
      }),
    ],
  })

  if (!shown && !s.fly) {
    return Box({
      flexDirection: 'column',
      children: [
        head,
        Box({
          borderStyle: 'round',
          borderColor: 'success',
          paddingX: 1,
          marginLeft: place(columns, 0).left,
          width: place(columns, 0).width,
          children: [Text({ color: 'success', children: '✓ Nothing to judge. Claude deals a card here each time it assumes something.' })],
        }),
      ],
    })
  }

  // Everything judged and nothing browsed to: say so, and what s does.
  if (!s.fly && open === 0 && s.cur === null) {
    const wrongs = cards.filter(c => c.verdict === 'wrong').length
    return Box({
      flexDirection: 'column',
      children: [
        head,
        Box({
          borderStyle: 'round',
          borderColor: 'success',
          paddingX: 1,
          marginLeft: place(columns, 0).left,
          width: place(columns, 0).width,
          children: [
            Text({ bold: true, color: 'success', children: `✓ All judged: ${judged - wrongs} right, ${wrongs} wrong` }),
            Text({ dimColor: true, children: 's sends them to Claude · ↑↓ to look again' }),
          ],
        }),
      ],
    })
  }

  const card = s.fly ? s.fly.card : (shown as Card)
  const isEditing = s.edit !== null && !s.fly && card.n === shown?.n
  const offset = s.fly ? flyOffset(s.fly.f + 1, s.fly.dir) : s.dragX !== null ? s.dx : 0
  const { left, width } = place(columns, offset)
  const glow = isGlowing(card, now)
  const lean = !s.fly && s.dragX !== null ? (s.dx <= -DRAG_AT ? 'wrong' : s.dx >= DRAG_AT ? 'right' : null) : null
  const verdict = isEditing ? 'wrong' : card.verdict
  const border = lean === 'wrong' ? 'error' : lean === 'right' ? 'success' : glow ? 'warning' : verdict === 'wrong' ? 'error' : verdict === 'right' ? 'success' : 'claude'
  const at = cards.findIndex(c => c.n === card.n)
  const isDim = s.fly !== null
  const fix = isEditing ? (s.edit ?? '') : card.correction

  const body = [
    Box({
      key: 'title',
      flexDirection: 'row',
      justifyContent: 'space-between',
      children: [
        Text({ wrap: 'truncate-end', children: [Text({ bold: true, children: `A${card.n}` }), Text({ dimColor: true, children: ` · ${plural(card.edits, 'edit')} · ${plural(card.files.length, 'file')}` })] }),
        Text({ dimColor: true, children: at >= 0 ? `${at + 1}/${cards.length}` : '' }),
      ],
    }),
    Text({ wrap: 'wrap', bold: !isDim, dimColor: isDim, children: card.text }),
    ...(card.why !== '' ? [Text({ wrap: 'wrap', dimColor: true, children: `why: ${card.why}` })] : []),
    Text({
      color: glow ? 'warning' : card.edits > 0 ? 'claude' : undefined,
      dimColor: card.edits === 0,
      children: `${bar(card.edits, max)} ${glow ? 'building on it now' : card.edits > 0 ? 'built on it' : 'nothing built on it yet'}`,
    }),
    ...(card.files.length > 0 ? [Text({ wrap: 'truncate-start', dimColor: true, children: card.files.join('  ') })] : []),
    ...(verdict === 'wrong'
      ? [
          isEditing || fix !== ''
            ? Text({ wrap: 'wrap', color: 'error', children: `Instead: ${fix}${isEditing ? '▌' : ''}` })
            : Text({ dimColor: true, children: 'Instead: (e to type it; left empty, Claude asks you)' }),
        ]
      : []),
    ...(lean ? [Text({ bold: true, color: lean === 'wrong' ? 'error' : 'success', children: lean === 'wrong' ? '← WRONG' : 'RIGHT →' })] : []),
  ]

  // The cards still under this one, drawn as edges peeking out below it.
  const under = Math.min(2, Math.max(0, open - (card.verdict === 'open' && !s.fly ? 1 : 0)))
  const home = place(columns, 0)
  const edges = Array.from({ length: under }, (_, i) => {
    const inset = (i + 1) * 2
    return Text({ dimColor: true, children: `${' '.repeat(home.left + inset)}╰${'─'.repeat(Math.max(0, home.width - 2 - inset * 2))}╯` })
  })

  const hint = isEditing
    ? 'type what it should be · Enter sends it off · ↑↓ leave it'
    : '← wrong · → right · ↑↓ browse · u undo · s send · or drag the card (click it first for keys)'

  return Box({
    flexDirection: 'column',
    children: [
      head,
      Box({ key: 'card', flexDirection: 'column', borderStyle: 'round', borderColor: border, paddingX: 1, marginLeft: left, width, children: body }),
      ...edges,
      Text({ dimColor: true, wrap: 'truncate-end', children: hint }),
    ],
  })
}
