import { test, expect, describe } from 'claude-code/testing'
import type { ClientKeyEvent, ClientSurface, JsonValue } from 'claude-code'
import SecretEntry, { dots, keyStep, type EntryState } from '../hooks/entry'
import { cleanPurpose, parseRequest, savedText, sleeperArgv, waitFor, PURPOSE_MAX } from '../hooks/request'
import { FILE, PANE, settle, world } from './world'

const REQUEST = 'mcp__bws-secrets__request_secret'
const VALUE = 'ghp_s3cretVALUE42'
const ask = ($: { tool: { call: (i: never) => Promise<unknown> } }, args: object) =>
  $.tool.call({ tool: REQUEST, ...args } as never) as Promise<{ result?: unknown; deny?: string }>

async function typeInto(ui: { key: (e: never) => Promise<void> }, text: string) {
  for (const ch of text) await ui.key({ key: ch, in: 'secret-entry' } as never)
  await ui.key({ key: 'return', in: 'secret-entry' } as never)
}

describe('FR-SB-02: request_secret, pure parts', () => {
  test('arguments: a usable name; the purpose cleaned and capped', () => {
    expect(parseRequest({ name: 'API_KEY', purpose: 'the\nweather  API' })).toEqual({ name: 'API_KEY', purpose: 'the weather API' })
    expect(parseRequest({ name: 'API_KEY' })).toEqual({ name: 'API_KEY', purpose: '' })
    expect(parseRequest({})).toEqual({ error: 'request_secret needs `name`: the variable name, such as GITHUB_TOKEN.' })
    expect('error' in parseRequest({ name: 'api key' })).toBe(true)
    expect('error' in parseRequest({ name: 'PATH' })).toBe(true)
    expect(cleanPurpose('x'.repeat(500)).length).toBe(PURPOSE_MAX)
  })

  test('the result says only where it went and how to use it', () => {
    expect(savedText('API_KEY')).toBe('saved as API_KEY; use {{secret:API_KEY}}')
  })

  test('the wait: answered, interrupted, out of time, out of sleeps, or a sleeper that does not run', async () => {
    let t = 0
    let answered = false
    let n = 0
    const io = (o: { abort?: boolean; fail?: boolean; answerAt?: number; step?: number }) => ({
      sleep: async () => {
        n++
        if (o.fail) throw new Error('no ping')
        t += o.step ?? 1000
        if (o.answerAt !== undefined && n >= o.answerAt) answered = true
      },
      now: async () => t,
      isAnswered: () => answered,
      isAborted: () => o.abort === true,
    })
    expect(await waitFor(io({ answerAt: 2 }))).toBe('answered')
    expect(n).toBe(2)
    answered = false
    expect(await waitFor(io({ abort: true }))).toBe('aborted')
    t = 0
    expect(await waitFor(io({}), 5000)).toBe('timeout')
    t = 0
    n = 0
    expect(await waitFor(io({ step: 0 }), 5000, 7)).toBe('timeout')
    expect(n).toBe(7)
    expect(await waitFor(io({ fail: true }))).toBe('failed')
  })

  test('the sleeper: ping on Windows, sleep elsewhere', () => {
    expect(sleeperArgv(true)).toEqual(['ping', '-n', '2', '127.0.0.1'])
    expect(sleeperArgv(false)).toEqual(['sleep', '1'])
  })
})

