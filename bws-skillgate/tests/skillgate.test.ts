import { test, expect, mock, describe } from 'claude-code/testing'
import type { On } from 'claude-code'
import { ADDED_HEAD, CLASSIFY_SYSTEM, cutListing, hashText, parseListing, savedChars, statusText, tokens } from '../hooks/gate'
import { LISTING } from './listing'

const COMPOSER = { kind: 'composer' }
const ENGINE = { kind: 'engine' }
const CHART = 'draw a bar chart of last month sales'

type Reply = string | 'throw' | 'hang' | { isAnswered: false; reason: string }

type World = {
  session?: string
  reply?: Reply
  replies?: Reply[]
  store?: Record<string, unknown>
}

// Stubs every outside call the gate makes and records what reached the engine.
function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  const seen = {
    complete: [] as { model: string; system: string; prompt: string }[],
    submitted: [] as { text: string; context?: readonly string[] }[],
    submitEvents: [] as unknown[],
    logs: [] as { text: string; to?: string }[],
  }
  const store = new Map<string, unknown>(Object.entries(w.store ?? {}))
  const replies = [...(w.replies ?? [])]
  const who = { session: w.session ?? 'session-1' }
  on('session.id', () => ({ value: who.session }))
  on('store.get', ($, e) => ({ value: store.get(e.key) as never }))
  on('store.set', ($, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined as never }
  })
  on('command.register', () => ({ value: undefined as never }))
  on('model.complete', ($, e) => {
    seen.complete.push({ model: e.model, system: e.system ?? '', prompt: e.prompt })
    const r = replies.shift() ?? w.reply ?? '["dataviz"]'
    if (r === 'throw') throw new Error('classifier down')
    if (r === 'hang') return new Promise<never>(() => undefined) as never
    if (typeof r !== 'string') return { value: r as never }
    return { value: { isAnswered: true, text: r, usage: {} } as never }
  })
  on('prompt.submit', ($, e) => {
    seen.submitEvents.push(e)
    seen.submitted.push({ text: e.text, context: e.context })
    return { text: e.text, context: e.context } as never
  })
  on('prompt.attachment', ($, e) => ({ text: e.text }))
  on('ui.log', ($, e) => {
    seen.logs.push({ text: e.text, to: e.to })
    return { value: undefined as never }
  })
  return { seen, clock, store, who }
}

const submit = ($: { prompt: { submit: (i: never) => Promise<unknown> } }, text: string, origin: object = COMPOSER) =>
  $.prompt.submit({ text, origin, wait: false } as never) as Promise<{ text: string; context?: readonly string[] }>

const listing = ($: { prompt: { attachment: (i: never) => Promise<{ text: string | null }> } }, text = LISTING, agentId?: string) =>
  $.prompt.attachment({ type: 'skill_listing', text, origin: ENGINE, ...(agentId ? { agentId } : {}) } as never)

const CUT = (keep: string[]) => cutListing(parseListing(LISTING)!, keep)

describe('FR-SG-01: the first prompt cuts the engine listing', () => {
  test('on: the listing the model reads is cut to the picks, after one small-model call', { options: { mode: 'on' } }, async ($, on) => {
    const { seen } = world(on, { session: 'a1', reply: '["dataviz", "simplify"]' })
    await submit($, CHART)
    const r = await listing($)
    expect(r.text).toBe(CUT(['dataviz', 'simplify']))
    expect(seen.complete.length).toBe(1)
    expect(seen.complete[0]?.model).toBe('haiku')
    expect(seen.complete[0]?.system).toBe(CLASSIFY_SYSTEM)
    expect(seen.complete[0]?.prompt).toContain(`<request>\n${CHART}\n</request>`)
    expect(seen.complete[0]?.prompt).toContain('- simplify: Review the changed code')
  })

  test("a subagent's listing passes untouched, with no model call", { options: { mode: 'on' } }, async ($, on) => {
    const { seen } = world(on, { session: 'a2' })
    await submit($, CHART)
    expect((await listing($, LISTING, 'agent-7')).text).toBe(LISTING)
    expect(seen.complete).toEqual([])
  })

  test('other attachments are not intercepted', { options: { mode: 'on' } }, async ($, on) => {
    const { seen } = world(on, { session: 'a3' })
    await submit($, CHART)
    const r = await $.prompt.attachment({ type: 'todo_reminder', text: 'Your todo list is empty.', origin: ENGINE } as never)
    expect(r.text).toBe('Your todo list is empty.')
    expect(seen.complete).toEqual([])
  })

  test('off by default: the listing and the prompt pass untouched and no model is called', async ($, on) => {
    const { seen } = world(on, { session: 'a4' })
    const s = await submit($, CHART)
    expect(s.context).toBeUndefined()
    expect((await listing($)).text).toBe(LISTING)
    expect(seen.complete).toEqual([])
  })
})

