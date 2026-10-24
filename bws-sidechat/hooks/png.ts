import { toBase64 } from './kit/raster'

// Pictures for the chat: a PNG decoded here (the mod runtime has no DecompressionStream), then drawn as a Raster's cells
// on the terminal (two pixels a cell, ▀ with a foreground and a background) and as an SVG on Desktop. Pure: no `$`.

export type Rgba = { width: number; height: number; data: Uint8Array } // 4 bytes a pixel

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Standard base64 (as `$.fs.read` answers bytes) to bytes; anything outside the alphabet is skipped.
export function fromBase64(text: string): Uint8Array {
  const out = new Uint8Array(Math.floor((text.length * 3) / 4))
  let n = 0
  let acc = 0
  let bitsHeld = 0
  for (let i = 0; i < text.length; i++) {
    const v = B64.indexOf(text[i] as string)
    if (v < 0) continue
    acc = ((acc << 6) | v) & 0xffffff
    bitsHeld += 6
    if (bitsHeld >= 8) {
      bitsHeld -= 8
      out[n++] = (acc >> bitsHeld) & 255
    }
  }
  return out.subarray(0, n)
}

// ---------- inflate (RFC 1951) ----------

type Huff = { counts: Uint16Array; symbols: Uint16Array }

function huff(lengths: Uint8Array, n: number): Huff {
  const counts = new Uint16Array(16)
  const symbols = new Uint16Array(n)
  for (let i = 0; i < n; i++) counts[lengths[i] as number]!++
  counts[0] = 0
  const offs = new Uint16Array(16)
  for (let i = 1; i < 16; i++) offs[i] = (offs[i - 1] as number) + (counts[i - 1] as number)
  for (let i = 0; i < n; i++) if (lengths[i]) symbols[offs[lengths[i] as number]!++] = i
  return { counts, symbols }
}

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

// Raw deflate data to bytes, at most `limit` of them; throws on bad data.
export function inflate(src: Uint8Array, limit: number): Uint8Array {
  let pos = 0
  let bit = 0
  let nbits = 0
  let out = new Uint8Array(Math.min(limit, Math.max(1024, src.length * 4)))
  let len = 0
  const need = (n: number) => {
    if (len + n <= out.length) return
    if (len + n > limit) throw new Error('too big')
    const grown = new Uint8Array(Math.min(limit, Math.max(len + n, out.length * 2)))
    grown.set(out.subarray(0, len))
    out = grown
  }
  const bits = (n: number) => {
    while (nbits < n) {
      if (pos >= src.length) throw new Error('truncated')
      bit |= (src[pos++] as number) << nbits
      nbits += 8
    }
    const v = bit & ((1 << n) - 1)
    bit >>>= n
    nbits -= n
    return v
  }
  const decode = (h: Huff) => {
    let code = 0
    let first = 0
    let index = 0
    for (let l = 1; l < 16; l++) {
      code |= bits(1)
      const count = h.counts[l] as number
      if (code - count < first) return h.symbols[index + (code - first)] as number
      index += count
      first += count
      first <<= 1
      code <<= 1
    }
    throw new Error('bad code')
  }
  const fixedLen = new Uint8Array(288)
  fixedLen.fill(8, 0, 144).fill(9, 144, 256).fill(7, 256, 280).fill(8, 280, 288)
  const fixedL = huff(fixedLen, 288)
  const fixedD = huff(new Uint8Array(30).fill(5), 30)
  for (;;) {
    const isLast = bits(1)
    const type = bits(2)
    if (type === 0) {
      bit = 0
      nbits = 0
      if (pos + 4 > src.length) throw new Error('truncated')
      const n = (src[pos] as number) | ((src[pos + 1] as number) << 8)
      pos += 4
      if (pos + n > src.length) throw new Error('truncated')
      need(n)
      out.set(src.subarray(pos, pos + n), len)
      len += n
      pos += n
    } else if (type === 1 || type === 2) {
      let lit = fixedL
      let dist = fixedD
      if (type === 2) {
        const hlit = bits(5) + 257
        const hdist = bits(5) + 1
        const hclen = bits(4) + 4
        const cl = new Uint8Array(19)
        for (let i = 0; i < hclen; i++) cl[CL_ORDER[i] as number] = bits(3)
        const clh = huff(cl, 19)
        const lengths = new Uint8Array(hlit + hdist)
        for (let i = 0; i < hlit + hdist; ) {
          const sym = decode(clh)
          if (sym < 16) lengths[i++] = sym
          else {
            const [rep, val] = sym === 16 ? [3 + bits(2), i > 0 ? (lengths[i - 1] as number) : -1] : sym === 17 ? [3 + bits(3), 0] : [11 + bits(7), 0]
            if (val < 0 || i + rep > hlit + hdist) throw new Error('bad lengths')
            lengths.fill(val, i, i + rep)
            i += rep
          }
        }
        lit = huff(lengths.subarray(0, hlit), hlit)
        dist = huff(lengths.subarray(hlit), hdist)
      }
      for (;;) {
        const sym = decode(lit)
        if (sym === 256) break
        if (sym < 256) {
          need(1)
          out[len++] = sym
          continue
        }
        const li = sym - 257
        if (li >= 29) throw new Error('bad length')
        const n = (LEN_BASE[li] as number) + bits(LEN_EXTRA[li] as number)
        const di = decode(dist)
        if (di >= 30) throw new Error('bad distance')
        const d = (DIST_BASE[di] as number) + bits(DIST_EXTRA[di] as number)
        if (d > len) throw new Error('bad distance')
        need(n)
        for (let k = 0; k < n; k++, len++) out[len] = out[len - d] as number
      }
    } else throw new Error('bad block')
    if (isLast) return out.subarray(0, len)
  }
}

