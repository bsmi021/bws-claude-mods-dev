import { test, expect, describe } from 'claude-code/testing'
import { addEntry, boardSummary, classifyMaterial, EMPTY_BOARD, forkPrompt, skipReason, turnCounts, type Row } from '../hooks/diagram'
import { BIG_ROWS, CHAT_ROWS, DUMP, START, drain, run, SPEC, turn, world } from './world'

const asRows = (rows: object[]) =>
  (rows as { role: 'user' | 'assistant'; text: string; toolUses: { tool: string; input?: Record<string, unknown> }[]; toolResults?: unknown[] }[]).map(
    (r): Row => ({ role: r.role, text: r.text, toolUses: r.toolUses, hasToolResults: (r.toolResults?.length ?? 0) > 0 }),
  )

describe('FR-DG-03: the turn, counted', () => {
  test('counts since the last typed prompt: tool calls, distinct edited files, seconds, answer words', async () => {
    const earlier = [{ role: 'user', text: 'old prompt', toolUses: [] }, { role: 'assistant', text: '', toolUses: [{ tool: 'Bash' }] }]
    const c = turnCounts(asRows([...earlier, ...BIG_ROWS]), 95_400, 'Done: the loader is its own module now.')
    expect(c).toEqual({ toolCalls: 3, files: ['C:/p/config.ts', 'C:/p/loader.ts'], seconds: 95, words: 8 })
    expect(turnCounts(asRows(CHAT_ROWS), 2000, '').toolCalls).toBe(0)
  })

  test('skips: option off, headless, subagent, a turn that did not answer, a running drawing, no tool calls', async () => {
    const base = { autoDiagram: true, isHeadless: false, reason: 'answer', isRunning: false, toolCalls: 3 }
    expect(skipReason(base)).toBe(null)
    expect(skipReason({ ...base, autoDiagram: false })).toBe('autoDiagram is off')
    expect(skipReason({ ...base, isHeadless: true })).toBe('headless')
    expect(skipReason({ ...base, agentId: 'agent-1' })).toBe('a subagent turn')
    expect(skipReason({ ...base, reason: 'aborted' })).toBe('the turn ended: aborted')
    expect(skipReason({ ...base, isRunning: true })).toBe('a diagram is already being drawn')
    expect(skipReason({ ...base, toolCalls: 0 })).toBe('no tool calls')
  })

  test('the classifier sees the counts alone; the fork is asked for the spec as JSON', async () => {
    expect(classifyMaterial({ toolCalls: 3, files: ['a', 'b'], seconds: 95, words: 8 })).toBe('Tool calls: 3\nFiles edited: 2\nTurn length: 95 s\nAnswer words: 8')
    expect(forkPrompt('turn')).toContain('the last turn')
    expect(forkPrompt('session')).toContain('this whole session')
    expect(forkPrompt('turn')).toContain('At most 24 nodes')
  })

  test('summary atom shape: null when empty, busy while drawing, ok with counts, warn after a failure', async () => {
    expect(boardSummary(EMPTY_BOARD)).toBe(null)
    expect(boardSummary({ ...EMPTY_BOARD, phase: 'working' })).toEqual({ state: 'busy', label: 'diagram drawing' })
    expect(boardSummary({ ...EMPTY_BOARD, phase: 'error', note: 'fork: timeout' })).toEqual({ state: 'warn', label: 'diagram failed', detail: 'fork: timeout' })
    const one = addEntry(EMPTY_BOARD, { origin: 'auto', at: 1, title: 't', diagram: null, source: '' })
    const two = addEntry(one, { origin: 'pinned', at: 2, title: 'p', diagram: null, source: 'x' })
    expect(boardSummary(two)).toEqual({ state: 'ok', label: '1 diagram, 1 pinned' })
  })
})