describe('FR-SG-02: picks, /name, topK, later prompts and /skillgate', () => {
  test('a skill the prompt names with /name is kept even when the classifier did not pick it', { options: { mode: 'on' } }, async ($, on) => {
    world(on, { session: 'b1', reply: '["dataviz"]' })
    await submit($, `${CHART}, then run /simplify on it`)
    expect((await listing($)).text).toBe(CUT(['dataviz', 'simplify']))
  })

  test('topK caps the picks; the classifier is told the limit; model option reaches the call', { options: { mode: 'on', topK: 1, model: 'sonnet' } }, async ($, on) => {
    const { seen } = world(on, { session: 'b2', reply: '["simplify", "dataviz", "claude-api"]' })
    await submit($, CHART)
    expect((await listing($)).text).toBe(CUT(['simplify']))
    expect(seen.complete[0]?.prompt).toContain('Pick at most 1 skills')
    expect(seen.complete[0]?.model).toBe('sonnet')
  })

  test('a later prompt adds the new picks as one block in the listing format; shown ones are not repeated', { options: { mode: 'on' } }, async ($, on) => {
    const { seen } = world(on, { session: 'b3', replies: ['["dataviz"]', '["dataviz", "claude-api"]'] })
    await submit($, CHART)
    await listing($)
    const r = await submit($, 'now call the Claude API to summarise it')
    const l = parseListing(LISTING)!
    expect(r.context).toEqual([`${ADDED_HEAD}\n\n${l.entries[2]?.text}`])
    expect(seen.submitted[1]?.context).toEqual(r.context)
    expect(seen.complete.length).toBe(2)
    expect(seen.complete[1]?.prompt).toContain('<request>\nnow call the Claude API to summarise it\n</request>')
  })

  test('a later slash command or a prompt a plugin sends is not classified', { options: { mode: 'on' } }, async ($, on) => {
    const { seen } = world(on, { session: 'b4' })
    await submit($, CHART)
    await listing($)
    await submit($, '/compact')
    await submit($, 'continue the work', { kind: 'plugin', name: 'bws-cockpit' })
    expect(seen.complete.length).toBe(1)
  })

  test('/skillgate: status, on for this session gates with the option off, explain, off, an invalid argument', async ($, on) => {
    world(on, { session: 'b5', reply: '["dataviz"]' })
    const run = async (args: string) => ((await $.command.run({ command: 'skillgate', args } as never)) as { text: string }).text
    expect(await run('')).toBe(statusText('off', false, 5, 'haiku', null))
    expect(await run('on')).toBe(statusText('on', true, 5, 'haiku', null))
    await submit($, CHART)
    expect((await listing($)).text).toBe(CUT(['dataviz']))
    expect(await run('status')).toContain('Listing: 1 of 5 skills shown')
    expect(await run('explain')).toContain('Picks for the last prompt, most relevant first: dataviz.')
    expect(await run('OFF')).toMatch(/^Skill gate: off \(set for this session with \/skillgate\)/)
    expect(await run('loud')).toBe('Usage: /skillgate [off|on|status|explain]')
  })

  test('the dashboard tab is published at start and follows /skillgate', async ($, on) => {
    world(on)
    const tabs: { badge?: string }[] = []
    on('state.set', { plugin: 'bws-skillgate', key: 'tab' }, ($, e, next) => {
      tabs.push(e.value as { badge?: string })
      return next(e)
    })
    on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await $.command.run({ command: 'skillgate', args: 'on' } as never)
    expect(tabs.map(t => t.badge)).toEqual(['off', 'on'])
  })
})

describe('FR-SG-03: cache safety', () => {
  test('the same prompt and skills give byte-identical listing text in two conversations', { options: { mode: 'on' } }, async ($, on) => {
    const { who } = world(on, { session: 'c1', replies: ['["simplify", "dataviz"]', '["dataviz", "simplify"]'] })
    await submit($, CHART)
    const first = (await listing($)).text
    who.session = 'c1-next'
    await submit($, CHART)
    const second = (await listing($)).text
    expect(second).toBe(first)
  })

  test('the listing asked again in the same conversation gets the same bytes with no second classification', { options: { mode: 'on' } }, async ($, on) => {
    const { seen } = world(on, { session: 'c2', reply: '["dataviz"]' })
    await submit($, CHART)
    const first = (await listing($)).text
    await submit($, 'something else entirely')
    const again = (await listing($)).text
    expect(again).toBe(first)
    expect(seen.complete.length).toBe(2) // the first prompt's pick and the later prompt's; none for the re-ask
  })

  test('after a resume the stored cut is returned for the re-asked row, without a model call', { options: { mode: 'on' } }, async ($, on) => {
    const sent = CUT(['simplify'])
    const rec = { session: 'c3', rows: [{ hash: hashText(LISTING), sent }], entries: parseListing(LISTING)!.entries, shown: ['simplify'] }
    const { seen } = world(on, { session: 'c3', store: { gates: [rec] } })
    expect((await listing($)).text).toBe(sent)
    expect(seen.complete).toEqual([])
  })

  test('a later prompt whose picks are all shown returns next(e) untouched: no context, the same event', { options: { mode: 'on' } }, async ($, on) => {
    const { seen } = world(on, { session: 'c4', replies: ['["dataviz"]', '["dataviz"]'] })
    await submit($, CHART)
    await listing($)
    const r = await submit($, 'make the bars blue')
    expect(r.context).toBeUndefined()
    expect(seen.submitEvents[1]).toEqual({ text: 'make the bars blue', origin: COMPOSER, wait: false })
  })
})

