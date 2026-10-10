// Builds the blind A/B page from receipts/scored.json and verdict.json. Run: npx -y tsx build-page.ts
import { readFileSync, writeFileSync } from 'node:fs'

const HERE = 'C:/Projects/bws.mods.claude-code/runs/2026-10-10-design-model-ab'
type Metrics = { specs: number; expected: number; blocks: number; textBlocks: number; clipped: number; overlaps: number; short: number; lowContrast: number; unusedPalette: number }
type Reply = { question: number; rep: number; model: string; ms: number; outputTokens: number | null; error?: string; metrics?: Metrics; art?: { columns: number; rows: number; cells: string } }
type Total = { model: string; calls: number; answered: number; specs: number; expected: number; textBlocks: number; clipped: number; overlaps: number; short: number; lowContrast: number; unusedPalette: number; medianMs: number; maxMs: number; outputTokens: number }
const s = JSON.parse(readFileSync(`${HERE}/receipts/scored.json`, 'utf8')) as { questions: { header: string; question: string; options: { label: string }[] }[]; totals: Total[]; replies: Reply[] }
const v = JSON.parse(readFileSync(`${HERE}/verdict.json`, 'utf8')) as { answer: string; points: { chip: string; tone: string; text: string }[]; sub: string }

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const sec = (ms: number) => (ms / 1000).toFixed(1)
const byModel = (m: string) => s.totals.find(t => t.model === m)!
const opus = byModel('opus'), fable = byModel('fable')

// Deterministic side assignment per pair, so a reload keeps A and B where they were.
let seed = 20261010
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)

const pairs: string[] = []
s.questions.forEach((q, qi) => {
  for (const rep of [0, 1]) {
    const mine = s.replies.filter(r => r.question === qi && r.rep === rep)
    if (mine.length !== 2) continue
    const sides = rand() < 0.5 ? mine : [mine[1]!, mine[0]!]
    const id = `q${qi}r${rep}`
    const side = (r: Reply, letter: string) => {
      const body = r.art
        ? `<canvas class="term" role="img" aria-label="Mockup gallery ${letter}" data-columns="${r.art.columns}" data-rows="${r.art.rows}" data-cells="${r.art.cells}"></canvas>`
        : `<p class="pc-muted">No gallery: ${esc(r.error ?? 'unknown')}</p>`
      const m = r.metrics
      const facts = m
        ? `${m.clipped} clipped · ${m.overlaps} overlaps · ${m.lowContrast} low contrast · ${sec(r.ms)} s`
        : `${sec(r.ms)} s`
      return `<div class="side" data-model="${r.model}">
        <div class="side__head"><span class="pc-label">Option ${letter}</span><span class="pc-chip is-info reveal">${r.model}</span></div>
        <div class="term-wrap">${body}</div>
        <p class="pc-label facts reveal">${facts}</p>
        <button class="vote" type="button" id="vote-${id}-${letter}" data-pair="${id}" data-model="${r.model}">Prefer ${letter}</button>
      </div>`
    }
    pairs.push(`<article class="pair" data-pair="${id}">
      <header class="pair__head"><span class="pc-label">${esc(q.header)} · run ${rep + 1}</span><h3 class="pc-title">${esc(q.question)}</h3>
      <p class="pc-muted opts">${q.options.map((o, i) => `${i + 1}. ${esc(o.label)}`).join('   ')}</p></header>
      <div class="pair__sides">${side(sides[0]!, 'A')}${side(sides[1]!, 'B')}</div>
    </article>`)
  }
})