describe('FR-SB-02: the masked entry draws dots, never the value', () => {
  test('keys: characters, a pasted run, space, Backspace, Ctrl+U, Enter; arrows change nothing', () => {
    let v = ''
    for (const k of ['a', 'b', 'space', 'c'] as const) v = keyStep(v, { key: k }).value
    expect(v).toBe('ab c')
    expect(keyStep(v, { key: 'backspace' }).value).toBe('ab ')
    expect(keyStep(v, { key: 'left' }).value).toBe('ab c')
    expect(keyStep(v, { key: 'u', ctrl: true }).value).toBe('')
    expect(keyStep(v, { key: 'c', ctrl: true }).value).toBe('ab c')
    expect(keyStep(v, { key: 'XYZ\n' }).value).toBe('ab cXYZ')
    expect(keyStep(v, { key: 'return' })).toEqual({ value: 'ab c', submit: true })
    expect(dots('abc')).toBe('•••')
    expect(dots('x'.repeat(40))).toBe(`${'•'.repeat(32)} +8`)
  })

  test('the module: one dot per character, the value posted once on Enter and then cleared', () => {
    const posts: JsonValue[] = []
    let onKey: (k: ClientKeyEvent) => void = () => undefined
    const el = (tag: string) => (p: Record<string, unknown>) => ({ tag, ...p })
    const surface = {
      elements: { Box: el('Box'), Text: el('Text') },
      state: undefined as EntryState | undefined,
      setState(s: EntryState) {
        this.state = s
      },
      onKey(fn: (k: ClientKeyEvent) => void) {
        onKey = fn
        return () => undefined
      },
      post: (d: JsonValue) => void posts.push(d),
    }
    const draw = () => JSON.stringify(SecretEntry({}, surface as unknown as ClientSurface<EntryState>))
    expect(draw()).toContain('click here, type the value, press Enter')
    for (const ch of 'hunter2!') onKey({ key: ch })
    expect(draw()).toContain('••••••••')
    expect(draw()).not.toContain('hunter2')
    onKey({ key: 'return' })
    expect(posts).toEqual([{ secret: 'hunter2!' }])
    expect(surface.state).toEqual({ value: '' })
    onKey({ key: 'return' })
    expect(posts.length).toBe(1)
  })
})

describe('FR-SB-02: request_secret opens the entry and saves outside the project', () => {
  test('typed in the pane: saved to <secretsDir>/<project>.env; the result never holds the value', async ($, on) => {
    const { seen, files } = world(on)
    await $.session.start({ cwd: 'C:\proj\app' } as never)
    expect(seen.registered).toEqual(['request_secret'])
    const call = ask($, { name: 'GITHUB_TOKEN', purpose: 'push to the fork' })
    await settle(() => seen.sleeps > 0)
    expect(seen.opened).toEqual(['bws-secrets'])
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Claude asks for the secret GITHUB_TOKEN/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /For: push to the fork/ })).toBeDefined()
    await typeInto(ui, VALUE)
    const r = await call
    expect(r).toEqual({ result: 'saved as GITHUB_TOKEN; use {{secret:GITHUB_TOKEN}}' })
    expect(JSON.stringify(r)).not.toContain(VALUE)
    expect(files.get(FILE)).toBe(`GITHUB_TOKEN=${VALUE}\n`)
    expect(seen.closed).toContain('bws-secrets')
    expect(seen.sleeps).toBeGreaterThan(0)
    await ui.unmount()
  })

  test('the pane and the entry never draw the value while it is typed', async ($, on) => {
    world(on)
    const call = ask($, { name: 'API_KEY' })
    await settle()
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    for (const ch of VALUE) await ui.key({ key: ch, in: 'secret-entry' } as never)
    expect(JSON.stringify(await ui.drawn({ in: 'secret-entry' }))).not.toContain(VALUE)
    expect(JSON.stringify(await ui.drawn({ in: 'secret-entry' }))).toContain('•'.repeat(VALUE.length))
    expect(JSON.stringify(await ui.drawn())).not.toContain(VALUE)
    await ui.key({ key: 'return', in: 'secret-entry' } as never)
    expect((await call).result).toBe('saved as API_KEY; use {{secret:API_KEY}}')
    await ui.unmount()
  })

  test('another saved name is kept; a name saved before is replaced in place', async ($, on) => {
    const { files } = world(on, { files: { [FILE]: 'A_KEY=aaaa1111\nAPI_KEY=old-value\n' } })
    const call = ask($, { name: 'API_KEY' })
    await settle()
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Button', key: 'keep' })).toBeDefined()
    await typeInto(ui, VALUE)
    await call
    expect(files.get(FILE)).toBe(`A_KEY=aaaa1111\nAPI_KEY=${VALUE}\n`)
    await ui.unmount()
  })

  test('Keep the saved value answers without a write', async ($, on) => {
    const { seen } = world(on, { files: { [FILE]: 'API_KEY=old-value\n' } })
    const call = ask($, { name: 'API_KEY' })
    await settle()
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'keep' })
    expect((await call).result).toBe('saved as API_KEY; use {{secret:API_KEY}}')
    expect(seen.writes).toEqual([])
    await ui.unmount()
  })

  test('a value too short is refused in the pane and the person types again', async ($, on) => {
    const { files } = world(on)
    const call = ask($, { name: 'API_KEY' })
    await settle()
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await typeInto(ui, 'abc')
    await settle(() => false, 30)
    expect(await ui.find({ type: 'Text', text: /at least 4 characters/ })).toBeDefined()
    await typeInto(ui, VALUE)
    expect((await call).result).toBe('saved as API_KEY; use {{secret:API_KEY}}')
    expect(files.get(FILE)).toBe(`API_KEY=${VALUE}\n`)
    await ui.unmount()
  })

  test('Cancel refuses the call and saves nothing', async ($, on) => {
    const { seen } = world(on)
    const call = ask($, { name: 'API_KEY' })
    await settle()
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'cancel' })
    expect((await call).deny).toBe('The user cancelled request_secret for API_KEY; nothing was saved.')
    expect(seen.writes).toEqual([])
    expect(seen.closed).toContain('bws-secrets')
    await ui.unmount()
  })
})

