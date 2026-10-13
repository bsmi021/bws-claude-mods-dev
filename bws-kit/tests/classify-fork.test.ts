import { describe, expect, test } from 'claude-code/testing'

import { bound, classifyGate, classifyThenFork, failLine, gateInput, parseYesNo, runFork } from '../classify-fork'
import type { KitModel, ModelReply } from '../classify-fork'

const NEVER = new Promise<never>(() => {})

// A model whose timers fire only when the test says so.
function rig(over: Partial<KitModel> = {}) {
  const timers: (() => void)[] = []
  const calls = { classify: 0, fork: 0, complete: 0, messages: 0 }
  const completePrompts: string[] = []
  const m: KitModel = {
    classify: async () => {
      calls.classify++
      return 'yes'
    },
    fork: async () => {
      calls.fork++
      return { isAnswered: true, text: 'forked work' }
    },
    complete: async req => {
      calls.complete++
      completePrompts.push(req.prompt)
      return { isAnswered: true, text: 'completed work' }
    },
    messages: async () => {
      calls.messages++
      return [{ role: 'user', text: 'hello there' }, { role: 'assistant', text: 'hi' }]
    },
    sessionModel: async () => 'sonnet',
    after: (_ms, fn) => timers.push(fn),
    ...over,
  }
  return { m, calls, completePrompts, fire: () => timers.splice(0).forEach(f => f()) }
}

const B = { timeoutMs: 4000 }
const GATE = { ...B, question: 'Is anything worth remembering?', material: 'user: use tabs' }
const FORK = { ...B, prompt: 'Write it down.' }

describe('gate input and answer parsing', () => {
  test('the input carries the question and the material as data; a long material keeps its newest part', () => {
    const t = gateInput('Q?', 'a'.repeat(50) + 'END', 10)
    expect(t.startsWith('Q?\n\n<material>\n')).toBe(true)
    expect(t.endsWith('aaaaaaaEND\n</material>')).toBe(true)
    expect(t).toContain('...')
  })
  test('yes and no read from the first word, in any case, with punctuation', () => {
    expect(parseYesNo('yes')).toBe(true)
    expect(parseYesNo('  **Yes.** because it is')).toBe(true)
    expect(parseYesNo('NO, nothing')).toBe(false)
    expect(parseYesNo('maybe')).toBeUndefined()
    expect(parseYesNo('')).toBeUndefined()
    expect(parseYesNo(undefined)).toBeUndefined()
  })
})

describe('bound', () => {
  test('a value inside the time wins; a late timer is ignored', async () => {
    const r = rig()
    const p = bound(Promise.resolve(7), r.m.after, B)
    expect(await p).toEqual({ ok: true, value: 7 })
    r.fire()
  })
  test('timeout, abort (already aborted and while waiting) and a rejection all come back, never throw', async () => {
    const r = rig()
    const t = bound(NEVER, r.m.after, B)
    r.fire()
    expect(await t).toMatchObject({ ok: false, reason: 'timeout' })

    const done = new AbortController()
    done.abort()
    expect(await bound(NEVER, r.m.after, { ...B, signal: done.signal })).toMatchObject({ ok: false, reason: 'aborted' })

    const live = new AbortController()
    const w = bound(NEVER, r.m.after, { ...B, signal: live.signal })
    live.abort()
    expect(await w).toMatchObject({ ok: false, reason: 'aborted' })

    expect(await bound(Promise.reject(new Error('boom')), r.m.after, B)).toEqual({ ok: false, reason: 'error', error: 'boom' })
  })
})

describe('classifyGate', () => {
  test('yes and no come back as a verdict', async () => {
    expect(await classifyGate(rig().m, GATE)).toEqual({ ok: true, verdict: true })
    expect(await classifyGate(rig({ classify: async () => 'no' }).m, GATE)).toEqual({ ok: true, verdict: false })
  })
  test('the model option is passed on; the default is the engine small model (none passed)', async () => {
    const seen: (string | undefined)[] = []
    const m = rig({
      classify: async (_t, _l, o) => {
        seen.push(o?.model)
        return 'no'
      },
    }).m
    await classifyGate(m, GATE)
    await classifyGate(m, { ...GATE, model: 'haiku' })
    expect(seen).toEqual([undefined, 'haiku'])
  })
  test('a rejected request, an unparsable answer and a timeout fail open', async () => {
    expect(await classifyGate(rig({ classify: async () => { throw new Error('api down') } }).m, GATE)).toMatchObject({ ok: false, reason: 'error', error: 'api down' })
    expect(await classifyGate(rig({ classify: async () => undefined }).m, GATE)).toMatchObject({ ok: false, reason: 'unparsable' })
    const r = rig({ classify: () => NEVER })
    const p = classifyGate(r.m, GATE)
    r.fire()
    expect(await p).toMatchObject({ ok: false, reason: 'timeout' })
  })
})