const row = (label: string, a: string | number, b: string | number) => `<tr><th scope="row">${label}</th><td>${a}</td><td>${b}</td></tr>`
const table = `<div class="tbl"><table>
  <thead><tr><th></th><th>Opus</th><th>Fable</th></tr></thead><tbody>
  ${row('Replies parsed', `${opus.answered}/${opus.calls}`, `${fable.answered}/${fable.calls}`)}
  ${row('Mockups drawn', `${opus.specs}/${opus.expected}`, `${fable.specs}/${fable.expected}`)}
  ${row('Text blocks', opus.textBlocks, fable.textBlocks)}
  ${row('Clipped labels', opus.clipped, fable.clipped)}
  ${row('Overlapping labels', opus.overlaps, fable.overlaps)}
  ${row('Text blocks under h 12', opus.short, fable.short)}
  ${row('Ink/fill contrast under 3:1', opus.lowContrast, fable.lowContrast)}
  ${row('Palette colours never used', opus.unusedPalette, fable.unusedPalette)}
  ${row('Median wait', `${sec(opus.medianMs)} s`, `${sec(fable.medianMs)} s`)}
  ${row('Slowest wait', `${sec(opus.maxMs)} s`, `${sec(fable.maxMs)} s`)}
  ${row('Output tokens, all 12', opus.outputTokens.toLocaleString('en-US'), fable.outputTokens.toLocaleString('en-US'))}
  </tbody></table></div>`

