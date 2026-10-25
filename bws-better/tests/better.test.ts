import { test, expect, mock, describe } from 'claude-code/testing'
import type { On } from 'claude-code'
import { lastTab, mountTab, recordTabs } from './tabview'

const ROUGH = 'make a landing page for my game'
const QUESTIONS = JSON.stringify({
  questions: [
    { q: 'Who is the page for?', options: ['New players', 'Press'] },
    { q: 'What tone?', options: ['Calm', 'Hype'] },
    { q: 'Where will it live?', options: ['Steam', 'itch.io'] },
  ],
})
const UPGRADED = 'Write a one-screen landing page for [game name] aimed at new players, in plain HTML. Done when it reads in under a minute.'
const REWRITE = JSON.stringify({ prompt: UPGRADED, added: ['Audience: new players', 'Format: one screen of HTML', 'Done when it reads in a minute'] })

type Reply = { isAnswered: true; text: string } | { isAnswered: false; reason: 'api-error'; status: number }

type Said = { role: 'user' | 'assistant'; text: string }

type World = { surfaces?: string[]; box?: string; replies?: Reply[]; isPlaced?: boolean; store?: Record<string, unknown>; messages?: Said[] | 'throw' }

// Stubs every outside call the mod makes and records what reached the engine.
function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: 1_760_000_000_000 })
  recordTabs(on)
  const store: Record<string, unknown> = { ...(w.store ?? {}) }
  on('store.get', ($, e) => ({ value: store[e.key] }) as never)
  on('store.set', ($, e) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined } as never
  })
  const replies = [...(w.replies ?? [{ isAnswered: true, text: QUESTIONS }, { isAnswered: true, text: REWRITE }])]
  const seen = {
    asks: [] as { system: string; prompt: string }[],
    fills: [] as { text: string; mode?: string }[],
    sent: [] as { text: string; asUser?: boolean; kind: string }[],
    opened: [] as string[],
    closed: [] as string[],
    logs: [] as string[],
    copied: [] as string[],
  }
  let box = w.box ?? ''
  on('command.register', () => ({ value: undefined }) as never)
  on('session.messages', () => {
    if (w.messages === 'throw') throw new Error('no transcript')
    return { value: (w.messages ?? []).map(m => ({ ...m, toolUses: [] })) as never }
  })
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('model.complete', ($, e) => {
    seen.asks.push({ system: String(e.system), prompt: String(e.prompt) })
    const r = replies.shift() ?? { isAnswered: true, text: REWRITE }
    return { value: { ...r, usage: {} } as never }
  })
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.fill', ($, e) => {
    box = e.mode === 'append' ? box + e.text : e.text
    seen.fills.push({ text: e.text, mode: e.mode })
    return { isFilled: true }
  })
  // The engine beneath: what entered the session.
  on('prompt.submit', ($, e) => {
    const o = e.origin as { kind: string; asUser?: boolean }
    seen.sent.push({ text: e.text, asUser: o.asUser, kind: o.kind })
    return { text: e.text } as never
  })
  on('ui.open', async ($, e) => {
    // Settles a few ticks late, as a real open does, so a caller that does not wait for it answers first.
    for (let i = 0; i < 5; i++) await Promise.resolve()
    seen.opened.push(e.id)
    return { value: w.isPlaced === false ? { isPlaced: false, reason: 'narrow' } : { isPlaced: true } } as never
  })
  on('ui.close', ($, e) => {
    seen.closed.push(e.id)
    return { value: undefined } as never
  })
  on('ui.log', ($, e) => {
    seen.logs.push(String((e as unknown as { text: string }).text))
    return { value: undefined } as never
  })
  on('ui.copy', ($, e) => {
    seen.copied.push(e.text)
    return { value: { isCopied: true } } as never
  })
  return { seen, clock, store, setBox: (t: string) => (box = t), box: () => box }
}


const SURFACES = ['terminal', 'desktop'] as const
const typed = (text: string, more: Record<string, unknown> = {}) => ({ text, origin: { kind: 'composer' }, wait: false, ...more }) as never

