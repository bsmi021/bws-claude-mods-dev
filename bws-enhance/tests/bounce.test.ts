import { test, expect, mock, describe } from 'claude-code/testing'
import type { On } from 'claude-code'
import {
  bounceSummary,
  failLine,
  glossarySection,
  glossaryText,
  GLOSSARY_CAP,
  isAnswer,
  MODE_NOTE,
  parseMode,
  REASON_SYSTEM,
  reasonText,
  resolvePath,
  skipReason,
  statusText,
  vagueQuestion,
} from '../hooks/bounce'

const ROOT = 'C:/proj'
const PROMPT = 'fix the thing on the settings page'
const REASON = 'Name the settings page file and the change you want.'
const COMPOSER = { kind: 'composer' }

type World = {
  surfaces?: string[]
  box?: string
  verdict?: 'yes' | 'no' | 'junk' | 'throw' | 'hang'
  reply?: { isAnswered: true; text: string } | { isAnswered: false; reason: 'empty-reply' } | 'throw'
  files?: Record<string, string>
}

// Stubs every outside call the bouncer makes and records what reached the engine.
function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  const seen = {
    classify: [] as { text: string; labels: readonly string[]; options?: unknown }[],
    complete: [] as { model: string; system: string; prompt: string }[],
    fills: [] as string[],
    sent: [] as { text: string; asUser?: boolean }[],
    opened: [] as { id: string; title?: string }[],
    logs: [] as { text: string; to?: string }[],
  }
  let box = w.box ?? ''
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('session.root', () => ({ value: ROOT }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('fs.read', ($, e) => {
    const path = String(e.path).replace(/\\/g, '/')
    const rel = path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : path
    const hit = (w.files ?? {})[rel]
    if (hit === undefined) throw new Error(`ENOENT ${path}`)
    return { value: hit as never }
  })
  on('model.classify', ($, e) => {
    seen.classify.push({ text: e.text, labels: e.labels, options: e.options })
    if (w.verdict === 'throw') throw new Error('classifier down')
    if (w.verdict === 'hang') return new Promise<never>(() => undefined) as never
    return { value: (w.verdict === 'junk' ? 'maybe' : (w.verdict ?? 'yes')) as never }
  })
  on('model.complete', ($, e) => {
    seen.complete.push({ model: e.model, system: e.system ?? '', prompt: e.prompt })
    if (w.reply === 'throw') throw new Error('reason call down')
    return { value: (w.reply ?? { isAnswered: true, text: REASON, usage: {} }) as never }
  })
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.fill', ($, e) => {
    box = e.text
    seen.fills.push(e.text)
    return { isFilled: true }
  })
  on('prompt.submit', ($, e) => {
    seen.sent.push({ text: e.text, asUser: (e.origin as { asUser?: boolean } | undefined)?.asUser })
    return { text: e.text } as never
  })
  on('ui.open', ($, e) => {
    seen.opened.push({ id: e.id, title: e.title })
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined as never }))
  on('ui.log', ($, e) => {
    seen.logs.push({ text: e.text, to: e.to })
    return { value: undefined as never }
  })
  return { seen, clock }
}

const PANE = {
  plugin: 'bws-enhance',
  component: 'Pane',
  requestId: 'bws-enhance',
  props: { title: 'Prompt held', isFocused: false, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 8 }, view: {} },
} as const

const drop = (r: unknown) => (r as { drop?: string }).drop

