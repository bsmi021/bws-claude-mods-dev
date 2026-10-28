import { describe, expect, test } from 'claude-code/testing'

import { API_MODELS, MAX_OUTPUT_TOKENS, apiError, bodyFor, isPollDue, isTerminal, outcomeOf, stripKeys, textOf, usageOf } from '../hooks/api'

// Built from parts so the repo's publish scan does not read the fixture as a real key.
const KEY = ['sk', 'proj', 'AbC123xyz_456-789def'].join('-')
const MASKED = ['sk', 'proj', '*******************************abcd'].join('-')

const message = (...texts: string[]) => ({ type: 'message', role: 'assistant', content: texts.map(text => ({ type: 'output_text', text, annotations: [] })) })

describe('the Responses API helpers', () => {
  test('a turn is a stored background response with the brief; the chain and effort only when given', () => {
    const first = bodyFor({ model: API_MODELS.default.id, effort: API_MODELS.default.effort, input: 'hi', instructions: 'brief' })
    expect(first).toEqual({ model: 'gpt-6.1-sol', input: 'hi', store: true, background: true, max_output_tokens: MAX_OUTPUT_TOKENS, reasoning: { effort: 'low' }, instructions: 'brief' })
    expect(MAX_OUTPUT_TOKENS).toBe(8000)
    const next = bodyFor({ model: API_MODELS.fast.id, effort: API_MODELS.fast.effort, input: 'more', instructions: 'brief', previous: 'resp_1' })
    expect(next.model).toBe('gpt-6.1-terra')
    expect(next.reasoning).toEqual({ effort: 'none' })
    expect(next.previous_response_id).toBe('resp_1')
    const bare = bodyFor({ model: 'm', effort: '', input: 'x', previous: null })
    expect('reasoning' in bare || 'instructions' in bare || 'previous_response_id' in bare).toBe(false)
  })

  test('the answer is every output_text of every message item; reasoning items and junk are skipped', () => {
    expect(textOf({ output: [{ type: 'reasoning', summary: [] }, message('pong', '!'), message('?')] })).toBe('pong!?')
    expect(textOf({ output: [] })).toBe('')
    expect(textOf(null)).toBe('')
    expect(textOf({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] })).toBe('')
  })

  test('terminal states: completed, incomplete, failed, cancelled; queued and in_progress poll on', () => {
    expect(['completed', 'incomplete', 'failed', 'cancelled'].map(isTerminal)).toEqual([true, true, true, true])
    expect(['queued', 'in_progress', undefined, 3].map(isTerminal)).toEqual([false, false, false, false])
  })

  test('a terminal response becomes an answer or a note saying why there is none', () => {
    expect(outcomeOf({ status: 'completed', output: [message('Use a lock.')] })).toEqual({ kind: 'answer', text: 'Use a lock.', isCut: false })
    expect(outcomeOf({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [message('Half an ans')] })).toEqual({ kind: 'answer', text: 'Half an ans', isCut: true })
    const empty = outcomeOf({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] })
    expect(empty.kind).toBe('note')
    expect(empty.text).toContain('ran out (max_output_tokens) before any text')
    expect(outcomeOf({ status: 'cancelled', output: [] })).toEqual({ kind: 'note', text: 'Stopped.' })
    expect(outcomeOf({ status: 'failed', error: { code: 'server_error', message: 'boom' } })).toEqual({ kind: 'note', text: 'The answer failed (server_error): boom.' })
    expect(outcomeOf({ status: 'completed', output: [] })).toEqual({ kind: 'note', text: 'Codex returned no text.' })
  })

  test('errors read OpenAI\'s JSON, fall back to the raw text, and never carry a key', () => {
    const bad = JSON.stringify({ error: { message: `Incorrect API key provided: ${MASKED}. You can find your API key at ...`, type: 'invalid_request_error', code: 'invalid_api_key', param: null } })
    const said = apiError(401, bad)
    expect(said.startsWith('OpenAI 401 invalid_api_key: Incorrect API key provided: sk-…')).toBe(true)
    expect(said).not.toContain('*****')
    expect(apiError(404, JSON.stringify({ error: { message: "Response with id 'resp_x' not found.", type: 'invalid_request_error', code: null } }))).toBe(
      "OpenAI 404 invalid_request_error: Response with id 'resp_x' not found.",
    )
    expect(apiError(502, '<html>\n bad   gateway </html>')).toBe('OpenAI 502: <html> bad gateway </html>')
    expect(apiError(500, `upstream said ${KEY}`)).toBe('OpenAI 500: upstream said sk-…')
  })

  test('stripKeys removes anything key-shaped, masked or not, and leaves the rest', () => {
    expect(stripKeys(`a ${KEY} b ${MASKED} c`)).toBe('a sk-… b sk-… c')
    expect(stripKeys('task-123 and sk-12 stay')).toBe('task-123 and sk-12 stay')
  })

  test('usage reads input, cached, output and reasoning tokens; none when absent', () => {
    const u = { input_tokens: 2491, output_tokens: 300, input_tokens_details: { cached_tokens: 1024 }, output_tokens_details: { reasoning_tokens: 120 } }
    expect(usageOf({ usage: u })).toEqual({ input: 2491, cached: 1024, output: 300, reasoning: 120 })
    expect(usageOf({ usage: null })).toBeNull()
  })

  test('the poll asks every second for 30 s, then every other second', () => {
    expect([1, 2, 3].map(t => isPollDue(5000, t))).toEqual([true, true, true])
    expect([31, 32, 33].map(t => isPollDue(31_000, t))).toEqual([false, true, false])
  })
})