describe('the full flow', () => {
  test('/better to Run: questions, answers, rewrite, review, Run sends the upgrade as the person', async ($, on) => {
    const { seen, clock, store } = world(on)
    const r = await $.command.run({ command: 'better', args: ROUGH } as never)
    expect(r.text).toMatch(/Upgrading your prompt/)
    await clock.advance(50)
    expect(seen.opened).toEqual(['dashboard'])
    expect(seen.asks[0]?.prompt).toContain(ROUGH)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await mountTab($ as never)
      expect(await ui.find({ type: 'Text', text: 'PROMPT UPGRADE' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Who is the page for?/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '0 of 3 answered' })).toBeDefined()
      expect(await ui.find({ key: 'upgrade' })).toBeDefined()
      await ui.unmount()
    }

    const ui = await mountTab($ as never)
    await ui.press({ key: 'o-0-0' }) // New players
    await ui.press({ key: 'skip-1' }) // tone skipped
    expect(await ui.find({ type: 'Text', text: '2 of 3 answered' })).toBeDefined()
    await ui.press({ key: 'other-2' })
    await ui.input({ key: 'other-input-2', text: 'My own site' })
    await ui.unmount()
    await clock.advance(50)

    const ask = seen.asks[1]
    expect(ask?.prompt).toContain('Who is the page for? New players')
    expect(ask?.prompt).toContain('Where will it live? My own site')
    expect(ask?.prompt).not.toContain('What tone?')
    expect(ask?.system).toMatch(/\[placeholder\]/)

    const review = await mountTab($ as never)
    expect(await review.find({ type: 'Text', text: /words before/ })).toBeDefined()
    expect(await review.find({ type: 'Text', text: '+ Audience: new players' })).toBeDefined()
    expect(await review.find({ type: 'Text', text: UPGRADED })).toBeDefined()
    expect(await review.find({ type: 'Text', text: ROUGH })).toBeDefined()
    await review.press({ key: 'copy' })
    expect(seen.copied).toEqual([UPGRADED])
    expect(await review.find({ type: 'Text', text: 'Copied to the clipboard.' })).toBeDefined()
    await review.press({ key: 'run' })
    await review.unmount()
    await clock.advance(50)
    expect(seen.sent).toEqual([{ text: UPGRADED, asUser: true, kind: 'plugin' }])
    expect(lastTab()?.body.some(n => n.kind === 'text' && /Nothing to upgrade/.test(n.text))).toBe(true)

    // Saved to history; /better history reopens its review.
    expect((store.history as unknown[]).length).toBe(1)
    const h = await $.command.run({ command: 'better', args: 'history' } as never)
    expect(h.text).toMatch(/last 1 upgrade is/)
    const list = await mountTab($ as never)
    const row = await list.find({ type: 'Button', text: new RegExp(ROUGH) })
    expect(row).toBeDefined()
    await list.press({ key: String(row?.key) })
    expect(await list.find({ type: 'Text', text: UPGRADED })).toBeDefined()
    await list.unmount()
  })

  test('no helpful question: straight to the rewrite', async ($, on) => {
    const { seen, clock } = world(on, { replies: [{ isAnswered: true, text: '{"questions":[]}' }, { isAnswered: true, text: REWRITE }] })
    await $.command.run({ command: 'better', args: ROUGH } as never)
    await clock.advance(50)
    await clock.advance(50)
    expect(seen.asks.length).toBe(2)
    const ui = await mountTab($ as never)
    expect(await ui.find({ key: 'run' })).toBeDefined()
    await ui.unmount()
  })

  test('the recent conversation reaches both calls, without the /better turn or the request itself', async ($, on) => {
    const messages: Said[] = [
      { role: 'user', text: 'the login page loops forever after sign-in' },
      { role: 'assistant', text: 'The redirect in auth.ts sends you back to /login.' },
      { role: 'user', text: `/better ${ROUGH}` },
      { role: 'user', text: ROUGH },
    ]
    const { seen, clock } = world(on, { messages, replies: [{ isAnswered: true, text: '{"questions":[]}' }, { isAnswered: true, text: REWRITE }] })
    await $.command.run({ command: 'better', args: ROUGH } as never)
    await clock.advance(50)
    await clock.advance(50)
    expect(seen.asks.length).toBe(2)
    for (const ask of seen.asks) {
      expect(ask.prompt).toContain('<conversation>\nuser: the login page loops forever after sign-in\nassistant: The redirect in auth.ts')
      expect(ask.prompt).not.toContain('/better')
      expect(ask.prompt.split(ROUGH).length).toBe(2) // the request once, in <request>
    }
    expect(seen.logs.some(l => l.includes('login'))).toBe(false)
  })

  for (const messages of [[], 'throw'] as const) {
    test(`no conversation (${messages === 'throw' ? 'unreadable' : 'new session'}): no block, the upgrade still runs`, async ($, on) => {
      const { seen, clock } = world(on, { messages: messages === 'throw' ? 'throw' : [], replies: [{ isAnswered: true, text: '{"questions":[]}' }, { isAnswered: true, text: REWRITE }] })
      await $.command.run({ command: 'better', args: ROUGH } as never)
      await clock.advance(50)
      await clock.advance(50)
      expect(seen.asks.length).toBe(2)
      for (const ask of seen.asks) expect(ask.prompt).not.toContain('<conversation>')
      const ui = await mountTab($ as never)
      expect(await ui.find({ key: 'run' })).toBeDefined()
      await ui.unmount()
    })
  }

  test('Edit puts the upgrade in the box and the next Enter sends it untouched', async ($, on) => {
    const { seen, clock } = world(on, { replies: [{ isAnswered: true, text: '{"questions":[]}' }, { isAnswered: true, text: REWRITE }] })
    await $.command.run({ command: 'better', args: 'on' } as never)
    await $.command.run({ command: 'better', args: ROUGH } as never)
    await clock.advance(50)
    await clock.advance(50)
    const ui = await mountTab($ as never)
    await ui.press({ key: 'edit' })
    await ui.unmount()
    expect(seen.fills.at(-1)?.text).toBe(UPGRADED)
    const r = await $.prompt.submit(typed(`${UPGRADED} Keep it short.`))
    expect(r).toMatchObject({ text: `${UPGRADED} Keep it short.` })
    expect(seen.asks.length).toBe(2)
  })
})

