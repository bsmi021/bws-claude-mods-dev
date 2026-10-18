import { test, expect, describe } from 'claude-code/testing'
import { parseSummary } from '../hooks/kit/summary'
import { secretsSummary, secretsTab } from '../hooks/request'

describe('FR-SB-06: the summary atom shows the count of names', () => {
  test('no names: no chip; names: the count; while asking: busy with the name, never a value', () => {
    expect(secretsSummary(0, null)).toBe(null)
    expect(secretsSummary(1, null)).toEqual({ state: 'ok', label: 'secrets 1', detail: '1 saved name for this project' })
    expect(secretsSummary(3, null)).toEqual({ state: 'ok', label: 'secrets 3', detail: '3 saved names for this project' })
    expect(secretsSummary(3, 'API_KEY')).toEqual({ state: 'busy', label: 'secret: asking for API_KEY' })
    for (const s of [secretsSummary(2, null), secretsSummary(0, 'X_KEY')]) expect(parseSummary(s)).toEqual(s)
  })
})

describe('the dashboard tab', () => {
  test('lists names and their placeholders, never a value; asking shows in it', () => {
    const t = secretsTab(['GITHUB_TOKEN', 'NPM_TOKEN'], null)
    expect([t.title, t.badge, t.tone]).toEqual(['Secrets', '2', 'ok'])
    expect(t.body[1]).toEqual({
      kind: 'card',
      title: 'Saved names',
      body: [
        { kind: 'text', text: 'GITHUB_TOKEN  ->  {{secret:GITHUB_TOKEN}}' },
        { kind: 'text', text: 'NPM_TOKEN  ->  {{secret:NPM_TOKEN}}' },
      ],
    })
    const asking = secretsTab([], 'API_KEY')
    expect([asking.badge, asking.tone]).toEqual(['…', 'busy'])
    expect(asking.body[1]).toEqual({ kind: 'text', text: 'Asking you for API_KEY in its own pane.', color: 'warn' })
    expect(secretsTab([], null).badge).toBe('')
  })
})
