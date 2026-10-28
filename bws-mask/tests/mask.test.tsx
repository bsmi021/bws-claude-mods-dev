// The pure masking rules first (what is hidden, and the plain output that must never be), then the hooks on a
// stubbed engine: the render rows as the engine's components would receive them, and the tab through a bottom
// state.set stub.
import { test, expect, describe } from 'claude-code/testing'
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { BAR, findSpans, mask, maskDeep, parseTerms, userOfPath } from '../hooks/mask'
import { NO_TALLY, maskTab } from '../hooks/view'

declare const setTimeout: (fn: (...a: never[]) => void, ms: number) => unknown

const NONE = { terms: [] as string[] }
const kinds = (s: string, rules = NONE) => findSpans(s, rules).map(x => [x.kind, s.slice(x.a, x.b)])

describe('mask rules', () => {
  test('emails, names before <email>, phones, amounts and keys become bars of their own length', () => {
    expect(kinds('Author: Jane Doe <jane.doe@example.com>')).toEqual([['name', 'Jane Doe'], ['email', 'jane.doe@example.com']])
    expect(kinds('call +44 7700 900123 or (415) 555-0132')).toEqual([['phone', '+44 7700 900123'], ['phone', '(415) 555-0132']])
    expect(kinds('the deal is $4,250.00, €12k or 300 USD')).toEqual([['amount', '$4,250.00'], ['amount', '€12k'], ['amount', '300 USD']])
    // Built from parts so the repo's own publish scan does not read the fixture as a real key.
    const key = ['sk', 'ant', 'api03', 'abcdefghijklmnopqrstuvwxyz0123'].join('-')
    expect(kinds(`ANTHROPIC_API_KEY=${key}`)).toEqual([['key', key]])
    expect(kinds('Authorization: Bearer abcdef0123456789abcdef')).toEqual([['key', 'abcdef0123456789abcdef']])
    expect(kinds('"password": "hunter22xyz"')).toEqual([['key', 'hunter22xyz']])
    const line = 'Mail jane@example.com, $4,250.00 due'
    const out = mask(line, NONE)
    expect(out.text).toBe(`Mail ${BAR.repeat(16)}, ${BAR.repeat(9)} due`)
    expect(out.text.length).toBe(line.length)
    expect(out.hits.map(h => h.kind)).toEqual(['email', 'amount'])
  })

  test('the account name in home paths, any slash style; placeholders stay', () => {
    const BS = String.fromCharCode(92)
    expect(kinds(`C:${BS}Users${BS}userjo${BS}x.ts and /c/Users/userjo/y and /home/userjo/z`)).toEqual([['user', 'userjo'], ['user', 'userjo'], ['user', 'userjo']])
    expect(kinds('C:/Users/<name>/x C:/Users/Public/y /home/runner/z')).toEqual([])
    expect(userOfPath('C:/Users/userjo/.claude/plugins/cache/bws-mods/bws-mask/0.1.0')).toBe('userjo')
    expect(userOfPath('/opt/plugins/bws-mask')).toBe('')
  })

  test('terms match whole words in any case, never inside a longer word', () => {
    const rules = { terms: parseTerms('Acme, Project Falcon,, x') }
    expect(rules.terms).toEqual(['Acme', 'Project Falcon'])
    expect(kinds('ACME ships project falcon; acmes and Acmeo stay', rules)).toEqual([['term', 'ACME'], ['term', 'project falcon']])
  })

  test('plain developer output masks nothing', () => {
    const corpus = [
      'Claude Code 2.1.311 · bws-mask 0.1.0 · marketplace 1.18.0',
      'gate: ok (231 tests) in 12.4s; 182k in / 387 out tokens; cost $0.42 is not hidden? no: see below',
      'git log --oneline: 2507245 bws-inventory 0.1.0: Inventory tab',
      'error TS2367: This comparison appears to be unintentional (hooks/register.ts:88:12)',
      'echo "$1 $2" | sed -e "s/a/$1/"; for i in $(seq 1 10); do echo ${i}; done',
      'Date: 2026-10-27 14:05:33, 27.10.2026, 10/27/2026, 1760000000000',
      'https://github.com/owner/repo/pull/1234567890?id=4155550132#L10-L20',
      'git@github.com:owner/repo.git and C:/Projects/bws.mods.claude-code/runs/2026-10-27-mask/RUNLOG.md',
      'const secret = process.env.SECRET_KEY; type T = { password: string }',
      'Co-Authored-By: Claude <noreply@anthropic.com>',
      'version 1.2.3.4, ip 192.168.1.10, port :8080, uuid 1a59c906-04da-521d-bda7-7f71b9f9e01c',
    ]
    const hits = corpus.flatMap(s => kinds(s))
    // The one value that is private by the rules: a price with a currency mark. A noreply address is not a person's.
    expect(hits).toEqual([['amount', '$0.42']])
  })

  test('maskDeep keeps a tool result\'s shape and its ids, and returns the same object when nothing changed', () => {
    const bash = { stdout: 'from jane@example.com', stderr: '', interrupted: false, id: 'jane@example.com' }
    const out = maskDeep(bash, NONE)
    expect(out).toEqual({ stdout: `from ${BAR.repeat(16)}`, stderr: '', interrupted: false, id: 'jane@example.com' })
    const plain = { stdout: 'ok', list: [1, 'two'] }
    expect(maskDeep(plain, NONE)).toBe(plain)
  })

  test('the tab never draws a hidden value or a term, only counts and rules', () => {
    const t = maskTab({ isOn: true, tally: { ...NO_TALLY, email: 2, term: 1 }, terms: 3, hasAutoUser: true, show: 0 })
    expect(t.title).toBe('Mask')
    expect(t.badge).toBe('🙈')
    const all = JSON.stringify(t.body)
    expect(all).toContain('📧 2 emails')
    expect(all).toContain('🏷️ 1 custom term')
    expect(all).toContain('🏷️ 3 custom terms from the plugin')
    expect(all).toContain('"id":"toggle"')
    const off = maskTab({ isOn: false, tally: NO_TALLY, terms: 0, hasAutoUser: false, show: 0 })
    expect(off.badge).toBe('')
    expect(JSON.stringify(off.body)).toContain('🙈 Turn on')
  })
})