describe('runFork', () => {
  test('an answered fork returns its text and never touches the fallback', async () => {
    const r = rig()
    expect(await runFork(r.m, FORK)).toEqual({ ok: true, text: 'forked work', via: 'fork' })
    expect(r.calls).toMatchObject({ fork: 1, messages: 0, complete: 0 })
  })
  test('api-error, empty-reply and aborted replies are failures with their reason', async () => {
    const reply = (x: ModelReply) => rig({ fork: async () => x }).m
    expect(await runFork(reply({ isAnswered: false, reason: 'api-error' }), FORK)).toMatchObject({ ok: false, reason: 'api-error' })
    expect(await runFork(reply({ isAnswered: false, reason: 'empty-reply' }), FORK)).toMatchObject({ ok: false, reason: 'empty-reply' })
    expect(await runFork(reply({ isAnswered: false, reason: 'aborted' }), FORK)).toMatchObject({ ok: false, reason: 'aborted' })
    expect(await runFork(reply({ isAnswered: true, text: '   ' }), FORK)).toMatchObject({ ok: false, reason: 'empty-reply' })
  })
  test('nothing-to-fork falls back to the transcript rows and a complete call on the session model', async () => {
    const r = rig({ fork: async () => ({ isAnswered: false, reason: 'nothing-to-fork' }) })
    expect(await runFork(r.m, FORK)).toEqual({ ok: true, text: 'completed work', via: 'complete' })
    expect(r.calls).toMatchObject({ messages: 1, complete: 1 })
    expect(r.completePrompts[0]).toContain('USER: hello there')
    expect(r.completePrompts[0]).toContain('Write it down.')
  })
  test('the fallback passes the model option and the abort signal to complete, and stops on an abort', async () => {
    const seen: { model?: string; signal?: AbortSignal; timeoutMs?: number }[] = []
    const stop = new AbortController()
    const r = rig({
      fork: async () => ({ isAnswered: false, reason: 'nothing-to-fork' }),
      complete: async (req, o) => {
        seen.push({ model: req.model, signal: o?.signal, timeoutMs: req.timeoutMs })
        return { isAnswered: true, text: 'ok' }
      },
    })
    await runFork(r.m, { ...FORK, model: 'haiku', signal: stop.signal })
    expect(seen).toEqual([{ model: 'haiku', signal: stop.signal, timeoutMs: 4000 }])
    stop.abort()
    expect(await runFork(r.m, { ...FORK, signal: stop.signal })).toMatchObject({ ok: false, reason: 'aborted' })
  })
  test('nothing-to-fork with no messages at all fails without a model call', async () => {
    const r = rig({ fork: async () => ({ isAnswered: false, reason: 'nothing-to-fork' }), messages: async () => [] })
    expect(await runFork(r.m, FORK)).toMatchObject({ ok: false, reason: 'nothing-to-fork' })
    expect(r.calls.complete).toBe(0)
  })
  test('a fork that never answers times out; a fallback complete that fails is a failure', async () => {
    const slow = rig({ fork: () => NEVER })
    const p = runFork(slow.m, FORK)
    slow.fire()
    expect(await p).toMatchObject({ ok: false, reason: 'timeout' })
    const bad = rig({ fork: async () => ({ isAnswered: false, reason: 'nothing-to-fork' }), complete: async () => ({ isAnswered: false, reason: 'api-error' }) })
    expect(await runFork(bad.m, FORK)).toMatchObject({ ok: false, reason: 'api-error' })
  })
})

describe('classifyThenFork', () => {
  test('yes forks and returns the work', async () => {
    const r = rig()
    expect(await classifyThenFork(r.m, { gate: GATE, fork: FORK })).toEqual({ kind: 'done', text: 'forked work', via: 'fork' })
  })
  test('no short-circuits: the fork is never called', async () => {
    const r = rig({ classify: async () => 'no' })
    expect(await classifyThenFork(r.m, { gate: GATE, fork: FORK })).toEqual({ kind: 'no' })
    expect(r.calls.fork + r.calls.complete + r.calls.messages).toBe(0)
  })
  test('a classifier failure never forks; a fork failure is reported on the fork step', async () => {
    const r = rig({ classify: async () => { throw new Error('x') } })
    const a = await classifyThenFork(r.m, { gate: GATE, fork: FORK })
    expect(a).toMatchObject({ kind: 'failed', step: 'classify', reason: 'error' })
    expect(r.calls.fork).toBe(0)
    const b = await classifyThenFork(rig({ fork: async () => ({ isAnswered: false, reason: 'api-error' }) }).m, { gate: GATE, fork: FORK })
    expect(b).toMatchObject({ kind: 'failed', step: 'fork', reason: 'api-error' })
  })
  test('the debug line names the step and reason and carries no prompt or material', async () => {
    const o = await classifyThenFork(rig({ classify: async () => undefined }).m, { gate: { ...GATE, material: 'SECRET-MATERIAL' }, fork: FORK })
    expect(o.kind).toBe('failed')
    if (o.kind === 'failed') {
      const line = failLine('bws-memory', o)
      expect(line).toBe('bws-memory: classify failed (unparsable); continuing unchanged')
      expect(line).not.toContain('SECRET')
    }
  })
})
