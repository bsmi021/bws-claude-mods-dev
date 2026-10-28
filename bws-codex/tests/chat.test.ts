import { describe, expect, test } from 'claude-code/testing'

import { MAX_MSGS, PULL_MAX, answerAt, emptyChat, parseChat, parseCodex, pressOf, pullOf, sendBackText, turnInput, withMsgs } from '../hooks/chat'

const SESSION = [
  { role: 'user', text: 'Fix the parser.' },
  { role: 'assistant', text: 'Fixed: the tokenizer dropped the last token.' },
  { role: 'user', text: '' }, // a tool result
  { role: 'user', text: 'Now add a test.' },
  { role: 'assistant', text: '' }, // tool calls only
  { role: 'assistant', text: 'Added tests/test_parser.py; 3 pass.' },
]

describe('pull from Claude', () => {
  test('the latest reply skips messages with no text', () => {
    expect(pullOf(SESSION, 'reply')).toEqual({ label: "Claude's latest reply", text: 'Added tests/test_parser.py; 3 pass.' })
    expect(pullOf([{ role: 'user', text: 'hi' }], 'reply')).toBeNull()
  })

  test('recent turns: the developer\'s prompts and Claude\'s replies, oldest first', () => {
    const p = pullOf(SESSION, 'turns')
    expect(p?.label).toBe("Claude's last 4 messages")
    expect(p?.text).toBe(
      'Developer: Fix the parser.\n\nClaude: Fixed: the tokenizer dropped the last token.\n\nDeveloper: Now add a test.\n\nClaude: Added tests/test_parser.py; 3 pass.',
    )
    expect(pullOf(SESSION, 'turns', 2)?.label).toBe("Claude's last 2 messages")
  })

  test('a huge reply is cut to fit', () => {
    const p = pullOf([{ role: 'assistant', text: 'x'.repeat(50_000) }], 'reply')
    expect(p?.text.length).toBe(PULL_MAX)
  })
})

describe('a chat turn', () => {
  test('the input is the capsule, what was pulled, then the message', () => {
    const input = turnInput('<workspace>w</workspace>', { label: "Claude's latest reply", text: 'R' }, '  is this right? ')
    expect(input).toBe("<workspace>w</workspace>\n\nClaude's latest reply, pulled in by the developer:\n<claude>\nR\n</claude>\n\nis this right?")
    expect(turnInput('<workspace>w</workspace>', null, 'q')).toBe('<workspace>w</workspace>\n\nq')
  })

  test('send back takes the newest answer, or the one asked for, and says it is Codex\'s', () => {
    const c = withMsgs(emptyChat('api'), { role: 'user', text: 'q' }, { role: 'codex', text: 'first' }, { role: 'note', text: 'n' }, { role: 'codex', text: ' second ' })
    expect(answerAt(c.msgs)).toBe('second')
    expect(answerAt(c.msgs, 1)).toBe('first')
    expect(answerAt(c.msgs, 0)).toBe('')
    expect(sendBackText('Use a lock.')).toBe('Codex (side chat) says:\n\nUse a lock.')
  })

  test('the chat keeps its newest messages; a stored chat of another shape starts empty', () => {
    let c = emptyChat('codex')
    for (let i = 0; i < MAX_MSGS + 5; i++) c = withMsgs(c, { role: 'user', text: String(i) })
    expect(c.msgs.length).toBe(MAX_MSGS)
    expect(c.msgs[0]?.text).toBe('5')
    expect(parseChat(c, 'api')).toEqual(c)
    expect(parseChat({ msgs: 'no' }, 'api')).toEqual(emptyChat('api'))
    expect(parseChat(null, 'codex').engine).toBe('codex')
  })
})

describe('/codex arguments', () => {
  test('words match whole; anything else is a message', () => {
    expect(parseCodex('')).toEqual({ kind: 'open' })
    expect(parseCodex('jobs')).toEqual({ kind: 'jobs' })
    expect(parseCodex('new  check the lock')).toEqual({ kind: 'new', message: 'check the lock' })
    expect(parseCodex('pull')).toEqual({ kind: 'pull', what: 'reply', message: '' })
    expect(parseCodex('pull turns is it safe?')).toEqual({ kind: 'pull', what: 'turns', message: 'is it safe?' })
    expect(parseCodex('pull is it safe?')).toEqual({ kind: 'pull', what: 'reply', message: 'is it safe?' })
    expect(parseCodex('engine CODEX')).toEqual({ kind: 'engine', engine: 'codex' })
    expect(parseCodex('engine')).toEqual({ kind: 'engine', engine: null })
    expect(parseCodex('fast on')).toEqual({ kind: 'fast', isOn: true })
    expect(parseCodex('fast')).toEqual({ kind: 'fast', isOn: null })
    expect(parseCodex('send-back')).toEqual({ kind: 'send-back' })
    expect(parseCodex('jobs are slow, why?')).toEqual({ kind: 'send', message: 'jobs are slow, why?' })
  })

  test('a twin is --<id> and the text it sends', () => {
    expect(pressOf('--jobs')).toEqual({ id: 'jobs' })
    expect(pressOf('--ask-3 what changed?')).toEqual({ id: 'ask-3', value: 'what changed?' })
    expect(pressOf('--fu-fix-calc-3f2a1c-0 rename it')).toEqual({ id: 'fu-fix-calc-3f2a1c-0', value: 'rename it' })
    expect(pressOf('jobs')).toBeNull()
  })
})