describe('FR-DG-03: classify big, fork once, show', () => {
  test('a big turn: the turn returns at once, then one classify call on the counts, one fork, the pane opens', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    const r = (await turn($)) as { text: string }
    expect(r.text).toBe('')
    expect(w.seen.classify.length).toBe(0)
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(1)
    expect(w.seen.classify[0]?.labels).toEqual(['yes', 'no'])
    expect(w.seen.classify[0]?.options).toEqual({ model: 'haiku' })
    expect(w.seen.classify[0]?.text).toContain('Tool calls: 3')
    expect(w.seen.classify[0]?.text).toContain('Files edited: 2')
    expect(w.seen.classify[0]?.text.includes('refactor the config')).toBe(false) // counts only, never the prompt
    expect(w.seen.fork.length).toBe(1)
    expect(w.seen.fork[0]).toContain('the last turn')
    expect(w.seen.opened.map(o => o.id)).toEqual(['bws-diagram'])
    expect(w.seen.closed).toEqual(['bws-diagram']) // closed before it is opened
    expect(await run($, 'diagram', 'status')).toContain('1. auto: Refactor (3 nodes, 2 edges)')
  })

  test('the classifier says no: no fork, no diagram, no pane', async ($, on) => {
    const w = world(on, { classify: 'no' })
    await $.session.start(START)
    await turn($)
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(1)
    expect(w.seen.fork.length).toBe(0)
    expect(w.seen.opened.length).toBe(0)
  })

  test('no call at all: a chat turn with no tools, headless, a subagent, an aborted turn', async ($, on) => {
    const w = world(on, { rows: CHAT_ROWS })
    await $.session.start(START)
    await turn($)
    await drain(w.clock)
    w.who.rows = BIG_ROWS
    await turn($, { agentId: 'agent-1' })
    await drain(w.clock)
    await turn($, { reason: 'aborted', isAborted: true })
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(0)
    expect(w.seen.fork.length).toBe(0)
  })

  test('headless turns are not looked at', async ($, on) => {
    const w = world(on, { surfaces: [] })
    await $.session.start(START)
    await turn($)
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(0)
  })

  test('autoDiagram off: turns are not looked at; /diagram still draws', { options: { autoDiagram: false } }, async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    await turn($)
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(0)
    expect(await run($, 'diagram')).toContain('Drawing the session')
    await drain(w.clock)
    expect(w.seen.fork.length).toBe(1)
    expect(await run($, 'diagram', 'status')).toContain('autoDiagram off')
  })

  test('the model option picks the classifier', { options: { model: 'sonnet' } }, async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    await turn($)
    await drain(w.clock)
    expect(w.seen.classify[0]?.options).toEqual({ model: 'sonnet' })
  })

  test('/diagram: the whole session, no classifier; headless it is awaited and answers with the result', async ($, on) => {
    const w = world(on, { surfaces: [] })
    await $.session.start(START)
    expect(w.seen.commands).toContain('diagram')
    expect(await run($, 'diagram')).toBe('Diagram drawn: Refactor (3 nodes).')
    expect(w.seen.classify.length).toBe(0)
    expect(w.seen.fork[0]).toContain('this whole session')
    expect(await run($, 'diagram', 'status')).toContain('1. session: Refactor')
    expect(await run($, 'diagram', 'nonsense')).toContain('Usage:')
  })

  test('/diagram while a drawing runs is refused; the turn path does not start a second one', async ($, on) => {
    const w = world(on, { fork: 'defer' })
    await $.session.start(START)
    expect(await run($, 'diagram')).toContain('Drawing the session')
    await drain(w.clock)
    expect(await run($, 'diagram')).toContain('already being drawn')
    await turn($)
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(0)
    w.release(JSON.stringify(SPEC))
    await drain(w.clock)
    expect(await run($, 'diagram', 'status')).toContain('1. session: Refactor')
  })

  test('an unasked open that is not placed toasts where to find it', async ($, on) => {
    const w = world(on, { placed: false })
    await $.session.start(START)
    await turn($)
    await drain(w.clock)
    expect(w.seen.toasts[0]).toContain('/diagram show')
    expect(await run($, 'diagram', 'show')).toBe('Pane not shown (too narrow).')
    expect(w.seen.opened[w.seen.opened.length - 1]?.focus).toBe(true)
  })

  test('a pin whose pane is not placed is written into the transcript, drawn, so it is seen anyway', async ($, on) => {
    const w = world(on, { placed: false, surfaces: [] })
    await $.session.start(START)
    await turn($, { answer: 'Here:\n\n```mermaid\ngraph LR\n  A[Parse request] --> B{Valid?}\n  B -- yes --> C[Write file]\n```\n' })
    await drain(w.clock)
    const log = w.seen.logs.find(l => l.to !== 'debug' && l.text.includes('▼ yes'))
    expect(log).toBeDefined()
    expect(log!.text).toContain('Pinned: Parse request')
    expect(log!.text).toContain('┌ file   ╭ component   ╔ step   ╱ decision')
    expect(log!.text).toContain('pinned at turn 1')
    expect(log!.text).toContain('/diagram show opens it')
    expect(w.seen.toasts[0]).toContain('/diagram show')
  })

  test('the dumpFile option writes the board after each change', { options: { dumpFile: DUMP } }, async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    await turn($)
    await drain(w.clock)
    const d = w.dump()!
    expect(d.entries.length).toBe(1)
    expect(d.entries[0]?.origin).toBe('auto')
    expect(d.phase).toBe('idle')
  })
})

describe('FR-ALL-03: fails open', () => {
  const failing = (label: string, opts: Parameters<typeof world>[1], step: string) =>
    test(label, async ($, on) => {
      const w = world(on, opts)
      await $.session.start(START)
      const r = (await turn($)) as { text: string }
      expect(r.text).toBe('')
      await drain(w.clock)
      const lines = w.seen.logs.filter(l => l.text.startsWith('bws-diagram:'))
      expect(lines.length).toBe(1)
      expect(lines[0]?.to).toBe('debug')
      expect(lines[0]?.text.startsWith(`bws-diagram: ${step} failed`)).toBe(true)
      expect(lines[0]?.text.includes('refactor')).toBe(false)
      expect(w.seen.opened.length).toBe(0)
      expect(await run($, 'diagram', 'status')).toContain(`Last attempt failed: ${step}`)
    })
  failing('a classifier error', { classify: 'throw' }, 'classify')
  failing('an unreadable classifier answer', { classify: 'none' }, 'classify')
  failing('a fork error', { fork: 'throw' }, 'fork')
  failing('a fork that is not answered', { fork: { isAnswered: false, reason: 'api-error' } }, 'fork')
  failing('a reply that is not a valid spec', { fork: '{"nodes": []}' }, 'validate')

  test('a fork that never answers times out at 90 s and releases the guard', async ($, on) => {
    const w = world(on, { fork: 'defer' })
    await $.session.start(START)
    await turn($)
    await drain(w.clock)
    expect(w.seen.fork.length).toBe(1)
    await w.clock.advance(90_000)
    await drain(w.clock)
    expect(w.seen.logs.some(l => l.text === 'bws-diagram: fork failed (timeout); continuing unchanged')).toBe(true)
    w.release(JSON.stringify(SPEC)) // late: ignored
    await drain(w.clock)
    expect(await run($, 'diagram', 'status')).toContain('0 drawn')
    w.seen.classify.length = 0
    await turn($)
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(1)
  })
})