const page = `<title>Mockup Model A/B</title>
<link rel="stylesheet" href="precog.css">
<style>
  .term-wrap { overflow-x: auto; background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 8px; }
  .term { display: block; width: 100%; max-width: 1328px; height: auto; image-rendering: pixelated; }
  .pair { display: grid; gap: 12px; padding-block: var(--space-3); border-top: 1px solid var(--line); }
  .pair__sides { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-2); }
  .side { display: grid; gap: 8px; min-width: 0; }
  .side__head { display: flex; gap: 8px; align-items: center; }
  .opts { margin: 0; }
  .vote { justify-self: start; font: inherit; color: var(--text); background: var(--panel); border: 1px solid var(--muted); border-radius: 999px; padding: 6px 16px; cursor: pointer; }
  .vote:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .vote.is-on { border-color: var(--accent); color: var(--accent); }
  body:not(.revealed) .reveal { visibility: hidden; }
  .bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 2; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding-block: 12px; background: var(--bg); }
  .tbl { overflow-x: auto; }
  .tbl table { border-collapse: collapse; font-variant-numeric: tabular-nums; min-width: 420px; }
  .tbl th, .tbl td { text-align: left; padding: 6px 16px 6px 0; border-bottom: 1px solid var(--line); }
  .tbl td { font-family: var(--font-mono); }
</style>
<main class="pc-page">
  <header class="pc-hero">
    <div class="pc-hero__eyebrow"><span class="pc-chip is-info">A/B</span><span class="pc-label">bws-design-picker · 10 Oct 2026</span></div>
    <h1 class="pc-display-xl">Opus or Fable for mockups</h1>
    <p class="pc-lead pc-hero__sub pc-muted">${esc(v.sub)}</p>
  </header>

  <section class="pc-tldr"><div><span class="pc-label">TL;DR</span><p class="pc-tldr__answer">${esc(v.answer)}</p></div>
    <ul>${v.points.map(p => `<li><span class="pc-chip is-${p.tone}">${esc(p.chip)}</span><span>${esc(p.text)}</span></li>`).join('')}</ul></section>

  <div class="pc-stats">
    <div class="pc-stat"><span class="pc-stat__value">${sec(opus.medianMs)}s</span><span class="pc-label">Opus median wait</span></div>
    <div class="pc-stat"><span class="pc-stat__value">${sec(fable.medianMs)}s</span><span class="pc-label">Fable median wait</span></div>
    <div class="pc-stat"><span class="pc-stat__value">${opus.clipped} / ${fable.clipped}</span><span class="pc-label">clipped labels, Opus / Fable</span></div>
    <div class="pc-stat"><span class="pc-stat__value">${opus.overlaps} / ${fable.overlaps}</span><span class="pc-label">overlapping labels, Opus / Fable</span></div>
  </div>

  <section class="pc-section">
    <h2 class="pc-display-l">Vote blind</h2>
    <p class="pc-muted">Each pair is one design question sent to both models. A and B are shuffled per pair. Pick the one you would rather see above your picker, then reveal. These galleries are drawn from the terminal's own cells at the 40-column card size, the same as in your Windows Terminal.</p>
    <div class="bar">
      <button class="vote" type="button" id="reveal">Reveal models</button>
      <span class="pc-label" id="tally">0 of ${pairs.length} voted</span>
      <button class="vote" type="button" id="clear">Clear votes</button>
    </div>
    ${pairs.join('\n')}
  </section>

  <section class="pc-section">
    <h2 class="pc-display-l">Measured</h2>
    ${table}
    <details class="pc-details"><summary>How it was run</summary><div class="pc-details__body">
      <p>A scratch mod sent each question through <code>$.model.complete</code> with the shipped request: the plugin's GEN_SYSTEM prompt, <code>genPrompt(question)</code>, maxTokens 6000, timeout 120 s, no effort setting. For each question and run, Opus and Fable were sent together, so both waited under the same load. That makes 6 questions × 2 runs × 2 models = 24 calls. The scorer reuses the plugin's own parser and renderer. Clipping and overlap are measured on the 40×10 card your terminal draws.</p>
      <p>Caveats: GEN_SYSTEM was tuned with Opus in the loop (one run before this test). Two runs per question show variance, not significance.</p>
    </div></details>
  </section>
</main>
<script src="precog.js"></script>
<script>
  window.Precog && Precog.init()
  // Each gallery is the terminal's own cells: [codePoint, fg, bg] u32 triplets. Drawn as the terminal draws them:
  // a background per cell, the upper half-block as a top-half fill, any other glyph as a letter.
  const CW = 8, CH = 16, DEFAULT = 0x01000000
  const text = getComputedStyle(document.body).color
  const hex = c => '#' + c.toString(16).padStart(6, '0')
  function paintCells(cv) {
    const cols = +cv.dataset.columns, rows = +cv.dataset.rows
    const bin = atob(cv.dataset.cells), bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const w = new Uint32Array(bytes.buffer)
    cv.width = cols * CW; cv.height = rows * CH
    const g = cv.getContext('2d')
    g.font = '500 13px "JetBrains Mono", Consolas, monospace'
    g.textAlign = 'center'; g.textBaseline = 'middle'
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 3, cp = w[i], fg = w[i + 1], bg = w[i + 2]
      const x = c * CW, y = r * CH
      if (bg !== DEFAULT) { g.fillStyle = hex(bg); g.fillRect(x, y, CW, CH) }
      if (cp === 0x2580) { g.fillStyle = fg === DEFAULT ? text : hex(fg); g.fillRect(x, y, CW, CH / 2) }
      else if (cp !== 0x20) { g.fillStyle = fg === DEFAULT ? text : hex(fg); g.fillText(String.fromCodePoint(cp), x + CW / 2, y + CH / 2 + 1) }
    }
  }
  const paintAll = () => document.querySelectorAll('canvas.term').forEach(paintCells)
  paintAll()
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(paintAll)
  const KEY = 'mockup-ab-votes'
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch {} }
  let votes = load()
  const total = ${pairs.length}
  function paint() {
    document.querySelectorAll('button.vote[data-pair]').forEach(b => b.classList.toggle('is-on', votes[b.dataset.pair] === b.dataset.model))
    const n = Object.keys(votes).length
    const revealed = document.body.classList.contains('revealed')
    if (!revealed) { document.getElementById('tally').textContent = n + ' of ' + total + ' voted'; return }
    const c = { opus: 0, fable: 0 }
    Object.values(votes).forEach(m => { c[m] = (c[m] || 0) + 1 })
    document.getElementById('tally').textContent = n + ' of ' + total + ' voted · Opus ' + c.opus + ' · Fable ' + c.fable
  }
  document.querySelectorAll('button.vote[data-pair]').forEach(b => b.addEventListener('click', () => { votes[b.dataset.pair] = b.dataset.model; save(votes); paint() }))
  document.getElementById('reveal').addEventListener('click', e => {
    const on = document.body.classList.toggle('revealed')
    e.currentTarget.textContent = on ? 'Hide models' : 'Reveal models'
    paint()
  })
  document.getElementById('clear').addEventListener('click', () => { votes = {}; save(votes); paint() })
  paint()
</script>
`
writeFileSync(`${HERE}/mockup-ab.html`, page)
console.log('wrote mockup-ab.html', page.length, 'chars,', pairs.length, 'pairs')
