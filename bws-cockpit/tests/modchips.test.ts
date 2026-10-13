import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_MODS, modChips, parseMods } from '../hooks/modchips'
import { isShown, makeSummary, parseSummary } from '../hooks/kit/summary'

describe('mod chip list', () => {
  test('the option names known mods in order; unknown names and repeats are dropped', () => {
    expect(parseMods(DEFAULT_MODS)).toEqual(['bws-memory', 'bws-diagram', 'bws-skillgate', 'bws-secrets'])
    expect(parseMods(' BWS-Secrets ; bws-memory, nope, bws-memory ')).toEqual(['bws-secrets', 'bws-memory'])
    expect(parseMods('')).toEqual([])
  })
  test('one chip per present, non-idle summary, in the configured order', () => {
    const chips = modChips(['bws-secrets', 'bws-memory', 'bws-diagram'], {
      'bws-memory': makeSummary('busy', 'memory updating'),
      'bws-secrets': makeSummary('ok', '3 secrets'),
      'bws-diagram': makeSummary('idle', 'diagram'),
    })
    expect(chips.map(c => c.label)).toEqual(['3 secrets', 'memory updating'])
    expect(chips.map(c => c.color)).toEqual(['success', undefined])
    expect(chips[1]?.isDim).toBe(true)
  })
  test('warn and bad get their colours; detail rides along', () => {
    const chips = modChips(['bws-memory', 'bws-skillgate'], { 'bws-memory': makeSummary('warn', 'dream due', 'x'), 'bws-skillgate': makeSummary('bad', 'gate error') })
    expect(chips.map(c => c.color)).toEqual(['warning', 'error'])
    expect(chips[0]?.detail).toBe('x')
  })
  test('absent, null and malformed atoms draw nothing and cause no error; a mod not in the option draws nothing', () => {
    const raw = { 'bws-memory': null, 'bws-diagram': { state: 'huge', label: 'x' }, 'bws-skillgate': 'text', 'bws-secrets': makeSummary('ok', 'n') }
    expect(modChips(['bws-memory', 'bws-diagram', 'bws-skillgate'], raw)).toEqual([])
    expect(modChips(['bws-memory'], {})).toEqual([])
    expect(modChips(['bws-memory'], { 'bws-secrets': makeSummary('ok', 'n') })).toEqual([])
  })
  test('the vendored summary module is the kit one (same behaviour)', () => {
    expect(parseSummary({ state: 'ok', label: 'a' })).toEqual({ state: 'ok', label: 'a' })
    expect(isShown(parseSummary({ state: 'idle', label: 'a' }))).toBe(false)
  })
})
