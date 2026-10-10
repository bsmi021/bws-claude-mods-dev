import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { MAX_ROWS, SECTION, galleries, galleryCells, galleryFromReply, gallerySvg, genPrompt, hex, isDesignQuestion, wantsGenerated, layout, parseSpec, printable, rasterize, stripSpecs, textWidth, toBase64, toSvg } from '../hooks/lib'

const SPEC = {
  bg: '#0f172a',
  font: 'serif',
  palette: ['#0f172a', '#38bdf8', '#f8fafc'],
  blocks: [
    { x: 0, y: 0, w: 100, h: 14, fill: '#1e293b', text: 'Monastery' },
    { x: 8, y: 30, w: 40, h: 20, fill: '#38bdf8', text: 'Play now', shape: 'pill' },
    { x: 60, y: 30, w: 30, h: 40, fill: '#f8fafc', shape: 'circle' },
  ],
}
const preview = (s: unknown = SPEC) => 'design:' + JSON.stringify(s)

const QUESTIONS = [
  {
    question: 'Which visual direction for the landing page?',
    header: 'Style',
    multiSelect: false,
    options: [
      { label: 'Dark serif', description: 'Moody night palette', preview: preview() },
      { label: 'Plain list', description: 'No mockup here' },
      { label: 'Bright', description: 'Light and airy', preview: preview({ bg: '#fff', palette: ['#fff', '#f60'], blocks: [{ x: 0, y: 0, w: 100, h: 20, fill: '#f60', text: 'Hi' }] }) },
    ],
  },
]

const decodeCells = (b64: string): Uint32Array => {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new Uint32Array(bytes.buffer)
}

// ---------- pure ----------

test('hex normalizes and rejects', () => {
  expect(hex('#ABC')).toBe('#aabbcc')
  expect(hex('38bdf8')).toBe('#38bdf8')
  expect(hex('red')).toBeUndefined()
  expect(hex(12)).toBeUndefined()
})

test('parseSpec reads a design preview and ignores everything else', () => {
  const s = parseSpec(preview())!
  expect(s.font).toBe('serif')
  expect(s.blocks.length).toBe(3)
  expect(s.blocks[1]!.shape).toBe('pill')
  expect(parseSpec('```ts\nconst a = 1\n```')).toBeUndefined()
  expect(parseSpec('design:{not json')).toBeUndefined()
  expect(parseSpec('design:{"blocks":[]}')).toBeUndefined()
  expect(parseSpec(undefined)).toBeUndefined()
  // clamps out-of-range numbers, drops blocks with nothing to draw
  const c = parseSpec('design:' + JSON.stringify({ blocks: [{ x: -5, y: 50, w: 400, h: 10, fill: '#000' }, { x: 1 }] }))!
  expect(c.blocks).toEqual([{ x: 0, y: 50, w: 100, h: 10, fill: '#000000', text: undefined, ink: undefined, shape: 'rect' }])
})

test('galleries number cards as the picker numbers options', () => {
  const g = galleries(QUESTIONS)
  expect(g.length).toBe(1)
  expect(g[0]!.header).toBe('Style')
  expect(g[0]!.cards.map(c => [c.number, c.label])).toEqual([[1, 'Dark serif'], [3, 'Bright']])
  expect(galleries([{ question: 'Which lib?', header: 'Library', options: [{ label: 'a', description: '' }] }])).toEqual([])
})

test('stripSpecs drops only parsed specs from previews', () => {
  const qs = [{ ...QUESTIONS[0]!, options: [...QUESTIONS[0]!.options, { label: 'Code', description: '', preview: 'const x = 1' }] }]
  const out = stripSpecs(qs) as typeof qs
  expect('preview' in out[0]!.options[0]!).toBe(false)
  expect(out[0]!.options[3]!.preview).toBe('const x = 1')
  expect(out[0]!.question).toBe(qs[0]!.question)
})

test('toBase64 matches btoa', () => {
  for (const s of ['', 'a', 'ab', 'abc', 'abcd', 'design picker']) {
    expect(toBase64(new TextEncoder().encode(s))).toBe(btoa(s))
  }
})

