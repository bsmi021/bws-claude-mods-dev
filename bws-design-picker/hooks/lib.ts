// Pure helpers: the mockup spec Claude writes into an option's preview, and the two ways it is drawn
// (terminal cells, SVG for the remote surfaces). No `$` here.

export const PREFIX = 'design:'

export type Shape = 'rect' | 'pill' | 'circle'
export type Block = { x: number; y: number; w: number; h: number; fill?: string; text?: string; ink?: string; shape: Shape }
export type Font = 'sans' | 'serif' | 'mono'
export type Spec = { bg: string; font: Font; palette: string[]; blocks: Block[] }

export type Card = { number: number; label: string; spec: Spec }
export type Gallery = { header: string; cards: Card[] }

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i
const MAX_BLOCKS = 40

/** `#abc` / `abc` / `#aabbcc` -> `#aabbcc`; anything else undefined. */
export function hex(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const m = HEX.exec(v.trim())
  if (!m || m[1] === undefined) return undefined
  const s = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1]
  return '#' + s.toLowerCase()
}

const pct = (v: unknown, dflt: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : dflt
}

/** Reads a `design:{...}` preview. Undefined when it is not one or carries nothing drawable. */
export function parseSpec(preview: unknown): Spec | undefined {
  if (typeof preview !== 'string') return undefined
  const s = preview.trim()
  if (!s.toLowerCase().startsWith(PREFIX)) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(s.slice(PREFIX.length).trim())
  } catch {
    return undefined
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  const blocks: Block[] = []
  for (const b of Array.isArray(o.blocks) ? o.blocks.slice(0, MAX_BLOCKS) : []) {
    if (typeof b !== 'object' || b === null) continue
    const r = b as Record<string, unknown>
    const shape: Shape = r.shape === 'pill' || r.shape === 'circle' ? r.shape : 'rect'
    const text = typeof r.text === 'string' && r.text.trim() ? r.text.trim() : undefined
    const fill = hex(r.fill ?? r.color)
    if (!fill && !text) continue
    blocks.push({ x: pct(r.x, 0), y: pct(r.y, 0), w: pct(r.w, 100), h: pct(r.h, 10), fill, text, ink: hex(r.ink), shape })
  }
  const palette = (Array.isArray(o.palette) ? o.palette : []).map(hex).filter((c): c is string => !!c).slice(0, 8)
  const bg = hex(o.bg) ?? palette[0] ?? '#202020'
  if (blocks.length === 0 && palette.length === 0) return undefined
  const font: Font = o.font === 'serif' || o.font === 'mono' ? o.font : 'sans'
  return { bg, font, palette, blocks }
}

type Question = { header?: unknown; question?: unknown; options?: unknown }
type Option = { label?: unknown; preview?: unknown }

/** One gallery per question that has at least one parsed spec, numbered as the picker numbers its options. */
export function galleries(questions: readonly unknown[]): Gallery[] {
  const out: Gallery[] = []
  for (const q of questions as Question[]) {
    const options = Array.isArray(q?.options) ? (q.options as Option[]) : []
    const cards: Card[] = []
    options.forEach((o, i) => {
      const spec = parseSpec(o?.preview)
      if (spec) cards.push({ number: i + 1, label: typeof o.label === 'string' ? o.label : `Option ${i + 1}`, spec })
    })
    if (cards.length) out.push({ header: String(q.header ?? q.question ?? 'Design'), cards })
  }
  return out
}

/** The questions with every parsed spec dropped from its option, so the native dialog draws words, not JSON. */
export function stripSpecs<T>(questions: readonly T[]): T[] {
  return questions.map(q => {
    const qq = q as Question
    if (!Array.isArray(qq?.options)) return q
    const options = (qq.options as Option[]).map(o => {
      if (!parseSpec(o?.preview)) return o
      const { preview: _drop, ...rest } = o
      return rest
    })
    return { ...q, options }
  })
}

// ---------- colors ----------

const rgb = (h: string): number => parseInt(h.slice(1), 16)

const luminance = (c: number): number => {
  const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255].map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!
}

/** Readable ink over `under`: near-black or near-white. */
export const contrast = (under: number): number => (luminance(under) > 0.4 ? 0x111111 : 0xf5f5f5)

// ---------- terminal: Raster cells ----------

export type Size = { columns: number; rows: number }

const UPPER_HALF = 0x2580
const SPACE = 0x20
const DEFAULT = 0x01000000

const inShape = (b: Block, px: number, py: number, x0: number, y0: number, x1: number, y1: number): boolean => {
  if (b.shape === 'circle') {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2
    const dx = (px + 0.5 - cx) / rx, dy = (py + 0.5 - cy) / ry
    return dx * dx + dy * dy <= 1
  }
  if (b.shape === 'pill' && y1 - y0 >= 2 && x1 - x0 >= 3) {
    const corner = (px === x0 || px === x1 - 1) && (py === y0 || py === y1 - 1)
    return !corner
  }
  return true
}