// ---------- PNG ----------

const MAX_PIXELS = 4096 * 4096

// A PNG file's pixels, or null for anything it cannot read (interlaced, broken, too large).
export function decodePng(file: Uint8Array): Rgba | null {
  try {
    const sig = [137, 80, 78, 71, 13, 10, 26, 10]
    if (file.length < 33 || sig.some((b, i) => file[i] !== b)) return null
    const u32 = (i: number) => (((file[i] as number) << 24) | ((file[i + 1] as number) << 16) | ((file[i + 2] as number) << 8) | (file[i + 3] as number)) >>> 0
    let width = 0
    let height = 0
    let depth = 0
    let color = 0
    let palette: Uint8Array | null = null
    let trns: Uint8Array | null = null
    const idat: Uint8Array[] = []
    for (let p = 8; p + 8 <= file.length; ) {
      const n = u32(p)
      const type = String.fromCharCode(...file.subarray(p + 4, p + 8))
      const body = file.subarray(p + 8, p + 8 + n)
      if (type === 'IHDR') {
        width = u32(p + 8)
        height = u32(p + 12)
        depth = body[8] as number
        color = body[9] as number
        if (body[12] !== 0) return null // interlaced
      } else if (type === 'PLTE') palette = body
      else if (type === 'tRNS') trns = body
      else if (type === 'IDAT') idat.push(body)
      else if (type === 'IEND') break
      p += 12 + n
    }
    const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color]
    if (channels === undefined || width < 1 || height < 1 || width * height > MAX_PIXELS || ![1, 2, 4, 8, 16].includes(depth)) return null
    if (color === 3 && palette === null) return null
    const total = idat.reduce((s, b) => s + b.length, 0)
    const z = new Uint8Array(total)
    let o = 0
    for (const b of idat) {
      z.set(b, o)
      o += b.length
    }
    const bpp = Math.max(1, (channels * depth) >> 3)
    const stride = Math.ceil((width * channels * depth) / 8)
    const raw = inflate(z.subarray(2), (stride + 1) * height)
    if (raw.length < (stride + 1) * height) return null
    const lines = new Uint8Array(stride * height)
    for (let y = 0; y < height; y++) {
      const f = raw[y * (stride + 1)] as number
      const src = y * (stride + 1) + 1
      const dst = y * stride
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? (lines[dst + x - bpp] as number) : 0
        const b = y > 0 ? (lines[dst - stride + x] as number) : 0
        const c = x >= bpp && y > 0 ? (lines[dst - stride + x - bpp] as number) : 0
        const v = raw[src + x] as number
        let pred = 0
        if (f === 1) pred = a
        else if (f === 2) pred = b
        else if (f === 3) pred = (a + b) >> 1
        else if (f === 4) {
          const pa = Math.abs(b - c)
          const pb = Math.abs(a - c)
          const pc = Math.abs(a + b - 2 * c)
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        }
        lines[dst + x] = (v + pred) & 255
      }
    }
    // One sample of row y, channel ch of pixel x, scaled to 0..255.
    const sample = (y: number, x: number, ch: number) => {
      const i = x * channels + ch
      if (depth === 8) return lines[y * stride + i] as number
      if (depth === 16) return lines[y * stride + i * 2] as number
      const bitPos = i * depth
      const byte = lines[y * stride + (bitPos >> 3)] as number
      const v = (byte >> (8 - depth - (bitPos & 7))) & ((1 << depth) - 1)
      return color === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1))
    }
    const data = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const d = (y * width + x) * 4
        if (color === 3) {
          const k = sample(y, x, 0)
          const pal = palette as Uint8Array
          data[d] = pal[k * 3] ?? 0
          data[d + 1] = pal[k * 3 + 1] ?? 0
          data[d + 2] = pal[k * 3 + 2] ?? 0
          data[d + 3] = trns !== null && k < trns.length ? (trns[k] as number) : 255
        } else if (color === 0 || color === 4) {
          const g = sample(y, x, 0)
          data[d] = data[d + 1] = data[d + 2] = g
          data[d + 3] = color === 4 ? sample(y, x, 1) : 255
        } else {
          data[d] = sample(y, x, 0)
          data[d + 1] = sample(y, x, 1)
          data[d + 2] = sample(y, x, 2)
          data[d + 3] = color === 6 ? sample(y, x, 3) : 255
        }
      }
    }
    return { width, height, data }
  } catch {
    return null
  }
}

