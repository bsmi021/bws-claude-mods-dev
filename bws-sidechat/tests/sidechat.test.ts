import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.parse('2026-10-12T10:00:00')

const PANE = {
  plugin: 'bws-sidechat',
  component: 'Pane',
  requestId: 'sidechat',
  surface: 'terminal',
  props: { title: 'Side chat', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

type World = { surfaces?: string[]; box?: string; exit?: number; lines?: string[] }

const line = (o: unknown) => JSON.stringify(o) + '\n'
const ANSWER = [
  line({ type: 'system', subtype: 'init', session_id: 'side' }),
  line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'It is ' } } }),
  line({ type: 'assistant', message: { content: [{ type: 'text', text: 'It is the side chat mod.' }] } }),
  line({ type: 'result', is_error: false, result: 'It is the side chat mod.' }),
]

function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: NOW })
  const seen = { opened: [] as { id: string; focus?: boolean }[], closed: [] as string[], toasts: [] as string[], spawns: [] as { argv: readonly string[]; env?: Record<string, string> }[] }
  on('session.id', () => ({ value: 'main-session-id' }))
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('prompt.read', () => ({ value: { text: w.box ?? '', cursor: 0 } }))
  on('ui.open', ($, e) => {
    seen.opened.push({ id: e.id, focus: e.focus })
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    seen.closed.push(e.id)
    return { value: undefined } as never
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(String((e as unknown as { text: string }).text))
    return { value: undefined } as never
  })
  on('process.spawn', async function* ($, e) {
    seen.spawns.push({ argv: e.argv, env: e.env })
    for (const l of w.lines ?? ANSWER) yield { stream: 'stdout' as const, text: l }
    return { value: { code: w.exit ?? 0, signal: null } }
  })
  return { seen, clock }
}

const run = ($: { command: { run: (i: never) => Promise<{ text?: string }> } }, command: string, args = '') => $.command.run({ command, args } as never)

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
