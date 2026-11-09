// A PNG encoder small enough for a mod: 8-bit indexed, deflate "stored" blocks, so no compressor is needed. Pure.
import { toBase64 } from './kit/raster'

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function adler32(bytes: Uint8Array): number {
  let a = 1
  let b = 0
  for (const v of bytes) {
    a = (a + v) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

const u32 = (v: number): number[] => [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length)
  for (let i = 0; i < 4; i++) body[i] = type.charCodeAt(i)
  body.set(data, 4)
  const out = new Uint8Array(12 + data.length)
  out.set(u32(data.length), 0)
  out.set(body, 4)
  out.set(u32(crc32(body)), 8 + data.length)
  return out
}

const BLOCK = 65535

function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / BLOCK))
  const out = new Uint8Array(2 + blocks * 5 + raw.length + 4)
  out.set([0x78, 0x01], 0)
  let at = 2
  for (let i = 0; i < blocks; i++) {
    const part = raw.subarray(i * BLOCK, (i + 1) * BLOCK)
    out.set([i === blocks - 1 ? 1 : 0, part.length & 255, part.length >> 8, ~part.length & 255, (~part.length >> 8) & 255], at)
    out.set(part, at + 5)
    at += 5 + part.length
  }
  out.set(u32(adler32(raw)), at)
  return out
}

/** `px` (0xRRGGBB, row-major, at most 256 distinct colors) as a whole PNG, base64. Throws past 256 colors. */
export function indexedPng(px: Uint32Array, width: number, height: number): string {
  const index = new Map<number, number>()
  const raw = new Uint8Array((width + 1) * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = px[y * width + x]!
      let at = index.get(c)
      if (at === undefined) {
        at = index.size
        if (at === 256) throw new Error('indexedPng: more than 256 colors')
        index.set(c, at)
      }
      raw[y * (width + 1) + 1 + x] = at
    }
  }
  const palette = new Uint8Array(index.size * 3)
  index.forEach((at, c) => palette.set([c >> 16, (c >> 8) & 255, c & 255], at * 3))
  const header = new Uint8Array([...u32(width), ...u32(height), 8, 3, 0, 0, 0])
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('PLTE', palette), chunk('IDAT', zlibStored(raw)), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return toBase64(out)
}
