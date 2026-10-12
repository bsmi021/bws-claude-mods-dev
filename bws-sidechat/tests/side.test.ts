import { describe, expect, test } from 'claude-code/testing'

import { exitNote, nativeArgs, parseSide, reduceLine, rowsOf, sideArgs, splitLines, toolNote, windowOf } from '../hooks/side'
import type { SideConfig } from '../hooks/side'
import type { SideMsg } from '../types'

const CFG: SideConfig = { tools: 'Read,Glob Grep', isMcpOff: true, model: '' }
const RUN = { message: 'why?', mainId: 'main-1', sideId: 'side-1', isFirst: true }

describe('sideArgs', () => {
  test('the first turn forks the main session into the side id', () => {
    const a = sideArgs(RUN, CFG)
    expect(a.slice(0, 2)).toEqual(['-p', 'why?'])
    expect(a).toContain('--fork-session')
    expect(a.join(' ')).toContain('--resume main-1 --fork-session --session-id side-1')
    expect(a.join(' ')).toContain('--output-format stream-json --verbose --include-partial-messages')
  })

  test('later turns resume the side session and never name the main one', () => {
    const a = sideArgs({ ...RUN, isFirst: false }, CFG)
    expect(a.join(' ')).toContain('--resume side-1')
    expect(a).not.toContain('main-1')
    expect(a).not.toContain('--fork-session')
  })

  test('tools split on commas and spaces; MCP and model are optional', () => {
    const a = sideArgs(RUN, CFG)
    expect(a.slice(a.indexOf('--allowedTools') + 1)).toEqual(['Read', 'Glob', 'Grep'])
    expect(a).toContain('--strict-mcp-config')
    const b = sideArgs(RUN, { tools: '', isMcpOff: false, model: ' opus ' })
    expect(b).not.toContain('--strict-mcp-config')
    expect(b).not.toContain('--allowedTools')
    expect(b.slice(-2)).toEqual(['--model', 'opus'])
  })
})

describe('splitLines', () => {
  test('keeps the unfinished tail for the next piece', () => {
    const a = splitLines('', '{"a":1}\n{"b"')
    expect(a).toEqual({ lines: ['{"a":1}'], rest: '{"b"' })
    expect(splitLines(a.rest, ':2}\r\n\n')).toEqual({ lines: ['{"b":2}'], rest: '' })
  })
})

const ev = (o: unknown) => JSON.stringify(o)
const delta = (text: string) => ev({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } })

describe('reduceLine', () => {
  test('streamed text builds the live answer; the finished message replaces it', () => {
    let d = { msgs: [] as SideMsg[], live: '' }
    d = reduceLine(d, delta('Hel'))
    d = reduceLine(d, delta('lo'))
    expect(d.live).toBe('Hello')
    d = reduceLine(d, ev({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello there' }, { type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } }] } }))
    expect(d).toEqual({ live: '', msgs: [{ role: 'assistant', text: 'Hello there' }, { role: 'tool', text: 'Read a.ts' }] })
  })

  test('a result that repeats the answer adds nothing; an error becomes a note', () => {
    const base = { msgs: [{ role: 'assistant', text: 'Done' } as SideMsg], live: '' }
    expect(reduceLine(base, ev({ type: 'result', is_error: false, result: 'Done' })).msgs).toHaveLength(1)
    const bad = reduceLine(base, ev({ type: 'result', is_error: true, result: 'No conversation found' }))
    expect(bad.msgs.at(-1)).toEqual({ role: 'note', text: 'Error: No conversation found' })
  })

  test('noise and bad JSON leave the draft alone', () => {
    const d = { msgs: [], live: 'x' }
    expect(reduceLine(d, 'not json')).toBe(d)
    expect(reduceLine(d, ev({ type: 'system', subtype: 'init' }))).toBe(d)
    expect(reduceLine(d, ev({ type: 'stream_event', event: { type: 'message_start' } }))).toBe(d)
  })
})

describe('small helpers', () => {
  test('toolNote shortens and names the argument', () => {
    expect(toolNote('Grep', { pattern: 'foo' })).toBe('Grep foo')
    expect(toolNote('Read', {})).toBe('Read')
    expect(toolNote('Bash', { command: 'x'.repeat(100) }).length).toBeLessThan(80)
  })

  test('exitNote is silent on success and says why otherwise', () => {
    expect(exitNote(0, '')).toBeNull()
    expect(exitNote(1, 'a\nb\nboom')).toContain('exit 1')
    expect(exitNote(null, '')).toContain('killed')
  })

  test('nativeArgs hands /fork native back', () => {
    expect(nativeArgs('native')).toBe('')
    expect(nativeArgs('  Native my name')).toBe('my name')
    expect(nativeArgs('nativeish')).toBeNull()
    expect(nativeArgs('')).toBeNull()
  })

  test('parseSide', () => {
    expect(parseSide('')).toEqual({ kind: 'open' })
    expect(parseSide(' close ')).toEqual({ kind: 'close' })
    expect(parseSide('new')).toEqual({ kind: 'new', message: '' })
    expect(parseSide('new why is it slow')).toEqual({ kind: 'new', message: 'why is it slow' })
    expect(parseSide('newest idea')).toEqual({ kind: 'send', message: 'newest idea' })
  })
})

describe('windowOf', () => {
  const msgs: SideMsg[] = Array.from({ length: 10 }, (_, i) => ({ role: 'user', text: `message ${i}` }))

  test('rowsOf counts the header and wrapped lines', () => {
    expect(rowsOf({ role: 'user', text: 'a' }, 40)).toBe(2)
    expect(rowsOf({ role: 'assistant', text: 'x'.repeat(100) }, 40)).toBe(1 + 3)
    expect(rowsOf({ role: 'tool', text: 'Read a' }, 40)).toBe(1)
  })

  test('shows the newest messages that fit, and scrolls back', () => {
    expect(windowOf(msgs, 6, 40, 0)).toEqual({ from: 7, to: 10 })
    expect(windowOf(msgs, 6, 40, 3)).toEqual({ from: 4, to: 7 })
    expect(windowOf([], 6, 40, 0)).toEqual({ from: 0, to: 0 })
  })

  test('a message taller than the room still shows', () => {
    expect(windowOf([{ role: 'assistant', text: 'x'.repeat(2000) }], 5, 40, 0)).toEqual({ from: 0, to: 1 })
  })
})
