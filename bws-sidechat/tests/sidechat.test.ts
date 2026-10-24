import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { lastTab, mountChat, recordTabs } from './tabview'
import { PNG_2X2 } from './pngs'

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
  alwaysFocused?: boolean // the pane reports isFocused true even while the keys are on the prompt, as the real engine does
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
  recordTabs(on)
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
  on('ui.panes', () => ({ value: (seen.opened.length === 0 ? [] : [{ id: 'dashboard', title: 'Dashboard', isShown: true, isFocused: isFocused || w.alwaysFocused === true, isPlaced: true }]) as never }))
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
    // bws-cockpit opens the dashboard with the keys, inside this command (its state.set hook is awaited): the mod opens nothing
    expect(seen.opened).toEqual([])
    expect(lastTab()?.open).toBe(1)
    expect(seen.spawns).toHaveLength(1)
    const argv = (seen.spawns[0]?.argv ?? []).join(' ')
    expect(argv).toContain('claude -p what mod is this? --resume main-session-id --fork-session --session-id ')
    expect(seen.spawns[0]?.env).toEqual({ CLAUDE_CODE_PLUGIN_DIRS: '' })
    const ui = await mountChat($ as never)
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
    expect(lastTab()?.open).toBe(1)
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
    expect(lastTab()?.open).toBe(1)
    expect(seen.spawns).toHaveLength(0)
    const ui = await mountChat($ as never)
    expect(await ui.find({ type: 'Text', text: /forked from main-ses/ })).toBeDefined()
    await ui.unmount()
  })

  test('/branch is the same as /fork', async ($, on) => {
    const { seen, clock } = world(on)
    await run($, 'branch')
    await clock.advance(100)
    expect(lastTab()?.open).toBe(1)
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

  test('/side close ends the side chat; the dashboard stays open for its other tabs', async ($, on) => {
    const { seen } = world(on)
    await run($, 'side', 'close')
    expect(seen.closed).toEqual([])
  })
})

describe('keyboard focus', () => {
  test('each command asks bws-cockpit once to open the dashboard with the keys; the mod opens and refocuses nothing itself', async ($, on) => {
    const { seen, clock } = world(on)
    await run($, 'btw', 'q')
    await clock.advance(1000)
    expect(lastTab()?.open).toBe(1)
    await run($, 'fork')
    await clock.advance(1000)
    expect(lastTab()?.open).toBe(2)
    expect(seen.opened).toEqual([])
    expect(seen.focused).toEqual([])
  })

  test('the Ask box is marked focused, and is a new one after each question (cockpit moves the ring to it)', async ($, on) => {
    const { clock } = world(on)
    const inputs = () => (lastTab()?.body ?? []).flatMap(n => (n.kind === 'input' ? [n] : []))
    await run($, 'fork')
    expect(inputs()).toEqual([{ kind: 'input', id: 'ask-0', placeholder: '💭 ask the side chat, Enter sends', isFocused: true }])
    await run($, 'btw', 'q')
    await clock.advance(200)
    expect(inputs().map(n => [n.id, n.isFocused])).toEqual([['ask-1', true]])
  })

  test('with text in the prompt box the footer button shows the tab without asking for the keys', async ($, on) => {
    const { seen } = world(on, { box: 'half a thought' })
    const ui = await $.ui.mount(footer())
    await ui.press({ key: 'side' })
    await ui.unmount()
    expect(lastTab()?.open).toBeUndefined()
    expect(seen.opened).toEqual([{ id: 'dashboard', focus: undefined }])
  })
})