describe('bounce lib', () => {
  test('the mode: off, warn or block, case and spaces ignored; anything else is null', () => {
    expect(parseMode('Block ')).toBe('block')
    expect(parseMode('warn')).toBe('warn')
    expect(parseMode('off')).toBe('off')
    expect(parseMode('loud')).toBeNull()
    expect(parseMode(undefined)).toBeNull()
  })

  test('short answers: yes, no, go-ahead, a number, an option letter', () => {
    expect(isAnswer('yes.')).toBe(true)
    expect(isAnswer('Continue')).toBe(true)
    expect(isAnswer('3')).toBe(true)
    expect(isAnswer('b')).toBe(true)
    expect(isAnswer('fix it')).toBe(false)
  })

  test('skips: slash commands, short answers, attachments, pastes, and anything not typed by the person', () => {
    const typed = { origin: COMPOSER }
    expect(skipReason({ text: '/compact', ...typed }, 'block', false)).toBe('slash command')
    expect(skipReason({ text: 'yes', ...typed }, 'block', false)).toBe('short answer')
    expect(skipReason({ text: 'fix it', attachments: [{}], ...typed }, 'block', false)).toBe('attachment')
    expect(skipReason({ text: '[Pasted text #1 +4 lines] fix it', ...typed }, 'block', false)).toBe('pasted content')
    expect(skipReason({ text: '   ', ...typed }, 'block', false)).toBe('empty')
    expect(skipReason({ text: PROMPT, origin: { kind: 'plugin' } }, 'block', false)).toMatch(/not typed/)
    expect(skipReason({ text: PROMPT }, 'block', false)).toMatch(/not typed/)
  })

  test('checked: a typed vague prompt; an SDK prompt in block mode; warn is skipped only with no surface', () => {
    expect(skipReason({ text: PROMPT, origin: COMPOSER }, 'block', false)).toBeNull()
    expect(skipReason({ text: PROMPT, origin: { kind: 'sdk' } }, 'block', true)).toBeNull()
    expect(skipReason({ text: PROMPT, origin: { kind: 'sdk' } }, 'warn', true)).toMatch(/headless warn/)
    expect(skipReason({ text: PROMPT, origin: COMPOSER }, 'warn', false)).toBeNull()
  })

  test('glossary: the ## Glossary section ends at the next heading; a whole file is kept; both are capped', () => {
    const md = '# Title\n\nintro\n\n## Glossary\n- billing page: /billing\n- cart: the basket\n\n## Other\nnot this'
    expect(glossarySection(md)).toBe('- billing page: /billing\n- cart: the basket')
    expect(glossarySection('## Other\nnothing')).toBe('')
    expect(glossaryText('# Terms\n- a\n', true)).toBe('# Terms\n- a')
    expect(glossaryText('x'.repeat(5000), true).length).toBe(GLOSSARY_CAP)
    expect(vagueQuestion('')).not.toContain("project's glossary")
    expect(vagueQuestion('- cart: the basket')).toContain('- cart: the basket')
  })

  test('paths: absolute ones stay as they are, others go under the project root', () => {
    expect(resolvePath('C:/proj/', 'AGENTS.md')).toBe('C:/proj/AGENTS.md')
    expect(resolvePath('C:/proj', 'D:/notes/g.md')).toBe('D:/notes/g.md')
    expect(resolvePath('C:/proj', '/abs/g.md')).toBe('/abs/g.md')
  })

  test('the reason: cleaned, cut to 40 words, empty when nothing is left', () => {
    expect(reasonText('"Name the file."')).toBe('Name the file.')
    const long = Array.from({ length: 50 }, (_, i) => `w${i}`).join(' ')
    const cut = reasonText(long).split(' ')
    expect(cut.length).toBe(40)
    expect(cut.at(-1)?.endsWith('…')).toBe(true)
    expect(reasonText('   ')).toBe('')
  })

  test('summary atom shape: no chip when off; ok while on; warn with the reason while held', () => {
    expect(bounceSummary('off', null)).toBeNull()
    expect(bounceSummary('block', null)).toEqual({ state: 'ok', label: 'bounce block' })
    expect(bounceSummary('warn', REASON)).toEqual({ state: 'warn', label: 'prompt held', detail: REASON })
  })

  test('status text and the debug line: the mode says where it came from; the line never carries the prompt', () => {
    expect(statusText('warn', false)).toBe(`Bounce: warn (the bounce option). ${MODE_NOTE.warn}`)
    expect(statusText('block', true)).toBe(`Bounce: block (this session). ${MODE_NOTE.block}`)
    expect(failLine('classify', 'timeout')).toBe('bws-enhance: bounce classify failed (timeout); the prompt was sent unchanged')
    expect(failLine('reason', 'error')).not.toContain(PROMPT)
    expect(REASON_SYSTEM).toMatch(/at most 40 words/)
  })
})