describe('FR-SB-02: when it cannot ask', () => {
  test('headless: a saved name is answered without a pane; an unsaved one is refused', async ($, on) => {
    const { seen } = world(on, { surfaces: [], files: { [FILE]: 'API_KEY=old-value\n' } })
    expect((await ask($, { name: 'API_KEY' })).result).toBe('saved as API_KEY; use {{secret:API_KEY}}')
    const r = await ask($, { name: 'OTHER_KEY' })
    expect(r.deny).toContain('no screen to ask on')
    expect(r.deny).toContain('Do not ask them to paste it into the chat')
    expect(seen.opened).toEqual([])
  })

  test('a surface without the entry (mobile) is treated as headless', async ($, on) => {
    const { seen } = world(on, { surfaces: ['mobile'] })
    expect((await ask($, { name: 'API_KEY' })).deny).toContain('no screen to ask on')
    expect(seen.opened).toEqual([])
  })

  test('a pane that is not placed is refused at once, not waited on', async ($, on) => {
    const { seen } = world(on, { isPlaced: false })
    const r = await ask($, { name: 'API_KEY' })
    expect(r.deny).toContain('the entry pane could not be shown (unasked under 144 columns (now 100))')
    expect(seen.sleeps).toBe(0)
    expect(seen.closed).toContain('bws-secrets')
  })

  test('a sleeper that does not run ends the wait with a refusal', async ($, on) => {
    world(on, { sleeper: 'throw' })
    expect((await ask($, { name: 'API_KEY' })).deny).toBe('request_secret for API_KEY could not wait for the user; nothing was saved.')
  })

  test('a bad name is refused; a second request while one waits is refused', async ($, on) => {
    world(on)
    expect((await ask($, { name: 'my key' })).deny).toContain('is not a usable name')
    const first = ask($, { name: 'API_KEY' })
    await settle()
    expect((await ask($, { name: 'OTHER_KEY' })).deny).toContain('still being asked for API_KEY')
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'cancel' })
    await first
    await ui.unmount()
  })

  test('does not intercept other tools or other posts', async ($, on) => {
    const { seen } = world(on)
    const r = await $.tool.call({ tool: 'Read', file_path: 'a.md' } as never)
    expect(seen.reached.map(x => x.tool)).toEqual(['Read'])
    expect((r as { result: { stdout: string } }).result.stdout).toBe('ran')
  })
})