test('rasterize fills every cell with a printable glyph and puts text and the palette in place', () => {
  const size = { columns: 40, rows: 12 }
  const words = rasterize(parseSpec(preview())!, size)
  expect(words.length).toBe(40 * 12 * 3)
  for (let i = 0; i < words.length; i += 3) {
    const cp = words[i]!
    expect(cp === 0x20 || cp === 0x2580 || (cp > 0x20 && cp < 0x7f)).toBe(true)
  }
  const row = (r: number) => Array.from({ length: 40 }, (_, c) => String.fromCharCode(words[(r * 40 + c) * 3]!)).join('')
  expect(row(0)).toContain('Monastery')
  // header fill behind its text
  expect(words[(0 * 40 + 1) * 3 + 2]).toBe(0x1e293b)
  // last row is the palette strip, three colors left to right
  const last = 11
  expect(words[(last * 40 + 0) * 3 + 2]).toBe(0x0f172a)
  expect(words[(last * 40 + 20) * 3 + 2]).toBe(0x38bdf8)
  expect(words[(last * 40 + 39) * 3 + 2]).toBe(0xf8fafc)
})

test('a text block too narrow for its label is widened, never clipped', () => {
  const W = 40
  const spec = parseSpec(preview({
    bg: '#000000',
    blocks: [
      { x: 10, y: 10, w: 10, h: 20, fill: '#ff0000', text: 'Ethiopia' }, // 4 cells for 8 characters
      { x: 95, y: 50, w: 5, h: 20, fill: '#00ff00', text: 'Shop now', shape: 'pill' }, // at the right edge
      { x: 0, y: 80, w: 10, h: 15, fill: '#0000ff' }, // no text: keeps its 4 cells
    ],
  }))!
  const words = rasterize(spec, { columns: W, rows: 12 })
  const rows = Array.from({ length: 12 }, (_, r) => Array.from({ length: W }, (_, c) => String.fromCharCode(words[(r * W + c) * 3]!)).join(''))
  const bgAt = (r: number, c: number) => words[(r * W + c) * 3 + 2]
  const eth = rows.findIndex(r => r.includes('Ethiopia'))
  expect(eth).toBeGreaterThanOrEqual(0)
  // grown rightwards from its own left edge: label plus a cell each side, all on the block's fill
  const at = rows[eth]!.indexOf('Ethiopia')
  expect(at).toBe(5)
  for (let c = 4; c < 14; c++) expect(bgAt(eth, c)).toBe(0xff0000)
  expect(bgAt(eth, 14)).toBe(0x000000)
  // at the right edge it grows leftwards instead, and stays inside the frame
  const shop = rows.findIndex(r => r.includes('Shop now'))
  expect(shop).toBeGreaterThanOrEqual(0)
  expect(rows[shop]!.indexOf('Shop now')).toBe(31)
  // a block without text is drawn at its own width
  const blue = [...words].findIndex((_, i) => i % 3 === 2 && words[i] === 0x0000ff)
  const blueRow = Math.floor((blue - 2) / 3 / W)
  expect(Array.from({ length: W }, (_, c) => bgAt(blueRow, c)).filter(b => b === 0x0000ff).length).toBe(4)
})

test('a label wider than the whole frame fills it and is cut at the frame', () => {
  const W = 20
  const long = 'A very long label that cannot fit'
  const spec = parseSpec(preview({ bg: '#000000', blocks: [{ x: 40, y: 20, w: 10, h: 30, fill: '#ffffff', text: long }] }))!
  const words = rasterize(spec, { columns: W, rows: 8 })
  const rows = Array.from({ length: 8 }, (_, r) => Array.from({ length: W }, (_, c) => String.fromCharCode(words[(r * W + c) * 3]!)).join(''))
  const row = rows.find(r => r.includes('A very'))!
  expect(row).toBe(' ' + long.slice(0, W - 2) + ' ')
  expect(textWidth('Shop')).toBe(6)
  expect(textWidth('X')).toBe(1)
})

test('printable drops non-ASCII and wide characters', () => {
  expect(printable('Café 東京 ok')).toBe('Caf  ok')
})