describe('cancel and errors', () => {
  test('Cancel closes the pane and puts the original prompt back in the box', async ($, on) => {
    const { seen, clock, box } = world(on)
    await $.command.run({ command: 'better', args: ROUGH } as never)
    await clock.advance(50)
    const ui = await mountTab($ as never)
    await ui.press({ key: 'cancel' })
    await ui.unmount()
    expect(lastTab()?.body.some(n => n.kind === 'text' && /Nothing to upgrade/.test(n.text))).toBe(true)
    expect(box()).toBe(ROUGH)
    expect(seen.sent).toEqual([])
  })

  test('Cancel keeps what was typed meanwhile', async ($, on) => {
    const { clock, box, setBox } = world(on)
    await $.command.run({ command: 'better', args: ROUGH } as never)
    await clock.advance(50)
    setBox('something new')
    const ui = await mountTab($ as never)
    await ui.press({ key: 'cancel' })
    await ui.unmount()
    expect(box()).toBe(`something new\n\n${ROUGH}`)
  })

  for (const surface of SURFACES) test(`a failed call shows a calm card on ${surface}; Try again recovers, Send my original sends the words as typed`, async ($, on) => {
    const { seen, clock } = world(on, {
      replies: [{ isAnswered: false, reason: 'api-error', status: 529 }, { isAnswered: false, reason: 'api-error', status: 529 }],
    })
    await $.command.run({ command: 'better', args: ROUGH } as never)
    await clock.advance(50)
    const ui = await mountTab($ as never)
    expect(await ui.find({ type: 'Text', text: /Your prompt is safe/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\(529\)/ })).toBeDefined()
    await ui.press({ key: 'retry' })
    await clock.advance(50)
    expect(seen.asks.length).toBe(2)
    expect(await ui.find({ key: 'original' })).toBeDefined()
    await ui.press({ key: 'original' })
    await ui.unmount()
    await clock.advance(50)
    expect(seen.sent).toEqual([{ text: ROUGH, asUser: true, kind: 'plugin' }])
  })
})