// ---------- drawing ----------

// The picture box-averaged to w × h pixels, as 0xRRGGBB, or -1 where it is mostly transparent.
export function shrink(img: Rgba, w: number, h: number): Int32Array {
  const out = new Int32Array(w * h)
  for (let ty = 0; ty < h; ty++) {
    const y0 = Math.floor((ty * img.height) / h)
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * img.height) / h))
    for (let tx = 0; tx < w; tx++) {
      const x0 = Math.floor((tx * img.width) / w)
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * img.width) / w))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      // Sample at most 8 × 8 source pixels a target pixel, so a large picture stays quick.
      const sy = Math.max(1, Math.floor((y1 - y0) / 8))
      const sx = Math.max(1, Math.floor((x1 - x0) / 8))
      for (let y = y0; y < y1; y += sy) {
        for (let x = x0; x < x1; x += sx) {
          const i = (y * img.width + x) * 4
          const al = img.data[i + 3] as number
          r += (img.data[i] as number) * al
          g += (img.data[i + 1] as number) * al
          b += (img.data[i + 2] as number) * al
          a += al
          n++
        }
      }
      out[ty * w + tx] = a / n < 96 ? -1 : (Math.round(r / a) << 16) | (Math.round(g / a) << 8) | Math.round(b / a)
    }
  }
  return out
}

// The terminal box for a picture at most `maxCols` wide and `maxRows` tall: a cell is two pixels tall, about square.
export function boxOf(img: { width: number; height: number }, maxCols: number, maxRows: number): { columns: number; rows: number } {
  let columns = Math.max(1, Math.min(maxCols, img.width))
  let rows = Math.max(1, Math.round((columns * img.height) / img.width / 2))
  if (rows > maxRows) {
    rows = maxRows
    columns = Math.max(1, Math.min(maxCols, Math.round((rows * 2 * img.width) / img.height)))
  }
  return { columns, rows }
}

const DEFAULT_COLOR = 0x01000000

// A Raster's packed cells: ▀ painted with the upper pixel as foreground and the lower as background.
export function rasterCells(img: Rgba, columns: number, rows: number): string {
  const px = shrink(img, columns, rows * 2)
  const words = new Uint32Array(columns * rows * 3)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const top = px[2 * y * columns + x] as number
      const bottom = px[(2 * y + 1) * columns + x] as number
      const i = (y * columns + x) * 3
      words[i] = top < 0 && bottom < 0 ? 0x20 : 0x2580
      words[i + 1] = top < 0 ? DEFAULT_COLOR : top
      words[i + 2] = bottom < 0 ? DEFAULT_COLOR : bottom
    }
  }
  return toBase64(new Uint8Array(words.buffer))
}

const MAX_EMBED = 120_000 // base64 characters of PNG that fit an Svg's 131072 with room

// An SVG for Desktop: the PNG itself when it is small enough, else rows of coloured runs from a 96-pixel-wide copy.
export function svgOf(img: Rgba, pngBase64: string, alt: string): string {
  const width = Math.min(img.width, 520)
  const height = Math.round((width * img.height) / img.width)
  const title = alt.replace(/[<>&"]/g, '')
  if (pngBase64.length <= MAX_EMBED) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${title}</title><image href="data:image/png;base64,${pngBase64}" width="${width}" height="${height}"/></svg>`
  }
  const w = Math.min(96, img.width)
  const h = Math.max(1, Math.round((w * img.height) / img.width))
  const px = shrink(img, w, h)
  const rects: string[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; ) {
      const c = px[y * w + x] as number
      let end = x + 1
      while (end < w && px[y * w + end] === c) end++
      if (c >= 0) rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="#${c.toString(16).padStart(6, '0')}"/>`)
      x = end
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><title>${title}</title>${rects.join('')}</svg>`.slice(0, 131_072)
}