describe('FR-SG-04: fail open', () => {
  const failing = async (
    $: { prompt: { submit: (i: never) => Promise<unknown>; attachment: (i: never) => Promise<{ text: string | null }> } },
    seen: { logs: { text: string; to?: string }[] },
    why: RegExp,
  ) => {
    await submit($, CHART)
    expect((await listing($)).text).toBe(LISTING)
    expect(seen.logs.length).toBe(1)
    expect(seen.logs[0]?.to).toBe('debug')
    expect(seen.logs[0]?.text).toMatch(why)
    expect(seen.logs[0]?.text).not.toContain('bar chart')
  }

  test('a classifier error leaves the full listing and writes one debug line without the prompt', { options: { mode: 'on' } }, async ($, on) => {
    const { seen } = world(on, { session: 'd1', reply: 'throw' })
    await failing($, seen, /listing gate failed \(error\); the full skill listing stays/)
  })

  test('an unparsable answer leaves the full listing', { options: { mode: 'on' } }, async ($, on) => {
    const { seen } = world(on, { session: 'd2', reply: 'dataviz and simplify' })
    await failing($, seen, /\(unparsable\)/)
  })

  test('an unanswered call leaves the full listing', { options: { mode: 'on' } }, async ($, on) => {
    const { seen } = world(on, { session: 'd3', reply: { isAnswered: false, reason: 'empty-reply' } })
    await failing($, seen, /\(empty-reply\)/)
  })

  test('a classifier that does not answer within 4 s leaves the full listing', { options: { mode: 'on' } }, async ($, on) => {
    const { seen, clock } = world(on, { session: 'd4', reply: 'hang' })
    await submit($, CHART)
    const pending = listing($)
    await clock.advance(4000)
    expect((await pending).text).toBe(LISTING)
    expect(seen.logs[0]?.text).toMatch(/\(timeout\)/)
  })

  test('a failed first prompt means later prompts add nothing: the model already has every skill', { options: { mode: 'on' } }, async ($, on) => {
    const { seen } = world(on, { session: 'd5', replies: ['throw', '["claude-api"]'] })
    await submit($, CHART)
    expect((await listing($)).text).toBe(LISTING)
    const r = await submit($, 'call the Claude API')
    expect(r.context).toBeUndefined()
  })

  test('a later prompt whose classification fails passes untouched with one debug line', { options: { mode: 'on' } }, async ($, on) => {
    const { seen } = world(on, { session: 'd6', replies: ['["dataviz"]', 'throw'] })
    await submit($, CHART)
    await listing($)
    const r = await submit($, 'call the Claude API')
    expect(r.context).toBeUndefined()
    expect(seen.logs).toEqual([{ text: 'bws-skillgate: prompt gate failed (error); nothing was added', to: 'debug' }])
  })

  test('a listing with no skill entries passes unchanged without a model call', { options: { mode: 'on' } }, async ($, on) => {
    const { seen } = world(on, { session: 'd7' })
    await submit($, CHART)
    const odd = 'Skills changed; see /skills.'
    expect((await listing($, odd)).text).toBe(odd)
    expect(seen.complete).toEqual([])
  })
})

describe('FR-SG-05: explain shows the last picks and the tokens saved', () => {
  test('after a cut: the picks, the /names and characters / 4 of what was left out', { options: { mode: 'on' } }, async ($, on) => {
    world(on, { session: 'e1', reply: '["simplify", "dataviz"]' })
    await submit($, `${CHART} with /claude-api`)
    await listing($)
    const saved = tokens(savedChars(parseListing(LISTING)!.entries, ['dataviz', 'claude-api', 'simplify']))
    const text = ((await $.command.run({ command: 'skillgate', args: 'explain' } as never)) as { text: string }).text
    expect(text).toBe(
      [
        'Picks for the last prompt, most relevant first: simplify, dataviz.',
        'Named with /name: claude-api.',
        'The listing was cut to: dataviz, claude-api, simplify.',
        `Shown to the model: 3 of 5 skills. Tokens saved: about ${saved} (characters / 4).`,
      ].join('\n'),
    )
    expect(saved).toBeGreaterThan(0)
  })

  test('explain before anything was gated says so', { options: { mode: 'on' } }, async ($, on) => {
    world(on, { session: 'e2' })
    const text = ((await $.command.run({ command: 'skillgate', args: 'explain' } as never)) as { text: string }).text
    expect(text).toMatch(/^No prompt gated yet/)
  })
})