describe('bouncer', () => {
  test('off by default: a vague prompt is sent as typed and nothing is checked', async ($, on) => {
    const { seen } = world(on)
    const r = await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    expect(r).toMatchObject({ text: PROMPT })
    expect(seen.classify).toEqual([])
    expect(seen.sent).toEqual([{ text: PROMPT, asUser: undefined }])
  })

  test('block: a vague typed prompt is held with the reason, the draft stays in the box, the pane offers Send anyway', { options: { bounce: 'block' } }, async ($, on) => {
    const { seen, clock } = world(on)
    const r = await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    expect(drop(r)).toMatch(new RegExp(`^Held by bws-enhance: ${REASON}`))
    expect(drop(r)).toMatch(/Edit it, or use Send anyway/)
    expect(seen.sent).toEqual([])
    expect(seen.classify[0]?.labels).toEqual(['yes', 'no'])
    expect(seen.classify[0]?.text).toMatch(/<material>\nfix the thing on the settings page\n<\/material>/)
    expect(seen.classify[0]?.options).toEqual({ model: 'haiku' })
    expect(seen.complete[0]?.prompt.startsWith(REASON_SYSTEM)).toBe(true)
    expect(seen.classify.length + seen.complete.length).toBe(2) // at most two small-model calls per prompt
    await clock.advance(10)
    expect(seen.fills).toEqual([PROMPT])
    expect(seen.opened).toEqual([{ id: 'bws-enhance', title: 'Prompt held' }])
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Held as vague/ })).toBeDefined()
    expect(await ui.find({ key: 'sendanyway' })).toBeDefined()
    expect(await ui.find({ key: 'enhance' })).toBeDefined()
    expect(await ui.find({ key: 'edit' })).toBeDefined()
    await ui.unmount()
  })

  test('a clear prompt passes: the classifier says no, the prompt is sent as typed, no reason call', { options: { bounce: 'block' } }, async ($, on) => {
    const { seen } = world(on, { verdict: 'no' })
    const text = 'Fix the null check in src/auth.ts line 42 and run npm test.'
    const r = await $.prompt.submit({ text, origin: COMPOSER, wait: false } as never)
    expect(r).toMatchObject({ text })
    expect(seen.classify.length).toBe(1)
    expect(seen.complete).toEqual([])
  })

  test('Send anyway sends the held text as the person\'s words, once, without a second check', { options: { bounce: 'block' } }, async ($, on) => {
    const { seen, clock } = world(on)
    await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    await clock.advance(10)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'sendanyway' })
    await ui.unmount()
    await clock.advance(10)
    expect(seen.sent).toEqual([{ text: PROMPT, asUser: true }])
    expect(seen.classify.length).toBe(1)
  })

  test('a prompt a plugin or a peer sends is never checked', { options: { bounce: 'block' } }, async ($, on) => {
    const { seen } = world(on)
    const r = await $.prompt.submit({ text: PROMPT, origin: { kind: 'peer' }, wait: false } as never)
    expect(r).toMatchObject({ text: PROMPT })
    expect(seen.classify).toEqual([])
  })

  test('slash commands, short answers, attachments and pastes are not checked; a plain vague prompt is', { options: { bounce: 'block' } }, async ($, on) => {
    const { seen } = world(on, { verdict: 'no' })
    for (const input of [{ text: '/compact' }, { text: 'yes' }, { text: '3' }, { text: 'fix it', attachments: [{ type: 'image' }] }, { text: '[Pasted text #1 +12 lines] make it work' }]) {
      await $.prompt.submit({ ...input, origin: COMPOSER, wait: false } as never)
    }
    expect(seen.classify).toEqual([])
    await $.prompt.submit({ text: 'fix it', origin: COMPOSER, wait: false } as never)
    expect(seen.classify.length).toBe(1)
  })

  test('warn: the first Enter holds the prompt with the reason; the second Enter of the same text sends it', { options: { bounce: 'warn' } }, async ($, on) => {
    const { seen } = world(on)
    const first = await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    expect(drop(first)).toMatch(/Press Enter again to send it as it is/)
    const second = await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    expect(second).toMatchObject({ text: PROMPT })
    expect(seen.classify.length).toBe(1)
    expect(seen.complete.length).toBe(1)
  })

  test('warn: a different text is checked again, and the earlier hold does not send it', { options: { bounce: 'warn' } }, async ($, on) => {
    const { seen } = world(on)
    await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    const other = await $.prompt.submit({ text: 'fix the cart total on checkout', origin: COMPOSER, wait: false } as never)
    expect(drop(other)).toMatch(/^Held by bws-enhance/)
    expect(seen.classify.length).toBe(2)
  })

  test('warn in a headless run (no surface) is not checked', { options: { bounce: 'warn' } }, async ($, on) => {
    const { seen } = world(on, { surfaces: [] })
    const r = await $.prompt.submit({ text: PROMPT, origin: { kind: 'sdk' }, wait: false } as never)
    expect(r).toMatchObject({ text: PROMPT })
    expect(seen.classify).toEqual([])
  })

  test('block in a headless run is refused with the reason, the way a claude -p probe sees it', { options: { bounce: 'block' } }, async ($, on) => {
    const { seen } = world(on, { surfaces: [] })
    const r = await $.prompt.submit({ text: PROMPT, origin: { kind: 'sdk' }, wait: false } as never)
    expect(drop(r)).toMatch(new RegExp(`^Held by bws-enhance: ${REASON} Edit it and send it again\\.$`))
    expect(seen.sent).toEqual([])
  })

  test('a classifier error sends the prompt unchanged and writes one debug line without the prompt', { options: { bounce: 'block' } }, async ($, on) => {
    const { seen } = world(on, { verdict: 'throw' })
    const r = await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    expect(r).toMatchObject({ text: PROMPT })
    expect(seen.logs).toEqual([{ text: 'bws-enhance: bounce classify failed (error); the prompt was sent unchanged', to: 'debug' }])
    expect(seen.logs[0]?.text).not.toContain('settings page')
  })

  test('an unreadable classifier answer sends the prompt unchanged', { options: { bounce: 'block' } }, async ($, on) => {
    const { seen } = world(on, { verdict: 'junk' })
    const r = await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    expect(r).toMatchObject({ text: PROMPT })
    expect(seen.logs[0]?.text).toMatch(/classify failed \(unparsable\)/)
  })

  test('a classifier that does not answer within 4 s sends the prompt unchanged', { options: { bounce: 'block' } }, async ($, on) => {
    const { seen, clock } = world(on, { verdict: 'hang' })
    const pending = $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    await clock.advance(4000)
    const r = await pending
    expect(r).toMatchObject({ text: PROMPT })
    expect(seen.logs[0]?.text).toMatch(/classify failed \(timeout\)/)
  })

  test('a failed reason call sends the prompt unchanged', { options: { bounce: 'block' } }, async ($, on) => {
    const { seen } = world(on, { reply: { isAnswered: false, reason: 'empty-reply' } })
    const r = await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    expect(r).toMatchObject({ text: PROMPT })
    expect(seen.logs[0]?.text).toMatch(/reason failed \(empty-reply\)/)
  })

  test('the glossary reaches the classifier and the reason call; with none the reason call says so', { options: { bounce: 'block' } }, async ($, on) => {
    const { seen } = world(on, { files: { 'docs/GLOSSARY.md': '# Glossary\n- settings page: the page at /settings' } })
    await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    expect(seen.classify[0]?.text).toContain('- settings page: the page at /settings')
    expect(seen.complete[0]?.prompt).toContain('<glossary>\n# Glossary\n- settings page: the page at /settings\n</glossary>')
  })

  test('glossaryFile option: that file is the glossary, docs/GLOSSARY.md is not read', { options: { bounce: 'block', glossaryFile: 'notes/terms.md' } }, async ($, on) => {
    const { seen } = world(on, { files: { 'notes/terms.md': '- hub: the lobby', 'docs/GLOSSARY.md': '- other: ignored' } })
    await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    expect(seen.complete[0]?.prompt).toContain('- hub: the lobby')
    expect(seen.complete[0]?.prompt).not.toContain('- other: ignored')
  })

  test('no docs/GLOSSARY.md: the ## Glossary section of AGENTS.md is the glossary', { options: { bounce: 'block' } }, async ($, on) => {
    const { seen } = world(on, { files: { 'AGENTS.md': '# Rules\n\n## Glossary\n- hub: the lobby\n\n## Testing\nrun the tests' } })
    await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    expect(seen.complete[0]?.prompt).toContain('- hub: the lobby')
    expect(seen.complete[0]?.prompt).not.toContain('run the tests')
  })

  test('Enhance on a held prompt runs the enhance pipeline on it, and the rewrite replaces the box', { options: { bounce: 'block' } }, async ($, on) => {
    const { seen, clock } = world(on)
    await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    await clock.advance(10)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'enhance' })
    await ui.unmount()
    await clock.advance(50)
    expect(seen.complete.some(c => c.prompt.includes(`<rough_request>\n${PROMPT}\n</rough_request>`))).toBe(true)
    expect(seen.fills.at(-1)).toBe(REASON)
  })

  test('no glossary anywhere: the reason call is told there is none', { options: { bounce: 'block' } }, async ($, on) => {
    const { seen } = world(on)
    await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    expect(seen.complete[0]?.prompt).toContain('<glossary>\n(none)\n</glossary>')
  })

  test('/bounce: status, a session mode that holds a vague prompt with no option set, an invalid argument', async ($, on) => {
    const { seen } = world(on)
    expect((await $.command.run({ command: 'bounce', args: '' } as never)).text).toBe(statusText('off', false))
    expect((await $.command.run({ command: 'bounce', args: 'block' } as never)).text).toBe(statusText('block', true))
    expect((await $.command.run({ command: 'bounce', args: 'status' } as never)).text).toBe(statusText('block', true))
    expect((await $.command.run({ command: 'bounce', args: 'loud' } as never)).text).toBe('Usage: /bounce [off|warn|block|status]')
    const r = await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    expect(drop(r)).toMatch(/^Held by bws-enhance/)
    expect(seen.classify.length).toBe(1)
    expect((await $.command.run({ command: 'bounce', args: 'off' } as never)).text).toBe(statusText('off', true))
    const after = await $.prompt.submit({ text: PROMPT, origin: COMPOSER, wait: false } as never)
    expect(after).toMatchObject({ text: PROMPT })
  })
})
