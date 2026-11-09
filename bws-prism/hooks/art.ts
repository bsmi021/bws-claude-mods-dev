// The looks and the terminal's frames. Pure: a frame depends only on the look, the time and the size.
import { toBase64 } from './kit/raster'

export const SCENES = ['plasma', 'horizon', 'tunnel', 'lava'] as const
export type Scene = (typeof SCENES)[number]

// Dark to bright: every scene reads its colors off one ramp, so a palette restyles all of them.
export const PALETTES = [
  { name: 'neon', stops: ['#07021a', '#3a0ca3', '#f72585', '#4cc9f0', '#f4fbff'] },
  { name: 'ember', stops: ['#0b0202', '#6a040f', '#e85d04', '#ffba08', '#fff8e0'] },
  { name: 'aurora', stops: ['#020617', '#0f4c75', '#00b894', '#a29bfe', '#f1fff8'] },
  { name: 'vapor', stops: ['#120029', '#7209b7', '#ff6ec7', '#ffd6a5', '#9bf6ff'] },
] as const
export type Palette = (typeof PALETTES)[number]

export type Look = { scene: Scene; palette: Palette }

// Raster paints 1024 distinct color pairs at once. 32 levels is exactly that many, so a scene never falls to "nearest".
export const LEVELS = 32

const channels = (hex: string): number[] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

/** `n` colors (0xRRGGBB) evenly along the stops. */
export function ramp(stops: readonly string[], n = LEVELS): number[] {
  const parts = stops.map(channels)
  return Array.from({ length: n }, (_, i) => {
    const at = (i / (n - 1)) * (parts.length - 1)
    const low = Math.min(parts.length - 2, Math.floor(at))
    const f = at - low
    const [r, g, b] = [0, 1, 2].map(c => Math.round(parts[low]![c]! + (parts[low + 1]![c]! - parts[low]![c]!) * f))
    return (r! << 16) | (g! << 8) | b!
  })
}

export const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

// ---------- the scenes: each gives a pixel its brightness, 0 to 1 ----------

type Shader = (x: number, y: number, t: number, W: number, H: number) => number

const fract = (v: number): number => v - Math.floor(v)
const noise = (x: number, y: number): number => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453)

const plasma: Shader = (x, y, t, W, H) => {
  const nx = (x / H) * 24
  const ny = (y / H) * 24
  const cx = nx - (W / H) * 12 - Math.sin(t * 0.4) * 6
  const cy = ny - 12 - Math.cos(t * 0.3) * 5
  const v = Math.sin(nx * 0.45 + t) + Math.sin(ny * 0.55 - t * 1.3) + Math.sin((nx + ny) * 0.3 + t * 0.7) + Math.sin(Math.sqrt(cx * cx + cy * cy) * 0.7 - t * 1.5)
  return (v + 4) / 8
}

const horizon: Shader = (x, y, t, W, H) => {
  const line = H * 0.58
  const cx = W / 2
  if (y < line) {
    const sunY = line * 0.74
    const radius = line * 0.62
    const dx = x - cx
    const dy = y - sunY
    if (dx * dx + dy * dy < radius * radius) {
      const low = dy / radius // the lower half is cut by bands that slide down
      const isCut = low > 0 && fract(y * 0.28 - t * 0.5) < 0.2 + low * 0.45
      if (!isCut) return 1 - ((dy + radius) / (2 * radius)) * 0.5
    }
    if (noise(x, y) > 0.985) return 0.55 + 0.45 * Math.abs(Math.sin(t * 2 + x))
    return 0.04 + 0.36 * (y / line) ** 2
  }
  const z = (y - line + 1) / (H - line)
  const depth = 1 / z
  // Lines are measured in pixels, or the far grid samples to speckle. Where they are under 3 pixels apart they read as haze.
  const toLine = (v: number): number => Math.abs(fract(v + 0.5) - 0.5)
  const halfWidth = 0.5 + 0.5 * z
  const rungStep = 1.6 / (z * z * (H - line)) // cycles per pixel, and below for the rays
  const rayStep = depth * (5 / H)
  const isRung = rungStep < 1 / 3 && toLine(depth * 1.6 + t * 0.9) / rungStep < halfWidth
  const isRay = rayStep < 1 / 3 && toLine((x - cx) * rayStep) / rayStep < halfWidth
  if (isRung || isRay) return 0.55 + 0.4 * z
  return rungStep >= 1 / 3 ? 0.34 - 0.5 * z : 0.03 + 0.08 * z
}

const tunnel: Shader = (x, y, t, W, H) => {
  const dx = x - W / 2 - Math.sin(t * 0.6) * W * 0.08
  const dy = y - H / 2 - Math.cos(t * 0.5) * H * 0.1
  const r = Math.sqrt(dx * dx + dy * dy) + 0.5
  const u = (H * 1.4) / r + t * 1.8
  const v = (Math.atan2(dy, dx) / Math.PI) * 5 + t * 0.35
  const isLight = (Math.floor(u) + Math.floor(v)) % 2 === 0
  const fade = Math.min(1, r / (H * 0.42))
  return (isLight ? 0.3 + 0.7 * fract(u) : 0.08 + 0.18 * fract(v)) * fade
}

