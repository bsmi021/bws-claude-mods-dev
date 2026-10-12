import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.parse('2026-10-12T10:00:00')
const NL = String.fromCharCode(10)

const pane = (bodyRows = 30) =>
  ({
    plugin: 'bws-sidechat',
    component: 'Pane',
    requestId: 'sidechat',
    surface: 'terminal',
    props: { title: 'Side chat', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
  }) as const
const PANE = pane()

type World = {
  surfaces?: string[]
  box?: string
  exit?: number
  lines?: string[]
  hold?: boolean // the child says one thing, then is silent until something kills it
  grantsFocus?: boolean // false: the engine keeps the keys with the prompt
}

const line = (o: unknown) => JSON.stringify(o) + NL
const ANSWER = [
  line({ type: 'system', subtype: 'init', session_id: 'side' }),
  line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'It is ' } } }),
  line({ type: 'assistant', message: { content: [{ type: 'text', text: 'It is the side chat mod.' }] } }),
  line({ type: 'result', is_error: false, result: 'It is the side chat mod.' }),
]
const LONG_TEXT = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}: lighthouses guard the coast with a light that can be seen for many miles at sea.`).join(NL + NL)
const LONG = [
  line({ type: 'system', subtype: 'init', session_id: 'side' }),
  line({ type: 'assistant', message: { content: [{ type: 'text', text: LONG_TEXT }] } }),
  line({ type: 'result', is_error: false, result: LONG_TEXT }),
]

function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: NOW })
  const seen = {
    opened: [] as { id: string; focus?: boolean }[],
    closed: [] as string[],
    toasts: [] as string[],
    spawns: [] as { argv: readonly string[]; env?: Record<string, string> }[],
    focused: [] as string[],
    kills: [] as (readonly string[])[],
  }
  let isFocused = false
  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  on('session.id', () => ({ value: 'main-session-id' }))
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('prompt.read', () => ({ value: { text: w.box ?? '', cursor: 0 } }))
  on('env.get', () => ({ value: 'Windows_NT' as never }))
  on('ui.open', ($, e) => {
    seen.opened.push({ id: e.id, focus: e.focus })
    if (e.focus === true && w.grantsFocus !== false) isFocused = true
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: (seen.opened.length === 0 ? [] : [{ id: 'sidechat', title: 'Side chat', isShown: true, isFocused, isPlaced: true }]) as never }))
  on('ui.focus', ($, e) => {
    seen.focused.push(String(e.element))
    return {}
  })
  on('ui.close', ($, e) => {
    seen.closed.push(e.id)
    return { value: undefined } as never
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(String((e as unknown as { text: string }).text))
    return { value: undefined } as never
  })
  on('process.run', ($, e) => {
    seen.kills.push(e.argv)
    release()
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } as never }
  })
  on('process.spawn', async function* ($, e) {
    seen.spawns.push({ argv: e.argv, env: e.env })
    if (w.hold === true) {
      yield { stream: 'stdout' as const, text: line({ type: 'system', subtype: 'init', session_id: 'side' }) }
      await gate // only a kill ends it: no piece arrives meanwhile
      return { value: { code: null, signal: 'SIGKILL' } }
    }
    for (const l of w.lines ?? ANSWER) yield { stream: 'stdout' as const, text: l }
    return { value: { code: w.exit ?? 0, signal: null } }
  })
  return { seen, clock }
}

const run = ($: { command: { run: (i: never) => Promise<{ text?: string }> } }, command: string, args = '') => $.command.run({ command, args } as never)
const sideIdOf = (argv: readonly string[]) => /--session-id (\S+)/.exec(argv.join(' '))?.[1]

describe('/btw', () => {
  test('forks the conversation and asks the question in a child process, not the main session', async ($, on) => {
    const { seen, clock } = world(on)
    const r = await run($, 'btw', 'what mod is this?')
    expect(r.text ?? '').toBe('')
    await clock.advance(100)
    // opened inside the command (counts as asked, so it is placed at any width), then focus asked for once the box is clear
    expect(seen.opened).toEqual([{ id: 'sidechat', focus: undefined }, { id: 'sidechat', focus: true }])
    expect(seen.spawns).toHaveLength(1)
    const argv = (seen.spawns[0]?.argv ?? []).join(' ')
    expect(argv).toContain('claude -p what mod is this? --resume main-session-id --fork-session --session-id ')
    expect(seen.spawns[0]?.env).toEqual({ CLAUDE_CODE_PLUGIN_DIRS: '' })
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: 'what mod is this?' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'It is the side chat mod.' })).toBeDefined()
    await ui.unmount()
  })

  test('a second /btw continues the same side session', async ($, on) => {
    const { seen, clock } = world(on)
    await run($, 'btw', 'first')
    await clock.advance(100)
    await run($, 'btw', 'second')
    await clock.advance(100)
    expect(seen.spawns).toHaveLength(2)
    const first = (seen.spawns[0]?.argv ?? []).join(' ')
    const second = (seen.spawns[1]?.argv ?? []).join(' ')
    const sideId = /--session-id (\S+)/.exec(first)?.[1]
    expect(sideId).toBeDefined()
    expect(second).toContain(`--resume ${sideId}`)
    expect(second).not.toContain('--fork-session')
  })

  test('with nothing typed it only opens the pane', async ($, on) => {
    const { seen, clock } = world(on)
    await run($, 'btw', '')
    await clock.advance(100)
    expect(seen.opened).toHaveLength(2)
    expect(seen.spawns).toHaveLength(0)
  })

  test('headless: left to the built-in command', async ($, on) => {
    const { seen, clock } = world(on, { surfaces: [] })
    on('command.run', () => ({ text: 'built-in btw' }))
    const r = await run($, 'btw', 'q')
    await clock.advance(100)
    expect(r.text).toBe('built-in btw')
    expect(seen.opened).toEqual([])
    expect(seen.spawns).toEqual([])
  })

  test('takeOverBtw off: left to the built-in command', { options: { takeOverBtw: false } }, async ($, on) => {
    const { seen, clock } = world(on)
    on('command.run', () => ({ text: 'built-in btw' }))
    const r = await run($, 'btw', 'q')
    await clock.advance(100)
    expect(r.text).toBe('built-in btw')
    expect(seen.spawns).toEqual([])
  })
})

describe('/fork and /side', () => {
  test('/fork opens an empty side chat; the fork is taken on the first message', async ($, on) => {
    const { seen, clock } = world(on)
    await run($, 'fork')
    await clock.advance(100)
    expect(seen.opened).toHaveLength(2)
    expect(seen.spawns).toHaveLength(0)
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /forked from main-ses/ })).toBeDefined()
    await ui.unmount()
  })

  test('/branch is the same as /fork', async ($, on) => {
    const { seen, clock } = world(on)
    await run($, 'branch')
    await clock.advance(100)
    expect(seen.opened).toHaveLength(2)
  })

  test('/fork native hands the command back to the built-in with the rest of the arguments', async ($, on) => {
    const { seen, clock } = world(on)
    const got: string[] = []
    on('command.run', (_$, e) => {
      got.push(e.args)
      return { text: 'built-in fork' }
    })
    const r = await run($, 'fork', 'native my branch')
    await clock.advance(100)
    expect(r.text).toBe('built-in fork')
    expect(got).toEqual(['my branch'])
    expect(seen.opened).toEqual([])
  })

  test('/side new <message> starts a fresh fork and asks', async ($, on) => {
    const { seen, clock } = world(on)
    await run($, 'side', 'new why is it slow')
    await clock.advance(200)
    expect(seen.spawns).toHaveLength(1)
    expect((seen.spawns[0]?.argv ?? []).join(' ')).toContain('why is it slow --resume main-session-id --fork-session')
  })

  test('/side close closes the pane', async ($, on) => {
    const { seen } = world(on)
    await run($, 'side', 'close')
    expect(seen.closed).toEqual(['sidechat'])
  })
})

describe('keyboard focus', () => {
  test('/btw asks for the keys once, and not again when they are granted', async ($, on) => {
    const { seen, clock } = world(on)
    await run($, 'btw', 'q')
    await clock.advance(1000)
    expect(seen.opened.filter(o => o.focus === true)).toHaveLength(1) // granted at once, so not asked again
    // (the ring move itself, $.ui.focus, is answered by the engine before a test can see it: it needs a surface holding the keys)
    expect(seen.spawns).toHaveLength(1)
  })

  test('/fork does the same', async ($, on) => {
    const { seen, clock } = world(on)
    await run($, 'fork')
    await clock.advance(1000)
    expect(seen.opened.filter(o => o.focus === true)).toHaveLength(1)
  })

  test('when the engine keeps the keys with the prompt, the request is repeated a few times after the command returns', async ($, on) => {
    const { seen, clock } = world(on, { grantsFocus: false })
    await run($, 'fork')
    await clock.advance(1000)
    expect(seen.opened.filter(o => o.focus === true)).toHaveLength(3)
    await clock.advance(5000)
    expect(seen.opened.filter(o => o.focus === true)).toHaveLength(3) // and then stops
  })

  test('a person already typing in the prompt keeps the keys', async ($, on) => {
    const { seen, clock } = world(on, { box: 'half a thought' })
    await run($, 'fork')
    await clock.advance(1000)
    expect(seen.opened.filter(o => o.focus === true)).toHaveLength(0)
  })
})

describe('a long answer', () => {
  test('never pushes the Ask box out of the pane', async ($, on) => {
    const { clock } = world(on, { lines: LONG })
    await run($, 'btw', 'write an essay')
    await clock.advance(200)
    for (const rows of [12, 20, 30]) {
      const ui = await $.ui.mount(pane(rows))
      expect(await ui.find({ type: 'Input' })).toBeDefined()
      expect(await ui.find({ key: 'older' })).toBeDefined()
      expect(await ui.find({ key: 'newer' })).toBeUndefined()
      // header (2) + the rows left for the transcript: nothing else draws as text
      const texts = await ui.findAll({ type: 'Text' })
      expect(texts.length).toBeLessThanOrEqual(rows - 3)
      await ui.unmount()
    }
  })

  test('the newest rows show first', async ($, on) => {
    const { clock } = world(on, { lines: LONG })
    await run($, 'btw', 'write an essay')
    await clock.advance(200)
    const ui = await $.ui.mount(pane(20))
    expect(await ui.find({ type: 'Text', text: /Paragraph 40/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Paragraph 1:/ })).toBeUndefined()
    await ui.unmount()
  })
})

describe('scroll buttons', () => {
  test('step by rows: up shows older rows and a way back, down returns to the newest', async ($, on) => {
    const { clock } = world(on, { lines: LONG })
    await run($, 'btw', 'write an essay')
    await clock.advance(200)
    const ui = await $.ui.mount(pane(20))
    const above = async () => Number(/(\d+) rows above/.exec(String((await ui.find({ key: 'older' }))?.props?.label))?.[1])
    const first = await above()
    expect(first).toBeGreaterThan(0)
    await ui.press({ key: 'older' })
    const second = await above()
    // roomOf(20) = 13 rows, half of it = 6 rows a press: a small, even step and not a whole message
    expect(first - second).toBe(6)
    expect(String((await ui.find({ key: 'newer' }))?.props?.label)).toContain('6 rows below')
    await ui.press({ key: 'newer' })
    expect(await ui.find({ key: 'newer' })).toBeUndefined()
    expect(await above()).toBe(first)
    await ui.unmount()
  })

  test('pressing up far past the top stops at the first row', async ($, on) => {
    const { clock } = world(on, { lines: LONG })
    await run($, 'btw', 'write an essay')
    await clock.advance(200)
    const ui = await $.ui.mount(pane(20))
    for (let i = 0; i < 60 && (await ui.find({ key: 'older' })) !== undefined; i++) await ui.press({ key: 'older' })
    expect(await ui.find({ key: 'older' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'You' })).toBeDefined()
    await ui.unmount()
  })
})

describe('Stop', () => {
  test('kills the child at once, even when it is silent, and says so', async ($, on) => {
    const { seen, clock } = world(on, { hold: true })
    await run($, 'btw', 'think hard')
    await clock.advance(200)
    const sideId = sideIdOf(seen.spawns[0]?.argv ?? [])
    expect(sideId).toBeDefined()
    const ui = await $.ui.mount(pane(20))
    expect(await ui.find({ key: 'stop' })).toBeDefined()
    await ui.press({ key: 'stop' })
    expect(seen.kills).toHaveLength(1)
    const argv = seen.kills[0] ?? []
    expect(argv[0]).toBe('powershell')
    expect(argv.at(-1)).toContain(String(sideId))
    await clock.advance(200)
    expect(await ui.find({ key: 'stop' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Stopped\./ })).toBeDefined()
    await ui.unmount()
  })

  test('Stop takes the keyboard back for the Ask box: the Stop button held it and is gone', async ($, on) => {
    // the engine keeps the keys with the prompt (grantsFocus false), as it does once the Stop button that held the ring is gone
    const { seen, clock } = world(on, { hold: true, grantsFocus: false })
    await run($, 'btw', 'think hard')
    await clock.advance(200)
    const asked = () => seen.opened.filter(o => o.focus === true).length
    const before = asked()
    const ui = await $.ui.mount(pane(20))
    await ui.press({ key: 'stop' })
    await ui.unmount()
    expect(asked()).toBe(before + 1) // no clock time passed, so this is Stop's own request and not a later retry
  })

  test('after Stop the next message resumes the same fork (it exists once the child said hello)', async ($, on) => {
    const { seen, clock } = world(on, { hold: true })
    await run($, 'btw', 'first')
    await clock.advance(200)
    const ui = await $.ui.mount(pane(20))
    await ui.press({ key: 'stop' })
    await clock.advance(200)
    await ui.unmount()
    await run($, 'btw', 'second')
    await clock.advance(200)
    const sideId = sideIdOf(seen.spawns[0]?.argv ?? [])
    expect((seen.spawns[1]?.argv ?? []).join(' ')).toContain(`--resume ${sideId}`)
  })

  test('a new fork while one is answering kills the old child', async ($, on) => {
    const { seen, clock } = world(on, { hold: true })
    await run($, 'btw', 'slow one')
    await clock.advance(200)
    await run($, 'fork')
    await clock.advance(200)
    expect(seen.kills).toHaveLength(1)
    expect((seen.kills[0] ?? []).at(-1)).toContain(String(sideIdOf(seen.spawns[0]?.argv ?? [])))
  })

  test('Close while answering kills the child too', async ($, on) => {
    const { seen, clock } = world(on, { hold: true })
    await run($, 'btw', 'slow one')
    await clock.advance(200)
    await run($, 'side', 'close')
    expect(seen.kills).toHaveLength(1)
    expect(seen.closed).toEqual(['sidechat'])
  })

  test('Stop with nothing running does nothing', async ($, on) => {
    const { seen, clock } = world(on)
    await run($, 'btw', 'quick')
    await clock.advance(200)
    const ui = await $.ui.mount(pane(20))
    expect(await ui.find({ key: 'stop' })).toBeUndefined()
    await ui.unmount()
    expect(seen.kills).toEqual([])
  })
})

const footer = (surface: 'terminal' | 'desktop' = 'terminal', modes: string[] = ['plan']) =>
  ({ plugin: 'bws-sidechat', component: 'SessionMode', surface, props: { modes } }) as const

describe('hotkey', () => {
  test('the footer carries a side button on the chord action, beside the engine mode labels', async ($, on) => {
    world(on)
    const ui = await $.ui.mount(footer())
    const button = await ui.find({ key: 'side' })
    expect(button).toBeDefined()
    expect(button?.props?.action).toBe('app:cycleDiffBase')
    expect(String(button?.props?.label)).toContain('side')
    expect(await ui.find({ type: 'Text', text: 'plan' })).toBeDefined()
    await ui.unmount()
  })

  test('beside another mod footer (bws-enhance draws one): both stay, the mode labels are drawn once', async ($, on) => {
    world(on)
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['enhance footer'] }) as never)
    const ui = await $.ui.mount(footer())
    expect(await ui.find({ type: 'Text', text: 'enhance footer' })).toBeDefined()
    expect(await ui.find({ key: 'side' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'plan' })).toBeUndefined()
    await ui.unmount()
  })

  test('pressing it opens the pane with no command typed, and takes the keys', async ($, on) => {
    const { seen, clock } = world(on)
    const ui = await $.ui.mount(footer())
    expect(seen.opened).toEqual([])
    await ui.press({ key: 'side' })
    expect(seen.opened[0]).toEqual({ id: 'sidechat', focus: undefined })
    await clock.advance(100)
    expect(seen.opened.filter(o => o.focus === true)).toHaveLength(1)
    expect(seen.spawns).toEqual([]) // nothing is asked of the model by opening it
    await ui.unmount()
  })

  test('it brings back the side chat that is there, not a new one', async ($, on) => {
    const { seen, clock } = world(on)
    await run($, 'btw', 'first question')
    await clock.advance(200)
    await run($, 'side', 'close')
    const ui = await $.ui.mount(footer())
    await ui.press({ key: 'side' })
    await clock.advance(100)
    await ui.unmount()
    const pane1 = await $.ui.mount(PANE)
    expect(await pane1.find({ type: 'Text', text: 'first question' })).toBeDefined()
    await pane1.unmount()
    expect(seen.spawns).toHaveLength(1)
  })

  test('with text in the prompt the pane opens but the keys stay with the person', async ($, on) => {
    const { seen, clock } = world(on, { box: 'half a thought' })
    const ui = await $.ui.mount(footer())
    await ui.press({ key: 'side' })
    await clock.advance(1000)
    expect(seen.opened).toEqual([{ id: 'sidechat', focus: undefined }])
    await ui.unmount()
  })

  test('chordAction picks the engine action', { options: { chordAction: 'app:toggleDiffNoiseFilter' } }, async ($, on) => {
    world(on)
    const ui = await $.ui.mount(footer())
    expect((await ui.find({ key: 'side' }))?.props?.action).toBe('app:toggleDiffNoiseFilter')
    await ui.unmount()
  })

  test('chordAction empty: the plugin draws nothing, so the engine draws its own footer', { options: { chordAction: '' } }, async ($, on) => {
    world(on)
    on('ui.render', () => ({ type: 'engine' }) as never)
    let drew = true
    try {
      const ui = await $.ui.mount(footer())
      await ui.unmount()
    } catch (err) {
      drew = !String(err).includes('drew nothing')
    }
    expect(drew).toBe(false)
  })

  test('not on the terminal (desktop): no button', async ($, on) => {
    world(on)
    on('ui.render', () => ({ type: 'engine' }) as never)
    let drew = true
    try {
      const ui = await $.ui.mount(footer('desktop'))
      await ui.unmount()
    } catch (err) {
      drew = !String(err).includes('drew nothing')
    }
    expect(drew).toBe(false)
  })

  test('headless: pressing opens nothing', async ($, on) => {
    const { seen, clock } = world(on, { surfaces: [] })
    const ui = await $.ui.mount(footer())
    await ui.press({ key: 'side' })
    await clock.advance(100)
    expect(seen.opened).toEqual([])
    await ui.unmount()
  })
})

describe('failures', () => {
  test('a child that dies shows why in the pane and leaves the fork unmade', async ($, on) => {
    const { clock } = world(on, { lines: [], exit: 1 })
    await run($, 'btw', 'q')
    await clock.advance(100)
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /side chat process ended \(exit 1\)/ })).toBeDefined()
    await ui.unmount()
  })
})
