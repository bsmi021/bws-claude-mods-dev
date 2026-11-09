// The Desktop app's picture: the same four scenes as SVG that animates itself with SMIL, so no frames are sent. Pure.
import { hex, ramp, type Look, type Scene } from './art'

const W = 640
const H = 360

const seed = (i: number): number => {
  const v = Math.sin(i * 91.7) * 4371.13
  return v - Math.floor(v)
}
const n = (v: number): string => String(Math.round(v * 10) / 10)

type Colors = (at: number) => string

const plasma = (c: Colors): string => {
  const blobs = Array.from({ length: 6 }, (_, i) => {
    const path = (size: number, phase: number) => [0, 1, 2, 0].map(k => n(size * (0.15 + 0.7 * seed(i * 7 + k * 3 + phase)))).join(';')
    return `<circle r="${n(120 + seed(i) * 80)}" fill="url(#blob${i % 3})" style="mix-blend-mode:screen">` +
      `<animate attributeName="cx" dur="${n(9 + i * 2)}s" begin="-${i * 2}s" repeatCount="indefinite" values="${path(W, 0)}"/>` +
      `<animate attributeName="cy" dur="${n(11 + i * 2)}s" begin="-${i * 3}s" repeatCount="indefinite" values="${path(H, 5)}"/></circle>`
  }).join('')
  const defs = [0.55, 0.72, 0.9].map((at, i) => `<radialGradient id="blob${i}"><stop offset="0" stop-color="${c(at)}"/><stop offset="1" stop-color="${c(at)}" stop-opacity="0"/></radialGradient>`).join('')
  return `<defs>${defs}</defs>${blobs}`
}

const horizon = (c: Colors): string => {
  const line = 215
  const stars = Array.from({ length: 46 }, (_, i) => `<circle cx="${n(seed(i) * W)}" cy="${n(seed(i + 90) * (line - 20))}" r="${n(0.6 + seed(i + 40))}" fill="#fff"><animate attributeName="opacity" dur="${n(1.5 + seed(i + 7) * 3)}s" repeatCount="indefinite" values="1;0.15;1"/></circle>`).join('')
  const bands = Array.from({ length: 7 }, (_, i) => `<rect x="0" width="${W}" height="${5 + i}" fill="#000"><animate attributeName="y" dur="6s" begin="-${n(i * (6 / 7))}s" repeatCount="indefinite" from="150" to="${line}"/></rect>`).join('')
  const rays = Array.from({ length: 19 }, (_, i) => `<line x1="${W / 2}" y1="${line}" x2="${n(W / 2 + (i - 9) * 150)}" y2="${H}"/>`).join('')
  const rungs = Array.from({ length: 8 }, (_, i) => `<line x1="0" x2="${W}"><animate attributeName="y1" dur="4s" begin="-${i * 0.5}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.7 0 1 0.6" from="${line}" to="${H}"/><animate attributeName="y2" dur="4s" begin="-${i * 0.5}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.7 0 1 0.6" from="${line}" to="${H}"/></line>`).join('')
  return `<defs><linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c(1)}"/><stop offset="0.55" stop-color="${c(0.75)}"/><stop offset="1" stop-color="${c(0.5)}"/></linearGradient>` +
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c(0.02)}"/><stop offset="1" stop-color="${c(0.42)}"/></linearGradient>` +
    `<mask id="cuts"><rect width="${W}" height="${H}" fill="#fff"/>${bands}</mask></defs>` +
    `<rect width="${W}" height="${line}" fill="url(#sky)"/>${stars}` +
    `<circle cx="${W / 2}" cy="130" r="86" fill="url(#sun)" mask="url(#cuts)" filter="url(#glow)"/>` +
    `<rect y="${line}" width="${W}" height="${H - line}" fill="${c(0)}"/>` +
    `<g stroke="${c(0.72)}" stroke-width="1.5" filter="url(#glow)">${rays}${rungs}</g>`
}