type Node = { kind: string; title?: string; text?: string; body?: Node[] }
type Tab = { badge: string; tone: string; body: Node[]; show?: number }

function world(on: On) {
  const clock = mock.clock(on, { now: 0 })
  const got = { tabs: [] as Tab[], statuses: [] as (string | undefined)[], invalidated: 0, seen: {} as Record<string, unknown>, registered: {} as { immediate?: boolean } }
  on('session.start', () => ({ cwd: 'C:/proj' }) as never)
  on('session.surfaces', () => ({ value: ['terminal'] as never }))
  on('command.register', ($, e) => {
    got.registered = e as { immediate?: boolean }
    return { value: undefined as never }
  })
  on('command.list', () => ({ value: [{ name: 'dashboard' }] as never }))
  on('ui.open', () => ({ value: { isPlaced: true } as never }))
  on('ui.log', () => ({ value: undefined as never }))
  on('ui.status', ($, e) => {
    got.statuses.push((e as { text: string | undefined }).text)
    return { value: undefined as never }
  })
  on('ui.invalidate', () => {
    got.invalidated++
    return { value: undefined as never }
  })
  on('session.end', ($, e) => ({ sessionId: e.sessionId }) as never)
  on('state.set', { plugin: 'bws-mask', key: 'tab' }, ($, e, next) => {
    got.tabs.push(JSON.parse(JSON.stringify(e.value)))
    return next(e)
  })
  // Beneath the mod these stand for the engine's own components: they record the props that reached them.
  on('ui.render', { component: 'UserMessage' }, async ($, e) => {
    got.seen.UserMessage = e.props.text
    const { Text } = $.ui.resolve(e)
    return <Text>row</Text>
  })
  on('ui.render', { component: 'AssistantMessage' }, async ($, e) => {
    got.seen.AssistantMessage = e.props.text
    const { Text } = $.ui.resolve(e)
    return <Text>row</Text>
  })
  on('ui.render', { component: 'CommandOutput' }, async ($, e) => {
    got.seen.CommandOutput = e.props.text
    const { Text } = $.ui.resolve(e)
    return <Text>row</Text>
  })
  on('ui.render', { component: 'ToolResult' }, async ($, e) => {
    got.seen.ToolResult = e.props.output
    const { Text } = $.ui.resolve(e)
    return <Text>row</Text>
  })
  on('ui.render', { component: 'ToolUse' }, async ($, e) => {
    got.seen.ToolUseInput = e.props.input
    got.seen.ToolUseOutput = e.props.output
    const { Text } = $.ui.resolve(e)
    return <Text>row</Text>
  })
  return { got, clock }
}