test('layout keeps the cards in one row within the room around the dialog', () => {
  for (const [n, cols] of [[4, 200], [4, 100], [3, 80], [2, 60], [1, 40]] as const) {
    const card = layout(n, cols)!
    expect(n * card.columns + 2 * (n - 1)).toBeLessThanOrEqual(cols - 2)
    expect(card.rows + 2).toBeLessThanOrEqual(MAX_ROWS)
    expect(card.columns).toBeLessThanOrEqual(40)
  }
  expect(layout(4, 50)).toBeUndefined()
})

test('galleryCells puts numbered labels over mockups side by side', () => {
  const g = galleries(QUESTIONS)[0]!
  const art = galleryCells(g.cards, 100)!
  expect(art.rows + 1).toBeLessThanOrEqual(MAX_ROWS)
  const words = decodeCells(art.cells)
  expect(words.length).toBe(art.columns * art.rows * 3)
  const row0 = Array.from({ length: art.columns }, (_, c) => String.fromCharCode(words[c * 3]!)).join('')
  expect(row0).toMatch(/^1\. Dark serif\s+3\. Bright/)
  expect(galleryCells(g.cards, 20)).toBeUndefined()
})

test('toSvg is one svg with the text escaped', () => {
  const s = toSvg(parseSpec(preview({ ...SPEC, blocks: [{ x: 0, y: 0, w: 50, h: 20, fill: '#000', text: '<b>&' }] }))!)
  expect(s.startsWith('<svg')).toBe(true)
  expect(s).toContain('&lt;b&gt;&amp;')
  expect(s).toContain('Georgia')
  const g = gallerySvg(galleries(QUESTIONS)[0]!.cards)
  expect(g.source).toContain('1. Dark serif')
  expect(g.source.match(/<svg/g)!.length).toBe(3)
})

// ---------- hooks ----------

const ASK = (questions: unknown[]) => ({
  plugin: 'bws-design-picker',
  component: 'AskUserQuestion',
  requestId: 'toolu_1',
  props: { tool: 'AskUserQuestion', questions },
}) as const

// The engine's own dialog, beneath the plugin: records the questions it is asked to draw.
function engine(on: On) {
  const seen: unknown[][] = []
  on('ui.render', { component: 'AskUserQuestion' }, ($, e) => {
    seen.push(e.props.questions as unknown[])
    return { type: 'engine', ref: 0 } as const
  })
  return seen
}

test('the call loses its specs before the dialog opens, and the dialog draws them from state', async ($, on) => {
  const seen = engine(on)
  let asked: { id: string; questions: unknown[] } | undefined
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    asked = { id: e.tool_use_id, questions: e.questions as unknown[] }
    return { result: { questions: e.questions, answers: {} } } as never
  })
  await $.tool.call({ tool: 'AskUserQuestion', questions: QUESTIONS } as never)
  const opts = (asked!.questions[0] as { options: { preview?: string }[] }).options
  expect(opts.some(o => o.preview !== undefined)).toBe(false)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...ASK(asked!.questions), requestId: asked!.id, surface } as never)
    expect(await ui.find({ type: 'Text', text: /^Style · pick by number below$/ })).toBeDefined()
    expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' } as never)).toBeDefined()
    await ui.unmount()
  }
  expect(seen.length).toBe(2)
})

test('a dialog whose previews still hold specs draws the gallery from them', async ($, on) => {
  engine(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...ASK(QUESTIONS), surface } as never)
    expect(await ui.find({ type: 'Text', text: /^Style · pick by number/ })).toBeDefined()
    expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' } as never)).toBeDefined()
    await ui.unmount()
  }
})

test('a non-design call passes through unchanged', async ($, on) => {
  let asked: unknown
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    asked = e.questions
    return { result: { questions: e.questions, answers: {} } } as never
  })
  const plain = [{ question: 'Which library?', header: 'Library', multiSelect: false, options: [{ label: 'a', description: 'x', preview: 'code' }, { label: 'b', description: 'y' }] }]
  await $.tool.call({ tool: 'AskUserQuestion', questions: plain } as never)
  expect(asked).toEqual(plain)
})