describe('the conversation', () => {
  test('each message is a card with its markdown; a long answer is drawn whole, the Ask box last', async ($, on) => {
    const { clock } = world(on, { lines: LONG })
    await run($, 'btw', 'write an essay')
    await clock.advance(200)
    const body = lastTab()?.body ?? []
    const cards = body.flatMap(n => (n.kind === 'card' ? [n] : []))
    expect(cards.map(c => c.title)).toEqual(['🧑 You', '🤖 Claude'])
    const answer = cards[1]?.body[0]
    expect(answer?.kind).toBe('markdown')
    expect(answer?.kind === 'markdown' && answer.text.includes('Paragraph 1:') && answer.text.includes('Paragraph 40')).toBe(true)
    expect(body.at(-1)?.kind).toBe('input')
  })

  test('no previous / next buttons: the dashboard scrolls; it is pinned to the end only while asked for or answering', async ($, on) => {
    const { clock } = world(on, { hold: true })
    await run($, 'btw', 'think hard')
    await clock.advance(200)
    const ids = () => (lastTab()?.body ?? []).flatMap(n => (n.kind === 'buttons' ? n.items.map(b => b.id) : []))
    expect(ids()).not.toContain('older')
    expect(ids()).not.toContain('newer')
    expect((lastTab() as { isPinnedEnd?: boolean }).isPinnedEnd).toBe(true)
    await run($, 'side', '--stop')
    await clock.advance(200)
    // read in peace: a later write (a model change, say) does not pull the dashboard to the end
    await run($, 'side', '--model-opus')
    expect((lastTab() as { isPinnedEnd?: boolean }).isPinnedEnd).toBeUndefined()
  })

  test('tool runs fold into one dim line between the cards', async ($, on) => {
    const lines = [
      line({ type: 'system', subtype: 'init', session_id: 'side' }),
      line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } }] } }),
      line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Grep', input: { pattern: 'x' } }] } }),
      line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Found it.' }] } }),
      line({ type: 'result', is_error: false, result: 'Found it.' }),
    ]
    const { clock } = world(on, { lines })
    await run($, 'btw', 'where?')
    await clock.advance(200)
    const texts = (lastTab()?.body ?? []).flatMap(n => (n.kind === 'text' ? [n.text] : []))
    expect(texts).toContain('🔧 Read a.ts · Grep x')
  })
})

