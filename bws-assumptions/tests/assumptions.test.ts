import { test, expect, mock, describe } from 'claude-code/testing'
import type { On } from 'claude-code'
import { add, setCorrection, setVerdict, statusText, summary, verdictPrompt, markSent, listText } from '../hooks/lib'
import type { Assumption } from '../types'

const TOOL = 'mcp__bws-assumptions__record_assumption'
const PANE = {
  plugin: 'bws-assumptions',
  component: 'Pane',
  requestId: 'bws-assumptions',
  props: { title: 'Assumptions', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

// Stubs every outside call the mod makes and records what reached the engine.
function world(on: On, w: { surfaces?: string[]; isPlaced?: boolean } = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  const seen = { sent: [] as { text: string; asUser?: boolean }[], opened: [] as string[], status: [] as (string | undefined)[], toasts: [] as string[] }
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('prompt.submit', ($, e) => {
    seen.sent.push({ text: e.text, asUser: (e.origin as { asUser?: boolean } | undefined)?.asUser })
    return { text: e.text } as never
  })
  on('ui.open', ($, e) => {
    seen.opened.push(e.id)
    return { value: w.isPlaced === false ? { isPlaced: false, reason: 'narrow' } : { isPlaced: true } } as never
  })
  on('ui.status', ($, e) => {
    seen.status.push((e as unknown as { text?: string }).text)
    return { value: undefined } as never
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(String((e as unknown as { text: string }).text))
    return { value: undefined } as never
  })
  return { seen, clock }
}

function three(): Assumption[] {
  let list: Assumption[] = []
  for (const t of ['Use wttr.in', 'City from argv', 'Name the file weather.py']) list = add(list, t, '').list
  return list
}

describe('lib', () => {
  test('numbers in order, never reuses a number after a clear', () => {
    const list = three()
    expect(list.map(a => a.n)).toEqual([1, 2, 3])
    expect(add(list.filter(a => a.n === 3), 'x', '').item.n).toBe(4)
  })

  test('a verdict pressed again goes back to open; sent items are frozen', () => {
    let list = setVerdict(three(), 1, 'wrong')
    expect(list[0]?.verdict).toBe('wrong')
    expect(setVerdict(list, 1, 'wrong')[0]?.verdict).toBe('open')
    list = markSent(list, [1])
    expect(setVerdict(list, 1, 'right')[0]?.verdict).toBe('wrong')
  })

  test('verdict prompt: wrong first with the correction, missing correction asks, right kept', () => {
    let list = setVerdict(setVerdict(setVerdict(three(), 1, 'right'), 2, 'wrong'), 3, 'wrong')
    list = setCorrection(list, 2, 'read the city from an env var CITY')
    const text = verdictPrompt(list.filter(a => a.verdict !== 'open'))
    expect(text.startsWith('Assumption review')).toBe(true)
    expect(text).toContain('A2 is WRONG: "City from argv". Instead: read the city from an env var CITY')
    expect(text).toContain('A3 is WRONG: "Name the file weather.py". No correction given: ask me')
    expect(text).toContain('A1 is right: "Use wttr.in". Keep it.')
    expect(text.indexOf('A2')).toBeLessThan(text.indexOf('A1'))
    expect(text).toContain('Apply each correction now')
  })

  test('a typed but unsaved correction is used over the saved one', () => {
    const list = setVerdict(three(), 2, 'wrong')
    expect(verdictPrompt([list[1]!], new Map([[2, 'env var']]))).toContain('Instead: env var')
  })

  test('summary and status line', () => {
    const list = setVerdict(three(), 1, 'right')
    expect(summary(list)).toBe('⚑ 3 assumptions · 2 to review · 1 ready to send')
    expect(statusText(list)).toBe('⚑ 3 assumptions · 2 to review · 1 ready to send · /assumptions')
    expect(statusText(markSent(list, [1, 2, 3]))).toBeUndefined()
    expect(statusText([])).toBeUndefined()
    expect(listText([])).toBe('No assumptions recorded in this session.')
  })
})

describe('mod', () => {
  test('the tool records, numbers, opens the pane and sets the status', async ($, on) => {
    const { seen } = world(on)
    const r = await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in', why: 'no API key' } as never)
    expect(String((r as { result?: unknown }).result)).toContain('Recorded as A1. Keep working')
    const r2 = await $.tool.call({ tool: TOOL, assumption: 'City from argv' } as never)
    expect(String((r2 as { result?: unknown }).result)).toContain('Recorded as A2')
    expect(seen.opened).toEqual(['bws-assumptions', 'bws-assumptions'])
    expect(seen.status.at(-1)).toBe('⚑ 2 assumptions · 2 to review · /assumptions')
  })

  test('an empty assumption is refused', async ($, on) => {
    world(on)
    const r = await $.tool.call({ tool: TOOL, assumption: '  ' } as never)
    expect(String((r as { deny?: string }).deny)).toContain('needs `assumption`')
  })

  test('collapsed to one line; expand, mark, correct and send hands the verdicts to Claude as the user', async ($, on) => {
    const { seen, clock } = world(on)
    await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in' } as never)
    await $.tool.call({ tool: TOOL, assumption: 'City from argv' } as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: /2 assumptions · 2 to review/ })).toBeDefined()
      expect(await ui.find({ key: 'expand' })).toBeDefined()
      expect(await ui.find({ key: 'right-1' })).toBeUndefined()
      await ui.unmount()
    }
    let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'expand' })
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'A1 Use wttr.in' })).toBeDefined()
    expect(await ui.find({ key: 'fix-2' })).toBeUndefined()
    await ui.press({ key: 'right-1' })
    await ui.press({ key: 'wrong-2' })
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ key: 'fix-2' })).toBeDefined()
    await ui.input({ key: 'fix-2', text: 'read it from env var CITY' })
    await ui.press({ key: 'send' })
    await ui.unmount()
    await clock.advance(50)
    expect(seen.sent.length).toBe(1)
    expect(seen.sent[0]?.asUser).toBe(true)
    expect(seen.sent[0]?.text).toContain('A2 is WRONG: "City from argv". Instead: read it from env var CITY')
    expect(seen.sent[0]?.text).toContain('A1 is right')
    expect(seen.status.at(-1)).toBeUndefined()
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /2 sent: A1 right, A2 wrong/ })).toBeDefined()
    expect(await ui.find({ key: 'right-1' })).toBeUndefined()
    await ui.unmount()
  })

  test('send with nothing marked submits nothing', async ($, on) => {
    const { seen, clock } = world(on)
    await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in' } as never)
    let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'expand' })
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'send' })
    await ui.unmount()
    await clock.advance(50)
    expect(seen.sent).toEqual([])
    expect(seen.toasts.at(-1)).toContain('mark one Right or Wrong first')
  })

  test('the guide joins the system prompt only where the tool is offered', async ($, on) => {
    on('prompt.compose', () => ({ sections: [{ id: 'core', text: 'core', scope: 'shared' as const }] }))
    const withTool = await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], outputStyle: null, traits: [], tools: ['Bash', TOOL] })
    expect(withTool.sections.map(s => s.id)).toEqual(['core', 'bws-assumptions:guide'])
    expect(withTool.sections.at(-1)?.text).toContain('mcp__bws-assumptions__record_assumption')
    const without = await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], outputStyle: null, traits: [], tools: ['Bash'] })
    expect(without.sections.map(s => s.id)).toEqual(['core'])
  })

  test('headless /assumptions lists them as text', async ($, on) => {
    world(on, { surfaces: [] })
    await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in', why: 'no key' } as never)
    const r = await $.command.run({ command: 'assumptions', args: '' } as never)
    expect(r.text).toContain('A1 [to review] Use wttr.in (no key)')
  })

  test('/assumptions in a narrow terminal still answers with the list', async ($, on) => {
    world(on, { isPlaced: false })
    await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in' } as never)
    const r = await $.command.run({ command: 'assumptions', args: '' } as never)
    expect(r.text).toContain('A1 [to review] Use wttr.in')
  })
})