test('a question without design previews is left to the engine untouched', async ($, on) => {
  const seen = engine(on)
  const plain = [{ question: 'Which library?', header: 'Library', multiSelect: false, options: [{ label: 'a', description: 'x', preview: 'code' }, { label: 'b', description: 'y' }] }]
  const ui = await $.ui.mount({ ...ASK(plain), surface: 'terminal' } as never)
  expect(await ui.find({ type: 'Text', text: /pick by number/ })).toBeUndefined()
  expect(await ui.find({ type: 'Raster' } as never)).toBeUndefined()
  expect(seen.at(-1)).toEqual(plain)
  await ui.unmount()
})

test('prompt.compose adds the section only when AskUserQuestion is offered', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' }] }))
  const base = { model: 'm', promptModel: 'm', surfaces: ['terminal'], outputStyle: null, traits: [] }
  const withAsk = await $.prompt.compose({ ...base, tools: ['Bash', 'AskUserQuestion'] } as never)
  expect(withAsk.sections.map(s => s.id)).toEqual(['intro', 'bws-design-picker:ask'])
  expect(withAsk.sections[1]!.text).toBe(SECTION)
  const without = await $.prompt.compose({ ...base, tools: ['Bash'] } as never)
  expect(without.sections.map(s => s.id)).toEqual(['intro'])
})

// ---------- generated specs ----------

const ROAST = {
  question: 'Which visual direction should the roaster landing page take?',
  header: 'Direction',
  multiSelect: false,
  options: [
    { label: 'Warm Editorial', description: 'Cream, espresso brown, serif' },
    { label: 'Bold Graphic', description: 'Orange, black, heavy sans' },
  ],
}
const REPLY = '```json\n' + JSON.stringify({ specs: [SPEC, { bg: '#ff5500', palette: ['#ff5500', '#000'], blocks: [{ x: 0, y: 0, w: 100, h: 20, fill: '#000', text: 'ROAST' }] }] }) + '\n```'

test('isDesignQuestion tells how-it-looks from how-it-works', () => {
  for (const q of [
    ROAST,
    { header: 'Style', question: 'Which look and feel for the app?' },
    { header: 'Palette', question: 'Pick a colour scheme' },
    { header: 'Design', question: 'Which design for the landing page?' },
    { header: 'Layout', question: 'Sidebar or top nav?' },
  ]) expect(isDesignQuestion(q)).toBe(true)
  for (const q of [
    { header: 'API', question: 'Which API design do you prefer?' },
    { header: 'Code style', question: 'Tabs or spaces?' },
    { header: 'Schema', question: 'Which database schema design?' },
    { header: 'Library', question: 'Which date library?' },
    { header: 'Design', question: 'Which architecture design for the service?' },
  ]) expect(isDesignQuestion(q)).toBe(false)
})

test('wantsGenerated only when no option carries a spec', () => {
  expect(wantsGenerated([ROAST])?.index).toBe(0)
  expect(wantsGenerated(QUESTIONS)).toBeUndefined()
  expect(wantsGenerated([{ header: 'Library', question: 'Which lib?', options: [] }])).toBeUndefined()
})

test('genPrompt numbers the directions with their descriptions', () => {
  expect(genPrompt(ROAST)).toBe('Question: Which visual direction should the roaster landing page take?\nDirections:\n1. Warm Editorial: Cream, espresso brown, serif\n2. Bold Graphic: Orange, black, heavy sans')
})

test('galleryFromReply reads fenced JSON and skips bad specs', () => {
  const g = galleryFromReply(REPLY, ROAST)!
  expect(g.header).toBe('Direction')
  expect(g.cards.map(c => [c.number, c.label])).toEqual([[1, 'Warm Editorial'], [2, 'Bold Graphic']])
  const one = galleryFromReply(JSON.stringify({ specs: [{ nope: 1 }, SPEC] }), ROAST)!
  expect(one.cards.map(c => c.number)).toEqual([2])
  expect(galleryFromReply('sorry, no', ROAST)).toBeUndefined()
  expect(galleryFromReply('{"specs": 3}', ROAST)).toBeUndefined()
})