async function drain(clock: { advance: (ms: number) => Promise<unknown> }, ms = 300) {
  await clock.advance(ms)
  for (let j = 0; j < 60; j++) await new Promise(r => setTimeout(r, 0))
}

const last = <T,>(xs: T[]) => xs[xs.length - 1]
const PRIVATE = 'Mail jane@example.com or call +44 7700 900123 about $4,250.00'

async function drawAll($: { ui: { mount: (i: never) => Promise<unknown> } }) {
  const bash = { stdout: PRIVATE, stderr: '', interrupted: false }
  await $.ui.mount({ plugin: 'bws-mask', surface: 'terminal', component: 'UserMessage', props: { text: PRIVATE, origin: { kind: 'composer' }, isExpanded: true } } as never)
  await $.ui.mount({ plugin: 'bws-mask', surface: 'terminal', component: 'AssistantMessage', props: { text: PRIVATE, isFirstOfReply: true } } as never)
  await $.ui.mount({ plugin: 'bws-mask', surface: 'terminal', component: 'CommandOutput', props: { command: 'cost', args: '', text: PRIVATE, isErrored: false } } as never)
  await $.ui.mount({ plugin: 'bws-mask', surface: 'terminal', component: 'ToolResult', props: { tool_use_id: 't1', tool: 'Bash', output: bash, isErrored: false } } as never)
  await $.ui.mount({ plugin: 'bws-mask', surface: 'terminal', component: 'ToolUse', props: { tool_use_id: 't1', tool: 'Bash', input: { command: `echo "${PRIVATE}"` }, output: bash, isRunning: false, isErrored: false, isInterrupted: false } } as never)
}

describe('hooks', () => {
  test('off draws rows as they came; /mask turns it on at once (status, redraw) and every row draws bars', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    expect(w.got.registered.immediate).toBe(true)
    await drawAll($ as never)
    expect(w.got.seen.UserMessage).toBe(PRIVATE)
    expect(w.got.seen.ToolResult).toEqual({ stdout: PRIVATE, stderr: '', interrupted: false })

    const before = w.got.invalidated
    const r = (await $.command.run({ command: 'mask', args: '' } as never)) as { text?: string }
    expect(r.text).toContain('Masking on')
    expect(last(w.got.statuses)).toContain('🙈 Masking on')
    expect(w.got.invalidated).toBeGreaterThan(before)

    await drawAll($ as never)
    const shown = String(w.got.seen.AssistantMessage)
    expect(shown.length).toBe(PRIVATE.length)
    expect(shown).not.toContain('jane@')
    expect(shown).not.toContain('7700')
    expect(shown).not.toContain('4,250')
    expect(w.got.seen.UserMessage).toBe(shown)
    expect(w.got.seen.CommandOutput).toBe(shown)
    expect(w.got.seen.ToolResult).toEqual({ stdout: shown, stderr: '', interrupted: false })
    expect(String((w.got.seen.ToolUseInput as { command: string }).command)).not.toContain('jane@')

    await drain(w.clock)
    const tab = JSON.stringify(last(w.got.tabs))
    expect(tab).toContain('📧 1 email')
    expect(tab).toContain('📞 1 phone number')
    expect(tab).toContain('💵 1 amount')
    expect(tab).not.toContain('jane')

    await $.command.run({ command: 'mask', args: 'off' } as never)
    expect(last(w.got.statuses)).toBe(undefined)
    await drawAll($ as never)
    expect(w.got.seen.UserMessage).toBe(PRIVATE)
  })

  test('the tab twin /mask --toggle flips it, and /mask text reports counts only', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await $.command.run({ command: 'mask', args: '--toggle' } as never)
    await drawAll($ as never)
    const t = ((await $.command.run({ command: 'mask', args: 'text' } as never)) as { text?: string }).text ?? ''
    expect(t).toContain('Masking on')
    expect(t).toContain('1 email')
    expect(t).not.toContain('jane')
    await $.command.run({ command: 'mask', args: '--toggle' } as never)
    await drain(w.clock)
    expect(JSON.stringify(last(w.got.tabs))).toContain('⚪ Off')
  })
})