const tunnel = (c: Colors): string => {
  const count = 14
  const rings = Array.from({ length: count }, (_, i) => `<rect x="-70" y="-70" width="140" height="140" rx="16" fill="none" stroke="${c(0.45 + 0.55 * (i / (count - 1)))}" stroke-width="5"><animateTransform attributeName="transform" type="scale" dur="7s" begin="-${n(i * (7 / count))}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.8 0 1 0.8" from="0.01" to="4.2"/></rect>`).join('')
  return `<g transform="translate(${W / 2} ${H / 2})" filter="url(#glow)"><g><animateTransform attributeName="transform" type="rotate" dur="24s" repeatCount="indefinite" from="0" to="360"/>${rings}</g></g>`
}

const lava = (c: Colors): string => {
  const balls = Array.from({ length: 9 }, (_, i) => {
    const up = [H + 60, n(40 + seed(i + 3) * 200), H + 60].join(';')
    const across = [0, 1, 2, 0].map(k => n(60 + seed(i * 5 + k) * (W - 120))).join(';')
    return `<circle r="${n(30 + seed(i + 11) * 44)}"><animate attributeName="cy" dur="${n(10 + seed(i) * 9)}s" begin="-${n(seed(i + 2) * 12)}s" repeatCount="indefinite" values="${up}"/><animate attributeName="cx" dur="${n(16 + i)}s" begin="-${i}s" repeatCount="indefinite" values="${across}"/></circle>`
  }).join('')
  return `<defs><filter id="goo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 22 -10"/></filter>` +
    `<linearGradient id="wax" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c(0.95)}"/><stop offset="1" stop-color="${c(0.45)}"/></linearGradient></defs>` +
    `<g filter="url(#goo)" fill="url(#wax)">${balls}</g>`
}

const SCENES: Record<Scene, (c: Colors) => string> = { plasma, horizon, tunnel, lava }

function bars(): string {
  const count = 40
  const room = 54
  return Array.from({ length: count }, (_, i) => {
    const heights = [0, 1, 2, 3, 0].map(k => 4 + seed(i * 3 + (k % 4) * 17) * room)
    const dur = `${n(1.1 + seed(i + 5) * 1.3)}s`
    return `<rect x="${n(i * (W / count) + 2)}" width="${n(W / count - 4)}" rx="2" fill="url(#bar)">` +
      `<animate attributeName="height" dur="${dur}" repeatCount="indefinite" values="${heights.map(n).join(';')}"/>` +
      `<animate attributeName="y" dur="${dur}" repeatCount="indefinite" values="${heights.map(h => n(H - h)).join(';')}"/></rect>`
  }).join('')
}

/** The whole picture, `<svg>` to `</svg>`, for `Svg` with `isInteractive` (SMIL runs in the sandboxed frame). */
export function sceneSvg(look: Look): string {
  const colors = ramp(look.palette.stops, 101)
  const c: Colors = at => hex(colors[Math.round(Math.max(0, Math.min(1, at)) * 100)]!)
  const defs = `<defs>` +
    `<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<linearGradient id="ink" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c(0.6)}"/><stop offset="0.5" stop-color="${c(1)}"/><stop offset="1" stop-color="${c(0.75)}"/></linearGradient>` +
    `<linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c(1)}"/><stop offset="1" stop-color="${c(0.5)}" stop-opacity="0.35"/></linearGradient>` +
    `<clipPath id="frame"><rect width="${W}" height="${H}" rx="14"/></clipPath></defs>`
  const title = `<text x="24" y="58" font-family="ui-sans-serif,system-ui,sans-serif" font-size="44" font-weight="800" letter-spacing="10" fill="url(#ink)" filter="url(#glow)">PRISM</text>` +
    `<text x="26" y="82" font-family="ui-monospace,monospace" font-size="13" letter-spacing="3" fill="#fff" opacity="0.75">${look.scene.toUpperCase()} / ${look.palette.name.toUpperCase()}</text>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}` +
    `<g clip-path="url(#frame)"><rect width="${W}" height="${H}" fill="${c(0)}"/>${SCENES[look.scene](c)}${bars()}${title}</g></svg>`
}