test('a design question without specs gets a generated gallery while the dialog is open', async ($, on) => {
  engine(on)
  const asks: { model: string; prompt: string }[] = []
  on('model.complete', (_$, e) => {
    asks.push({ model: e.model, prompt: e.prompt })
    return { value: { isAnswered: true, text: REPLY, usage: {} } } as never
  })
  let pendingAtOpen: unknown
  let id = ''
  on('tool.call', { tool: 'AskUserQuestion' }, async (_s, e) => {
    id = e.tool_use_id
    const open = await $.ui.mount({ ...ASK([ROAST]), requestId: id, surface: 'terminal' } as never)
    pendingAtOpen = (await open.find({ type: 'Text', text: /drawing mockups/ })) !== undefined || (await open.find({ type: 'Raster' } as never)) !== undefined
    await open.unmount()
    return { result: { questions: e.questions, answers: {} } } as never
  })
  await $.tool.call({ tool: 'AskUserQuestion', questions: [ROAST] } as never)
  expect(pendingAtOpen).toBe(true)
  expect(asks.length).toBe(1)
  expect(asks[0]!.model).toBe('opus')
  expect(asks[0]!.prompt).toContain('1. Warm Editorial')
  const ui = await $.ui.mount({ ...ASK([ROAST]), requestId: id, surface: 'terminal' } as never)
  expect(await ui.find({ type: 'Text', text: /^Direction · pick by number below$/ })).toBeDefined()
  expect(await ui.find({ type: 'Raster' } as never)).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /drawing mockups/ })).toBeUndefined()
  await ui.unmount()
})

test('while the model draws, the dialog says so', async ($, on) => {
  engine(on)
  let id = ''
  on('model.complete', (_$, _e, next) =>
    new Promise(res => next.signal.addEventListener('abort', () => res({ value: { isAnswered: false, reason: 'aborted' } } as never))),
  )
  let line: unknown
  on('tool.call', { tool: 'AskUserQuestion' }, async (_s, e) => {
    id = e.tool_use_id
    const ui = await $.ui.mount({ ...ASK([ROAST]), requestId: id, surface: 'terminal' } as never)
    line = await ui.find({ type: 'Text', text: /drawing mockups/ })
    await ui.unmount()
    return { result: { questions: e.questions, answers: {} } } as never
  })
  await $.tool.call({ tool: 'AskUserQuestion', questions: [ROAST] } as never)
  expect(line).toBeDefined()
  // answered and aborted: no line, no gallery, the engine's dialog alone
  const after = await $.ui.mount({ ...ASK([ROAST]), requestId: id, surface: 'terminal' } as never)
  expect(await after.find({ type: 'Text', text: /drawing mockups|pick by number/ })).toBeUndefined()
  await after.unmount()
})

test('an answer before the drawing is done aborts the model call', async ($, on) => {
  let aborted = false
  on('model.complete', (_$, _e, next) =>
    new Promise(res => {
      next.signal.addEventListener('abort', () => {
        aborted = true
        res({ value: { isAnswered: false, reason: 'aborted' } } as never)
      })
    }),
  )
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => ({ result: { questions: e.questions, answers: {} } }) as never)
  const r = await $.tool.call({ tool: 'AskUserQuestion', questions: [ROAST] } as never)
  expect(r.result).toBeDefined()
  expect(aborted).toBe(true)
})

test('a non-design question makes no model call', async ($, on) => {
  let calls = 0
  on('model.complete', () => (calls++, { value: { isAnswered: true, text: REPLY, usage: {} } }) as never)
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => ({ result: { questions: e.questions, answers: {} } }) as never)
  const plain = [{ question: 'Which date library?', header: 'Library', multiSelect: false, options: [{ label: 'a', description: '' }, { label: 'b', description: '' }] }]
  await $.tool.call({ tool: 'AskUserQuestion', questions: plain } as never)
  expect(calls).toBe(0)
})

test('autoGenerate off makes no model call', { options: { autoGenerate: false } }, async ($, on) => {
  let calls = 0
  on('model.complete', () => (calls++, { value: { isAnswered: true, text: REPLY, usage: {} } }) as never)
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => ({ result: { questions: e.questions, answers: {} } }) as never)
  await $.tool.call({ tool: 'AskUserQuestion', questions: [ROAST] } as never)
  expect(calls).toBe(0)
})