const lava: Shader = (x, y, t, W, H) => {
  let field = 0
  for (let i = 0; i < 6; i++) {
    const bx = W * (0.5 + 0.42 * Math.sin(t * (0.31 + i * 0.07) + i * 2.1))
    const by = H * (0.5 + 0.42 * Math.cos(t * (0.43 + i * 0.05) + i * 1.3))
    const radius = H * (0.13 + 0.03 * i)
    field += (radius * radius) / ((x - bx) ** 2 + (y - by) ** 2 + 1)
  }
  return field > 1 ? Math.min(1, 0.5 + (field - 1) * 0.35) : 0.04 + 0.34 * field ** 2
}

const SHADERS: Record<Scene, Shader> = { plasma, horizon, tunnel, lava }

// ---------- what lies over a scene ----------

// Three columns by five rows, top row first; a set bit is a lit pixel.
const GLYPHS = [
  [0b111, 0b101, 0b111, 0b100, 0b100], // P
  [0b110, 0b101, 0b110, 0b101, 0b101], // R
  [0b111, 0b010, 0b010, 0b010, 0b111], // I
  [0b011, 0b100, 0b010, 0b001, 0b110], // S
  [0b101, 0b111, 0b111, 0b101, 0b101], // M
]
const SHADOW = 0x05030f

function drawLogo(px: Uint32Array, W: number, H: number, colors: number[], t: number) {
  const scale = W >= 70 && H >= 30 ? 2 : 1
  const width = (GLYPHS.length * 4 - 1) * scale
  if (W < width + 4 || H < 5 * scale + 3) return
  const put = (x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = c
  }
  const fill = (x: number, y: number, c: number) => {
    for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) put(x + a, y + b, c)
  }
  for (const pass of ['shadow', 'ink'] as const) {
    GLYPHS.forEach((rows, g) => {
      rows.forEach((bits, row) => {
        for (let col = 0; col < 3; col++) {
          if (!((bits >> (2 - col)) & 1)) continue
          const x = 2 + (g * 4 + col) * scale
          const y = 2 + row * scale
          if (pass === 'shadow') fill(x + 1, y + 1, SHADOW)
          else fill(x, y, colors[Math.floor(LEVELS * 0.55 + (LEVELS * 0.44 * (Math.sin(t * 2 - x * 0.2) + 1)) / 2)]!)
        }
      })
    })
  }
}

function drawBars(px: Uint32Array, W: number, H: number, colors: number[], t: number) {
  const room = Math.min(12, Math.floor(H / 4))
  if (room < 2) return
  for (let bar = 0; bar * 3 + 1 < W; bar++) {
    const level = ((Math.sin(bar * 0.7 + t * 3) + 1) / 2) * ((Math.sin(bar * 0.23 - t * 1.7) + 1) / 2)
    const height = Math.max(1, Math.round(level * room))
    for (let up = 0; up < height; up++) {
      const c = up === height - 1 ? colors[LEVELS - 1]! : colors[Math.floor(LEVELS * 0.45 + (up / room) * LEVELS * 0.5)]!
      for (let side = 0; side < 2; side++) px[(H - 1 - up) * W + bar * 3 + side] = c
    }
  }
}

// ---------- the terminal's frame ----------

const UPPER_HALF = 0x2580
const SPACE = 0x20
const DEFAULT = 0x01000000

/** The picture, two pixels to a cell: `columns` by `rows * 2` colors, row-major. */
export function pixels(look: Look, t: number, columns: number, rows: number, colors = ramp(look.palette.stops)): Uint32Array {
  const W = columns
  const H = rows * 2
  const shade = SHADERS[look.scene]
  const px = new Uint32Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const level = Math.floor(shade(x, y, t, W, H) * LEVELS)
      px[y * W + x] = colors[Math.max(0, Math.min(LEVELS - 1, level))]!
    }
  }
  drawBars(px, W, H, colors, t)
  drawLogo(px, W, H, colors, t)
  return px
}

/** One frame as `Raster` / `$.ui.blit` take it: upper half-blocks, foreground the top pixel, background the bottom. */
export function rasterFrame(look: Look, t: number, columns: number, rows: number) {
  const px = pixels(look, t, columns, rows)
  const words = new Uint32Array(columns * rows * 3)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const top = px[2 * r * columns + c]!
      const bottom = px[(2 * r + 1) * columns + c]!
      const at = (r * columns + c) * 3
      words[at] = top === bottom ? SPACE : UPPER_HALF
      words[at + 1] = top === bottom ? DEFAULT : top
      words[at + 2] = bottom
    }
  }
  return { columns, rows, cells: toBase64(new Uint8Array(words.buffer)) }
}

// The rows of the pane that are not art: title, status and buttons.
export const CHROME_ROWS = 4
const INLINE_ROWS = 14
const DOCK_ROWS = 48

/** The Raster's size in a pane body. Inline the frame grows to fit, so it is capped well under the room it reports. */
export function fit(bodyColumns: number, bodyRows: number, placement: 'dock' | 'inline') {
  const most = placement === 'inline' ? INLINE_ROWS : DOCK_ROWS
  return {
    columns: Math.max(16, Math.min(160, bodyColumns)),
    rows: Math.max(4, Math.min(most, bodyRows - CHROME_ROWS)),
  }
}

/** Text cut into one colored run per character, sweeping along the ramp's bright half. */
export function gradient(text: string, colors: number[]): { char: string; color: string }[] {
  const chars = [...text]
  return chars.map((char, i) => ({ char, color: hex(colors[Math.floor(LEVELS * 0.4 + (i / Math.max(1, chars.length - 1)) * (LEVELS * 0.6 - 1))]!) }))
}