describe('automatic mode', () => {
  test('on: a typed prompt goes to the pane instead of being sent; off: it is sent', async ($, on) => {
    const { seen, clock, store } = world(on)
    const r1 = await $.command.run({ command: 'better', args: 'on' } as never)
    expect(r1.text).toMatch(/is on/)
    expect(store.auto).toBe(true)

    const held = await $.prompt.submit(typed(ROUGH))
    expect(held).toMatchObject({ drop: expect.any(String) })
    expect(seen.sent).toEqual([])
    expect(seen.opened).toEqual(['dashboard'])
    await clock.advance(50)
    expect(seen.asks[0]?.prompt).toContain(ROUGH)

    const r2 = await $.command.run({ command: 'better', args: 'off' } as never)
    expect(r2.text).toMatch(/is off/)
    const sent = await $.prompt.submit(typed('another rough prompt for later'))
    expect(sent).toMatchObject({ text: 'another rough prompt for later' })
  })

  test('pass-through: short replies, mid-turn, attachments, and ">" stripped', async ($, on) => {
    const { seen } = world(on, { store: { auto: true } })
    await $.command.run({ command: 'better', args: 'on' } as never)
    expect(await $.prompt.submit(typed('keep going'))).toMatchObject({ text: 'keep going' })
    expect(await $.prompt.submit(typed('also fix the footer layout please', { turnId: 't1' }))).toMatchObject({ text: 'also fix the footer layout please' })
    expect(await $.prompt.submit(typed('what is wrong in this screenshot', { attachments: [{ type: 'image' }] }))).toMatchObject({ text: 'what is wrong in this screenshot' })
    expect(await $.prompt.submit(typed('> rename foo to bar across the repo'))).toMatchObject({ text: 'rename foo to bar across the repo' })
    expect(seen.opened).toEqual([])
    expect(seen.asks).toEqual([])
  })

  test('the upgrade the mod sends never comes back to the pane', async ($, on) => {
    const { seen } = world(on)
    await $.command.run({ command: 'better', args: 'on' } as never)
    const r = await $.prompt.submit({ text: UPGRADED, origin: { kind: 'plugin', name: 'bws-better', asUser: true }, wait: false } as never)
    expect(r).toMatchObject({ text: UPGRADED })
    expect(seen.opened).toEqual([])
  })

  test('taking a prompt empties the box the engine left it in; Cancel puts it back', async ($, on) => {
    const { clock, box, setBox } = world(on)
    await $.command.run({ command: 'better', args: 'on' } as never)
    setBox(ROUGH) // the engine keeps a held prompt's text in the box
    await $.prompt.submit(typed(ROUGH))
    await clock.advance(50)
    expect(box()).toBe('')
    const ui = await mountTab($ as never)
    await ui.press({ key: 'cancel' })
    await ui.unmount()
    expect(box()).toBe(ROUGH)
  })

  test('the box is left alone when something else was typed in it meanwhile', async ($, on) => {
    const { clock, box, setBox } = world(on)
    await $.command.run({ command: 'better', args: 'on' } as never)
    await $.prompt.submit(typed(ROUGH))
    setBox('a different draft')
    await clock.advance(50)
    expect(box()).toBe('a different draft')
  })

  test('too narrow: the words go back in the box and one line says so', async ($, on) => {
    const { seen, clock, box } = world(on, { isPlaced: false })
    await $.command.run({ command: 'better', args: 'on' } as never)
    const r = await $.prompt.submit(typed(ROUGH))
    expect(r).toMatchObject({ drop: expect.stringMatching(/too narrow/) })
    await clock.advance(50)
    expect(box()).toBe(ROUGH)
    expect(seen.asks).toEqual([])
  })
})

describe('reload', () => {
  test('a reload mid-step sends the call again and the stale one is dropped', async ($, on) => {
    const { seen, clock } = world(on, { store: { auto: true } })
    on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
    await $.command.run({ command: 'better', args: ROUGH } as never)
    // The module reloads before the questions call went out: session.start fires again.
    await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true } as never)
    await clock.advance(50)
    expect(seen.asks.length).toBe(1)
    const ui = await mountTab($ as never)
    expect(await ui.find({ type: 'Text', text: /Who is the page for?/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /AUTO ON/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('commands and widths', () => {
  test('/better <prompt> in a window too narrow for the pane: the answer says so and the words go back', async ($, on) => {
    const { seen, clock, box } = world(on, { isPlaced: false })
    const r = await $.command.run({ command: 'better', args: ROUGH } as never)
    expect(r.text).toMatch(/too narrow/)
    expect(box()).toBe(ROUGH)
    await clock.advance(50)
    expect(seen.asks).toEqual([])
    expect(lastTab()?.body.some(n => n.kind === 'text' && /Nothing to upgrade/.test(n.text))).toBe(true)
  })

  for (const surface of SURFACES) test(`/better alone opens a box to type one on ${surface}`, async ($, on) => {
    const { seen, clock } = world(on)
    const r = await $.command.run({ command: 'better', args: '' } as never)
    expect(r.text).toMatch(/Type your rough prompt/)
    const ui = await mountTab($ as never)
    await ui.input({ key: 'compose', text: ROUGH })
    await ui.unmount()
    await clock.advance(50)
    expect(seen.asks[0]?.prompt).toContain(ROUGH)
  })

  test('headless: /better prints the upgrade', async ($, on) => {
    world(on, { surfaces: [], replies: [{ isAnswered: true, text: REWRITE }] })
    const r = await $.command.run({ command: 'better', args: ROUGH } as never)
    expect(r.text).toContain(UPGRADED)
    expect(r.text).toContain('- Audience: new players')
  })

  test('/better history with nothing saved', async ($, on) => {
    world(on)
    const r = await $.command.run({ command: 'better', args: 'history' } as never)
    expect(r.text).toMatch(/No upgrades yet/)
  })

  for (const surface of SURFACES) for (const cols of [40, 160]) {
    test(`the review draws at ${cols} columns on ${surface}`, async ($, on) => {
      const { clock } = world(on, { replies: [{ isAnswered: true, text: '{"questions":[]}' }, { isAnswered: true, text: REWRITE }] })
      await $.command.run({ command: 'better', args: ROUGH } as never)
      await clock.advance(50)
      await clock.advance(50)
      const ui = await mountTab($ as never)
      expect(await ui.find({ key: 'run' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /words before/ })).toBeDefined() // laid out for 100 columns, whatever the dashboard's width
      await ui.unmount()
    })
  }
})
