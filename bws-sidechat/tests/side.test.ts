import { describe, expect, test } from 'claude-code/testing'

import {
  askKey,
  clampBack,
  exitNote,
  killArgv,
  nativeArgs,
  parseSide,
  reduceLine,
  roomOf,
  scrollStep,
  sideArgs,
  splitLines,
  toolNote,
  transcriptRows,
  windowRows,
  wrapLines,
} from '../hooks/side'
import type { SideConfig } from '../hooks/side'
import type { SideMsg } from '../types'

const CFG: SideConfig = { tools: 'Read,Glob Grep', isMcpOff: true, model: '' }
const RUN = { message: 'why?', mainId: 'main-1', sideId: 'side-1', isFirst: true }
const NL = String.fromCharCode(10)
const SIDE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

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
    const a = splitLines('', '{"a":1}' + NL + '{"b"')
    expect(a).toEqual({ lines: ['{"a":1}'], rest: '{"b"' })
    expect(splitLines(a.rest, ':2}\r' + NL + NL)).toEqual({ lines: ['{"b":2}'], rest: '' })
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
    expect(exitNote(1, 'a' + NL + 'b' + NL + 'boom')).toContain('exit 1')
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

describe('wrapLines', () => {
  test('wraps on words, keeps blank lines, and never exceeds the width', () => {
    const rows = wrapLines('the quick brown fox' + NL + NL + 'jumps over', 10)
    expect(rows).toEqual(['the quick', 'brown fox', '', 'jumps over'])
    for (const text of ['x'.repeat(95), 'aa bb cc dd ee ff gg hh ii jj kk ll mm nn oo pp qq rr ss tt']) {
      for (const r of wrapLines(text, 12)) expect(r.length).toBeLessThanOrEqual(12)
    }
  })

  test('a word longer than a row is split across rows, and nothing is lost', () => {
    const rows = wrapLines('x'.repeat(25), 10)
    expect(rows).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)])
  })
})

describe('transcriptRows', () => {
  const msgs: SideMsg[] = [
    { role: 'user', text: 'hello' },
    { role: 'tool', text: 'Read a.ts' },
    { role: 'assistant', text: 'one two three four five six' },
    { role: 'note', text: 'Stopped.' },
  ]

  test('headers, wrapped bodies, tool and note lines, the live answer last', () => {
    const rows = transcriptRows(msgs, 'typing', 12)
    expect(rows.map(r => `${r.kind}:${r.text}`)).toEqual([
      'you:You',
      'body:hello',
      'tool:· Read a.ts',
      'claude:Claude',
      'body:one two',
      'body:three four',
      'body:five six',
      'note:! Stopped.',
      'claude:Claude',
      'body:typing▌',
    ])
  })

  test('every row fits the width, however long the text', () => {
    const long: SideMsg[] = [{ role: 'assistant', text: ('lighthouse '.repeat(400) + NL).repeat(5) }]
    for (const r of transcriptRows(long, 'y'.repeat(300), 40)) expect(r.text.length).toBeLessThanOrEqual(40)
  })
})

describe('windowRows', () => {
  test('shows the newest rows that fit; the rest is above', () => {
    expect(windowRows(100, 10, 0)).toEqual({ from: 90, to: 100, above: 90, below: 0 })
    expect(windowRows(5, 10, 0)).toEqual({ from: 0, to: 5, above: 0, below: 0 })
    expect(windowRows(0, 10, 0)).toEqual({ from: 0, to: 0, above: 0, below: 0 })
  })

  test('scrolling back moves the window row by row and stops at both ends', () => {
    expect(windowRows(100, 10, 7)).toEqual({ from: 83, to: 93, above: 83, below: 7 })
    expect(windowRows(100, 10, 5000)).toEqual({ from: 0, to: 10, above: 0, below: 90 })
    expect(clampBack(-4, 100, 10)).toBe(0)
    expect(clampBack(95, 100, 10)).toBe(90)
    expect(clampBack(3, 8, 10)).toBe(0)
  })

  test('stepping with the button reaches the top and returns to the bottom in whole steps, smoothly', () => {
    const total = 100
    const room = roomOf(24)
    const step = scrollStep(room)
    expect(room).toBe(17)
    expect(step).toBe(8)
    let back = 0
    const seen: number[] = []
    while (back < total - room) {
      back = clampBack(back + step, total, room)
      seen.push(windowRows(total, room, back).to)
    }
    // each press moves the view by `step` rows (the last one by what is left); no jump over a whole message
    expect(seen.slice(0, 3)).toEqual([92, 84, 76])
    expect(windowRows(total, room, back).from).toBe(0)
    for (let i = 0; i < 20; i++) back = clampBack(back - step, total, room)
    expect(back).toBe(0)
  })

  test('the room never goes below 3 rows and the step never below 3', () => {
    expect(roomOf(2)).toBe(3)
    expect(scrollStep(3)).toBe(3)
  })

  test('the transcript window plus the chrome never exceeds the pane', () => {
    const msgs: SideMsg[] = [{ role: 'assistant', text: ('lighthouse '.repeat(200) + NL).repeat(4) }]
    for (const bodyRows of [10, 18, 24, 40]) {
      const rows = transcriptRows(msgs, 'streaming '.repeat(60), 50)
      const w = windowRows(rows.length, roomOf(bodyRows), 0)
      expect(w.to - w.from).toBeLessThanOrEqual(bodyRows - 4)
    }
  })
})

describe('killArgv', () => {
  test('Windows: finds the child by its session id, never kills the powershell that looks', () => {
    const a = killArgv(SIDE_ID, true) ?? []
    expect(a.slice(0, 3)).toEqual(['powershell', '-NoProfile', '-NonInteractive'])
    const script = a.at(-1) ?? ''
    expect(script).toContain(`'*${SIDE_ID}*'`)
    expect(script).toContain('$_.ProcessId -ne $PID')
    expect(script).toContain('Stop-Process')
  })

  test('elsewhere: pkill -f the id', () => {
    expect(killArgv(SIDE_ID, false)).toEqual(['pkill', '-f', SIDE_ID])
  })

  test('an id that is not a uuid is refused, so nothing odd reaches a shell', () => {
    expect(killArgv("x' ; calc ; '", true)).toBeNull()
    expect(killArgv('', false)).toBeNull()
  })

  test('the Ask box key changes with each send', () => {
    expect(askKey(0)).not.toBe(askKey(1))
  })
})
