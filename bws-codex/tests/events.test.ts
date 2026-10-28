import { describe, expect, test } from 'claude-code/testing'

import { reduceEvents, shownCommand } from '../hooks/events'

// The shapes of a real `codex exec --json` turn (Codex CLI 0.160.1), with neutral paths and short outputs.
const ev = (o: object) => JSON.stringify(o)
const PWSH = '"C:\\\\Program Files\\\\PowerShell\\\\7\\\\pwsh.exe" -Command'
const TURN = [
  ev({ type: 'thread.started', thread_id: '01a18461-54c5-7a71-90ff-3ab6fa14b557' }),
  ev({ type: 'turn.started' }),
  ev({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'I will add whisper and its test, then run the tests.\n' } }),
  ev({ type: 'item.started', item: { id: 'item_1', type: 'command_execution', command: `${PWSH} 'Get-Content AGENTS.md'`, aggregated_output: '', exit_code: null, status: 'in_progress' } }),
  ev({ type: 'item.completed', item: { id: 'item_1', type: 'command_execution', command: `${PWSH} 'Get-Content AGENTS.md'`, aggregated_output: '# Agent notes', exit_code: 0, status: 'completed' } }),
  ev({ type: 'item.started', item: { id: 'item_2', type: 'file_change', changes: [{ path: 'C:\\src\\app.codex-worktrees\\j\\src\\strings.py', kind: 'update' }] } }),
  ev({
    type: 'item.completed',
    item: { id: 'item_2', type: 'file_change', changes: [{ path: 'C:\\src\\app.codex-worktrees\\j\\src\\strings.py', kind: 'update' }, { path: 'C:\\src\\app.codex-worktrees\\j\\tests\\test_strings.py', kind: 'update' }] },
  }),
  ev({ type: 'item.completed', item: { id: 'item_3', type: 'command_execution', command: `${PWSH} 'python -m unittest discover -s tests'`, aggregated_output: 'FAILED (failures=1)', exit_code: 1, status: 'failed' } }),
  ev({ type: 'item.completed', item: { id: 'item_4', type: 'agent_message', text: 'Changed src/strings.py and tests/test_strings.py.\nTests: 3 run, 2 passed.' } }),
  ev({ type: 'turn.completed', usage: { input_tokens: 91569, cached_input_tokens: 59648, cache_write_input_tokens: 0, output_tokens: 541, reasoning_output_tokens: 0 } }),
]

describe('event reducer', () => {
  test('a completed turn: thread id, final message, usage, commands, files', () => {
    const s = reduceEvents(TURN.join('\n') + '\n')
    expect(s.threadId).toBe('01a18461-54c5-7a71-90ff-3ab6fa14b557')
    expect(s.isStarted).toBe(true)
    expect(s.end).toBe('completed')
    expect(s.phase).toBe('finished')
    expect(s.lastMessage).toBe('Changed src/strings.py and tests/test_strings.py.\nTests: 3 run, 2 passed.')
    expect(s.usage).toEqual({ input: 91569, cached: 59648, output: 541, reasoning: 0 })
    expect(s.commands).toBe(2)
    expect(s.failedCommands).toBe(1)
    expect(s.files).toEqual(['C:\\src\\app.codex-worktrees\\j\\src\\strings.py', 'C:\\src\\app.codex-worktrees\\j\\tests\\test_strings.py'])
    expect(s.errors).toEqual([])
  })

  test('mid-turn: the phase and last item follow the stream, and a half-written last line is skipped', () => {
    const running = reduceEvents([...TURN.slice(0, 4), '{"type":"item.comp'].join('\n'))
    expect(running.end).toBe(null)
    expect(running.phase).toBe('running a command')
    expect(running.lastItem).toBe('running Get-Content AGENTS.md')
    expect(reduceEvents(TURN.slice(0, 6).join('\n')).phase).toBe('editing files')
    expect(reduceEvents(TURN.slice(0, 2).join('\n')).phase).toBe('thinking')
    expect(reduceEvents('').phase).toBe('starting')
  })

  test('a failed turn and error events are collected; the plugin-cache parse error is noise', () => {
    const s = reduceEvents(
      [
        ev({ type: 'thread.started', thread_id: 't' }),
        ev({ type: 'item.completed', item: { id: 'item_0', type: 'error', message: 'failed to parse plugin hooks config C:\\x\\hooks\\hooks.json: unknown field `modules`' } }),
        ev({ type: 'turn.started' }),
        ev({ type: 'error', message: 'stream disconnected' }),
        ev({ type: 'turn.failed', error: { message: 'usage limit reached' } }),
      ].join('\n'),
    )
    expect(s.end).toBe('failed')
    expect(s.phase).toBe('failed')
    expect(s.errors).toEqual(['stream disconnected', 'usage limit reached'])
    expect(s.lastMessage).toBe(null)
  })

  test('shown commands drop the PowerShell wrapper', () => {
    expect(shownCommand(`"C:\\pwsh.exe" -Command 'python -m unittest'`)).toBe('python -m unittest')
    expect(shownCommand('git status')).toBe('git status')
  })
})