const box = (b: Block, W: number, H: number) => {
  const x0 = Math.round((b.x / 100) * W)
  const y0 = Math.round((b.y / 100) * H)
  const x1 = Math.max(x0 + 1, Math.min(W, Math.round(((b.x + b.w) / 100) * W)))
  const y1 = Math.max(y0 + 1, Math.min(H, Math.round(((b.y + b.h) / 100) * H)))
  return { x0, y0, x1, y1 }
}

/** Printable width-1 characters only: the Raster refuses a whole tree over one bad code point. */
export const printable = (s: string): string => s.replace(/[^\x20-\x7e]/g, '')

/**
 * The mockup as `columns x rows` cells, two pixels a cell (upper half-block: fg the top pixel, bg the bottom).
 * The last row is the palette strip when the spec has one. Returns the `[codePoint, fg, bg]` words.
 */
export function rasterize(spec: Spec, size: Size): Uint32Array {
  const { columns: W } = size
  const strip = spec.palette.length ? 1 : 0
  const bodyRows = Math.max(1, size.rows - strip)
  const H = bodyRows * 2
  const px = new Uint32Array(W * H).fill(rgb(spec.bg))
  for (const b of spec.blocks) {
    if (!b.fill) continue
    const c = rgb(b.fill)
    const { x0, y0, x1, y1 } = box(b, W, H)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (inShape(b, x, y, x0, y0, x1, y1)) px[y * W + x] = c
  }

  const words = new Uint32Array(W * size.rows * 3)
  const put = (col: number, row: number, cp: number, fg: number, bg: number) => {
    const i = (row * W + col) * 3
    words[i] = cp
    words[i + 1] = fg
    words[i + 2] = bg
  }
  for (let r = 0; r < bodyRows; r++) {
    for (let c = 0; c < W; c++) {
      const top = px[2 * r * W + c]!
      const bot = px[(2 * r + 1) * W + c]!
      if (top === bot) put(c, r, SPACE, DEFAULT, top)
      else put(c, r, UPPER_HALF, top, bot)
    }
  }
  // Text on top, at cell resolution: one line, centred on the block's middle row.
  for (const b of spec.blocks) {
    const text = b.text ? printable(b.text) : ''
    if (!text) continue
    const { x0, y0, x1, y1 } = box(b, W, H)
    const row = Math.min(bodyRows - 1, Math.floor((y0 + y1 - 1) / 4))
    const room = Math.max(1, x1 - x0 - (x1 - x0 >= 4 ? 2 : 0))
    const t = text.slice(0, room)
    const centred = b.shape !== 'rect'
    const start = centred ? x0 + Math.floor((x1 - x0 - t.length) / 2) : x0 + (x1 - x0 >= 4 ? 1 : 0)
    for (let k = 0; k < t.length; k++) {
      const col = start + k
      if (col < 0 || col >= W) continue
      const under = b.fill ? rgb(b.fill) : px[Math.min(H - 1, row * 2) * W + col]!
      const ink = b.ink ? rgb(b.ink) : contrast(under)
      put(col, row, t.charCodeAt(k), ink, under)
    }
  }
  if (strip) {
    const n = spec.palette.length
    for (let c = 0; c < W; c++) {
      const color = spec.palette[Math.min(n - 1, Math.floor((c * n) / W))]!
      put(c, size.rows - 1, SPACE, DEFAULT, rgb(color))
    }
  }
  return words
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64 (kept local so tests and the mod environment agree). */
export function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!, b = bytes[i + 1], c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (b === undefined ? '=' : B64[(n >> 6) & 63]!) + (c === undefined ? '=' : B64[n & 63]!)
  }
  return out
}

/**
 * The engine keeps what wraps its dialog to 12 rows with the dialog counted (siblings as if stacked) and no fixed widths,
 * so the whole gallery is one Raster under one header row: a label row, then the mockups side by side.
 */
export const MAX_ROWS = 11 // ours: header + gallery; the dialog itself takes the twelfth
const GAP = 2

/** Each card's size in `columns`; undefined when the cards would be too narrow to read. */
export function layout(count: number, columns: number): Size | undefined {
  const n = Math.max(1, count)
  const width = Math.min(40, Math.floor((columns - 2 - GAP * (n - 1)) / n))
  if (width < 12) return undefined
  const rows = Math.max(5, Math.min(MAX_ROWS - 2, Math.round(width * 0.3) + 1))
  return { columns: width, rows }
}

export type GalleryCells = Size & { cells: string }