describe('Stop', () => {
  test('kills the child at once, even when it is silent, and says so', async ($, on) => {
    const { seen, clock } = world(on, { hold: true })
    await run($, 'btw', 'think hard')
    await clock.advance(200)
    const sideId = sideIdOf(seen.spawns[0]?.argv ?? [])
    expect(sideId).toBeDefined()
    const ui = await mountChat($ as never)
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

  test('Stop has no hotkey (typing must reach the Ask box) and the Ask box stays the focused element', async ($, on) => {
    const { clock } = world(on, { hold: true })
    await run($, 'btw', 'think hard')
    await clock.advance(200)
    const stop = (lastTab()?.body ?? []).flatMap(n => (n.kind === 'buttons' ? n.items : [])).find(b => b.id === 'stop')
    expect(stop).toEqual({ id: 'stop', label: '⏹ Stop' })
    const ui = await mountChat($ as never)
    await ui.press({ key: 'stop' })
    await ui.unmount()
    expect((lastTab()?.body ?? []).some(n => n.kind === 'input' && n.isFocused === true)).toBe(true)
  })

  test('after Stop the next message resumes the same fork (it exists once the child said hello)', async ($, on) => {
    const { seen, clock } = world(on, { hold: true })
    await run($, 'btw', 'first')
    await clock.advance(200)
    const ui = await mountChat($ as never)
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
  })

  test('Stop with nothing running does nothing', async ($, on) => {
    const { seen, clock } = world(on)
    await run($, 'btw', 'quick')
    await clock.advance(200)
    const ui = await mountChat($ as never)
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
    expect(lastTab()?.open).toBe(1) // cockpit opens it with the keys
    await clock.advance(100)
    expect(seen.opened).toEqual([])
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
    const pane1 = await mountChat($ as never)
    expect(await pane1.find({ type: 'Text', text: 'first question' })).toBeDefined()
    await pane1.unmount()
    expect(seen.spawns).toHaveLength(1)
  })

  test('with text in the prompt the pane opens but the keys stay with the person', async ($, on) => {
    const { seen, clock } = world(on, { box: 'half a thought' })
    const ui = await $.ui.mount(footer())
    await ui.press({ key: 'side' })
    await clock.advance(1000)
    expect(seen.opened).toEqual([{ id: 'dashboard', focus: undefined }])
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
    on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
    const ui = await $.ui.mount(footer())
    expect(await ui.find({ key: 'side' })).toBeUndefined()
    await ui.unmount()
  })

  test('desktop: the button is drawn without the chord action, and a click opens the side chat', async ($, on) => {
    const { seen, clock } = world(on)
    const ui = await $.ui.mount(footer('desktop'))
    const button = await ui.find({ key: 'side' })
    expect(button).toBeDefined()
    expect(button?.props?.action).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'plan' })).toBeDefined()
    await ui.press({ key: 'side' })
    expect(lastTab()?.open).toBe(1)
    await clock.advance(100)
    expect(seen.spawns).toEqual([])
    await ui.unmount()
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
    const ui = await mountChat($ as never)
    expect(await ui.find({ type: 'Text', text: /side chat process ended \(exit 1\)/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('desktop', () => {
  const DESK = { ...PANE, surface: 'desktop' } as const

  test('/btw draws the side chat on the desktop: answer, Ask box, follow-up, send to main', async ($, on) => {
    const { seen, clock } = world(on, { surfaces: ['desktop'] })
    const sent: string[] = []
    on('prompt.submit', ($, e) => {
      sent.push(e.text)
      return { text: e.text } as never
    })
    await run($, 'btw', 'what mod is this?')
    await clock.advance(100)
    expect(seen.spawns).toHaveLength(1)
    const ui = await mountChat($ as never)
    await ui.drawn() // rejects if the desktop table refuses the tree
    expect(await ui.find({ type: 'Text', text: 'It is the side chat mod.' })).toBeDefined()
    const ask = await ui.find({ type: 'Input' })
    expect(ask).toBeDefined()
    await ui.input({ key: String(ask?.key), text: 'and then?' })
    await clock.advance(100)
    expect(seen.spawns).toHaveLength(2)
    expect((seen.spawns[1]?.argv ?? []).join(' ')).toContain('and then?')
    const back = (await ui.findAll({ type: 'Button' })).filter(b => String(b.key).startsWith('send-'))
    expect(back.length).toBeGreaterThan(0)
    await ui.press({ key: String(back[0]?.key) })
    await clock.advance(100)
    expect(sent).toEqual(['It is the side chat mod.'])
    await ui.unmount()
  })
})

describe('links and pictures', () => {
  const said = 'The guide is `docs/guide.md`; the chart is pics/dot.png. More at https://example.com/x'
  const lines = [
    line({ type: 'system', subtype: 'init', session_id: 'side' }),
    line({ type: 'assistant', message: { content: [{ type: 'text', text: said }] } }),
    line({ type: 'result', is_error: false, result: said }),
  ]
  const files = (on: On) => {
    const there = ['C:/proj/docs/guide.md', 'C:/proj/pics/dot.png']
    const norm = (p: string) => p.replace(/\\/g, '/')
    on('session.cwd', () => ({ value: 'C:/proj' }))
    on('fs.exists', ($, e) => ({ value: there.includes(norm(e.path)) }))
    on('fs.stat', () => ({ value: { size: 100, mtimeMs: 0, isFile: true, isDirectory: false, isLink: false } as never }))
    on('fs.read', ($, e) => ({ value: (norm(e.path).endsWith('.png') ? { base64: PNG_2X2 } : 'text') as never }))
  }

  test('each document and URL that resolves gets a chip that opens it; the PNG shows under the answer', async ($, on) => {
    const { clock, seen } = world(on, { lines })
    files(on)
    on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await run($, 'btw', 'where is it?')
    await clock.advance(200)
    const claude = (lastTab()?.body ?? []).flatMap(n => (n.kind === 'card' && n.title === '🤖 Claude' ? n.body : []))
    const md = claude.find(n => n.kind === 'markdown')
    expect(md?.kind === 'markdown' ? md.text : '').toBe(said)
    const chips = claude.flatMap(n => (n.kind === 'buttons' ? n.items : [])).filter(b => b.id.startsWith('open-'))
    expect(chips.map(b => b.label)).toEqual(['🌐 example.com/x', '📄 guide.md', '📷 dot.png'])
    // a chip press opens its link: the file:/// URL of the path as written
    await run($, 'side', `--${chips[1]?.id}`)
    expect(seen.toasts.some(t => t.includes('Opened file:///C:/proj/docs/guide.md'))).toBe(true)
    const pic = claude.find(n => n.kind === 'image') as { alt: string; columns: number; rows: number; cells?: string; svg?: string } | undefined
    expect(pic?.alt).toBe('dot.png · 2×2')
    expect([pic?.columns, pic?.rows]).toEqual([2, 1])
    expect(pic?.cells !== undefined && pic.svg !== undefined).toBe(true)
  })

  test('a pressed link opens in the default browser, the URL passed beside the script, not inside it', async ($, on) => {
    const { seen } = world(on)
    await run($, 'side', '--link file:///C:/proj/docs/guide.md')
    const runs = seen.kills.filter(a => a.includes('-EncodedCommand'))
    expect(runs).toHaveLength(1)
    expect(runs[0]?.join(' ')).not.toContain('guide.md')
    expect(seen.toasts.some(t => t.includes('Opened file:///C:/proj/docs/guide.md'))).toBe(true)
  })
})
