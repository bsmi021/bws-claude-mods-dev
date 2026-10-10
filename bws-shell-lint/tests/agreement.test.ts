// The TS rules reach the same verdict and detail as the Python reference on every sampled corpus command.
import { test, expect } from 'claude-code/testing'
import { lint } from '../hooks/lint'
import { FIXTURE } from './corpus-fixture'

test('TS port agrees with the Python reference on the corpus sample', () => {
  const mismatches: string[] = []
  for (const entry of FIXTURE) {
    const f = lint(entry.command)
    const rule = f ? f.rule : null
    const detail = f ? f.detail : null
    if (rule !== entry.rule || detail !== entry.detail) {
      mismatches.push(`${entry.id}: python=${entry.rule}/${entry.detail} ts=${rule}/${detail}`)
    }
  }
  expect(mismatches).toEqual([])
  expect(FIXTURE.length).toBeGreaterThanOrEqual(80)
})

// The fixture is a small scrubbed sample (shrink_fixture.py); the full corpus numbers live in corpus-eval.md.
test('the sample covers every rule and plenty of clean commands', () => {
  const count = (rule: string | null) => FIXTURE.filter(x => x.rule === rule).length
  expect(count('long-command')).toBeGreaterThanOrEqual(3)
  expect(count('dq-trailing-backslash')).toBeGreaterThanOrEqual(5)
  expect(count('py-backslash')).toBeGreaterThanOrEqual(5)
  expect(count(null)).toBeGreaterThanOrEqual(60)
})