/** The gallery as one Raster's props: `N. Label` over each mockup, default colors between. */
export function galleryCells(cards: readonly Card[], columns: number): GalleryCells | undefined {
  const card = layout(cards.length, columns)
  if (!card) return undefined
  const W = cards.length * card.columns + GAP * (cards.length - 1)
  const rows = card.rows + 1
  const words = new Uint32Array(W * rows * 3)
  for (let i = 0; i < W * rows; i++) words.set([SPACE, DEFAULT, DEFAULT], i * 3)
  cards.forEach((c, k) => {
    const left = k * (card.columns + GAP)
    const label = printable(`${c.number}. ${c.label}`).slice(0, card.columns)
    for (let j = 0; j < label.length; j++) words.set([label.charCodeAt(j), DEFAULT, DEFAULT], (left + j) * 3)
    const art = rasterize(c.spec, card)
    for (let r = 0; r < card.rows; r++) {
      words.set(art.subarray(r * card.columns * 3, (r + 1) * card.columns * 3), ((r + 1) * W + left) * 3)
    }
  })
  return { columns: W, rows, cells: toBase64(new Uint8Array(words.buffer)) }
}

// ---------- remote surfaces: SVG ----------

const FONTS: Record<Font, string> = {
  sans: 'system-ui, -apple-system, Segoe UI, sans-serif',
  serif: 'Georgia, Times New Roman, serif',
  mono: 'Consolas, Menlo, monospace',
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const css = (c: number) => '#' + c.toString(16).padStart(6, '0')

/** The mockup as a 320x200 SVG, palette strip beneath; `place` positions it inside another svg. */
export function toSvg(spec: Spec, place = ''): string {
  const W = 320, H = 200
  const strip = spec.palette.length ? 14 : 0
  const parts: string[] = [`<rect width="${W}" height="${H}" fill="${spec.bg}"/>`]
  for (const b of spec.blocks) {
    const x = (b.x / 100) * W, y = (b.y / 100) * H, w = (b.w / 100) * W, h = (b.h / 100) * H
    if (b.fill) {
      if (b.shape === 'circle') parts.push(`<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${b.fill}"/>`)
      else parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${b.shape === 'pill' ? Math.min(h / 2, 12) : 2}" fill="${b.fill}"/>`)
    }
    if (b.text) {
      const size = Math.max(7, Math.min(22, h * 0.55))
      const ink = b.ink ?? css(contrast(rgb(b.fill ?? spec.bg)))
      const centred = b.shape !== 'rect'
      const tx = centred ? x + w / 2 : x + 4
      parts.push(
        `<text x="${tx}" y="${y + h / 2}" fill="${ink}" font-size="${size.toFixed(1)}" dominant-baseline="middle"${centred ? ' text-anchor="middle"' : ''}>${esc(b.text)}</text>`,
      )
    }
  }
  spec.palette.forEach((c, i) => {
    const w = W / spec.palette.length
    parts.push(`<rect x="${(i * w).toFixed(2)}" y="${H}" width="${(w + 0.5).toFixed(2)}" height="${strip}" fill="${c}"/>`)
  })
  return `<svg xmlns="http://www.w3.org/2000/svg"${place} viewBox="0 0 ${W} ${H + strip}" font-family="${FONTS[spec.font]}"><g>${parts.join('')}</g></svg>`
}

/** The gallery as one SVG: `N. Label` over each 320x214 mockup, side by side. */
export function gallerySvg(cards: readonly Card[]): { source: string; width: number } {
  const CW = 320, CH = 214, LABEL = 26, G = 16
  const W = cards.length * CW + G * (cards.length - 1)
  const parts = cards.map((c, k) => {
    const x = k * (CW + G)
    return (
      `<text x="${x}" y="18" fill="#9ca3af" font-size="16" font-family="${FONTS.sans}">${esc(`${c.number}. ${c.label}`)}</text>` +
      toSvg(c.spec, ` x="${x}" y="${LABEL}" width="${CW}" height="${CH}"`)
    )
  })
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${CH + LABEL}">${parts.join('')}</svg>`,
    width: Math.min(W, cards.length * 260),
  }
}

// ---------- the system prompt section ----------

export const SECTION = [
  'When you ask the user to choose a visual or design direction (style, palette, layout, theme, look and feel, UI mockup),',
  'ask with AskUserQuestion and give every option a `preview` of `design:` followed by one-line JSON; the bws-design-picker',
  'plugin draws it as a mockup above the picker:',
  '{"bg":"#hex","font":"sans|serif|mono","palette":["#hex",...max 6],"blocks":[{"x":0,"y":0,"w":100,"h":12,"fill":"#hex","text":"Title","ink":"#hex","shape":"rect|pill|circle"}]}',
  'x, y, w, h are percent of a 16:10 frame. Use 5-15 blocks to sketch that direction\'s real layout (nav, hero, cards, buttons)',
  'in its own colours; keep text short. Label and description stay in words. Ask one design question per call.',
].join(' ')
