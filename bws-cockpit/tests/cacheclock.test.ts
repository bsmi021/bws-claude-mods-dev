import { describe, expect, test } from 'claude-code/testing'

import { cacheChip, cacheStatus, cacheTiming, chipText, clockText, liveRecord, noteHandoff, noteTurn, shouldAutoHandoff, statusText, ttlFromCacheCreation } from '../hooks/cacheclock'
import type { CacheRecord, CacheStatus } from '../hooks/cacheclock'

const MIN = 60_000
const TTL = 60 * MIN
const LOW = 5 * MIN
const START = 1_000_000 // the session window's startedAt
const T0 = 5_000_000 // the last main-loop turn end

const OPT = cacheTiming(null, TTL, LOW) // the option's 60m / 5m

const rec = (over: Partial<CacheRecord> = {}): CacheRecord => ({ startedAt: START, lastAt: T0, turns: 1, autoHandoffAt: null, ...over })

describe('cache clock: remaining time and state', () => {
  test('no clock before a request, or for an earlier window (after /clear)', () => {
    expect(cacheStatus(null, START, T0, TTL, LOW)).toBe(null)
    expect(cacheStatus(rec({ startedAt: START - 1 }), START, T0, TTL, LOW)).toBe(null)
  })

  test('fresh until under the low threshold, low under it, expired at the TTL', () => {
    const at = (ms: number) => cacheStatus(rec(), START, T0 + ms, TTL, LOW)
    expect(at(0)?.state).toBe('fresh')
    expect(at(0)?.remainingMs).toBe(TTL)
    expect(at(TTL - LOW)?.state).toBe('fresh') // exactly 5 min left is not under 5 min
    expect(at(TTL - LOW + 1)?.state).toBe('low')
    expect(at(TTL - 1)?.state).toBe('low')
    expect(at(TTL)?.state).toBe('expired')
    expect(at(TTL)?.remainingMs).toBe(0)
    expect(at(TTL * 3)?.remainingMs).toBe(0) // never negative
  })

  test('the window ends at the last request plus the TTL', () => {
    expect(cacheStatus(rec(), START, T0 + MIN, TTL, LOW)?.expiresAt).toBe(T0 + TTL)
  })

  test('a later turn restarts the clock', () => {
    const later = noteTurn(rec(), START, T0 + 30 * MIN)
    expect(cacheStatus(later, START, T0 + 31 * MIN, TTL, LOW)?.remainingMs).toBe(TTL - MIN)
  })

  test('the TTL and the low threshold are options: a 5 min TTL with 1 min low', () => {
    expect(cacheStatus(rec(), START, T0 + 4 * MIN, 5 * MIN, MIN)?.state).toBe('fresh') // 1 min left: not under 1 min
    expect(cacheStatus(rec(), START, T0 + 4.5 * MIN, 5 * MIN, MIN)?.state).toBe('low')
    expect(cacheStatus(rec(), START, T0 + 4.5 * MIN, 5 * MIN, MIN)?.remainingMs).toBe(30_000)
    expect(cacheStatus(rec(), START, T0 + 4.5 * MIN, 5 * MIN, MIN - 30_001)?.state).toBe('fresh')
  })
})

describe('cache clock: chip', () => {
  const at = (remainingMs: number, state: CacheStatus['state'] = 'fresh'): CacheStatus => ({ state, remainingMs, expiresAt: 0 })

  test('whole minutes rounded down, under a minute, cold after expiry', () => {
    expect(chipText(at(42 * MIN + 30_000))).toBe('cache 42m')
    expect(chipText(at(MIN))).toBe('cache 1m')
    expect(chipText(at(MIN - 1, 'low'))).toBe('cache <1m')
    expect(chipText(at(0, 'expired'))).toBe('cache cold')
  })

  test('the number and the warning agree: 4m59s reads 4m and is low; 5m is fresh', () => {
    expect(cacheChip(at(5 * MIN - 1, 'low'))).toEqual({ text: 'cache 4m', state: 'low' })
    expect(cacheChip(at(5 * MIN))).toEqual({ text: 'cache 5m', state: 'fresh' })
  })

  test('no chip without a clock', () => {
    expect(cacheChip(null)).toBe(null)
  })
})

describe('cache clock: records', () => {
  test('a main-loop turn counts one; a new window starts the count over', () => {
    const a = noteTurn(null, START, T0)
    expect(a).toEqual({ startedAt: START, lastAt: T0, turns: 1, autoHandoffAt: null })
    const b = noteTurn(a, START, T0 + MIN)
    expect(b.turns).toBe(2)
    const c = noteTurn(b, START + 1, T0 + 2 * MIN) // /clear starts a new window
    expect(c).toEqual({ startedAt: START + 1, lastAt: T0 + 2 * MIN, turns: 1, autoHandoffAt: null })
  })

  test('a handoff needs a new turn; only a written auto handoff sets its time', () => {
    const t = rec({ turns: 3 })
    expect(noteHandoff(t, START, T0 + MIN, false)).toEqual({ ...t, turns: 0, autoHandoffAt: null })
    expect(noteHandoff(t, START, T0 + MIN, true)).toEqual({ ...t, turns: 0, autoHandoffAt: T0 + MIN })
    expect(noteHandoff(rec({ autoHandoffAt: 7 }), START, T0 + MIN, false)?.autoHandoffAt).toBe(7) // a manual one keeps it
    expect(noteHandoff(t, START + 1, T0, true)).toBe(t) // another window: left alone
    expect(noteHandoff(null, START, T0, true)).toBe(null)
  })

  test('liveRecord is null for another window', () => {
    expect(liveRecord(rec(), START)).toEqual(rec())
    expect(liveRecord(rec(), START + 1)).toBe(null)
  })
})

describe('cache clock: auto handoff decision', () => {
  const low: CacheStatus = { state: 'low', remainingMs: MIN, expiresAt: 0 }
  const base = { isOn: true, status: low, isTurnActive: false, turns: 1 }

  test('fires for a low cache, idle, with a turn since the last handoff', () => {
    expect(shouldAutoHandoff(base)).toBe(true)
  })

  test('not while a turn runs', () => {
    expect(shouldAutoHandoff({ ...base, isTurnActive: true })).toBe(false)
  })

  test('not without a turn since the last handoff', () => {
    expect(shouldAutoHandoff({ ...base, turns: 0 })).toBe(false)
  })

  test('not while fresh, not after expiry (a request then re-caches in full), not without a clock', () => {
    expect(shouldAutoHandoff({ ...base, status: { state: 'fresh', remainingMs: TTL, expiresAt: 0 } })).toBe(false)
    expect(shouldAutoHandoff({ ...base, status: { state: 'expired', remainingMs: 0, expiresAt: 0 } })).toBe(false)
    expect(shouldAutoHandoff({ ...base, status: null })).toBe(false)
  })

  test('off when disabled', () => {
    expect(shouldAutoHandoff({ ...base, isOn: false })).toBe(false)
  })

  test('once per cache window: a handoff resets the turns, so it does not fire again', () => {
    const after = noteHandoff(rec({ turns: 1 }), START, T0 + MIN, true)
    expect(shouldAutoHandoff({ ...base, turns: liveRecord(after, START)?.turns ?? 0 })).toBe(false)
  })
})

describe('cache clock: /cacheclock text', () => {
  test('no request yet: says so, and the auto handoff line', () => {
    const text = statusText(null, OPT, { isOn: true, at: null })
    expect(text).toContain('no request yet in this session')
    expect(text).toContain('Auto handoff: none this session.')
  })

  test('fresh, low and cold, with the auto handoff time or off', () => {
    const fresh: CacheStatus = { state: 'fresh', remainingMs: 42 * MIN, expiresAt: T0 + TTL }
    const shown = statusText(fresh, OPT, { isOn: true, at: T0 })
    expect(shown).toContain('42m left of 60m (fresh)')
    expect(shown).toContain(`window ends at ${clockText(T0 + TTL)}`)
    expect(shown).toContain(`Auto handoff: last written ${clockText(T0)}.`)

    const low: CacheStatus = { state: 'low', remainingMs: 4 * MIN, expiresAt: T0 + TTL }
    const off = statusText(low, OPT, { isOn: false, at: null })
    expect(off).toContain('4m left of 60m (low, under 5m)')
    expect(off).toContain('Auto handoff: off (none this session).')

    const cold: CacheStatus = { state: 'expired', remainingMs: 0, expiresAt: T0 + TTL }
    expect(statusText(cold, OPT, { isOn: true, at: null })).toContain(`cold. The 60m window ended at ${clockText(T0 + TTL)}`)
  })
})

describe('cache clock: TTL from the transcript', () => {
  const cc = (m5: number, h1: number) => JSON.stringify({ ephemeral_5m_input_tokens: m5, ephemeral_1h_input_tokens: h1 })

  test('the newest line that wrote anything decides', () => {
    expect(ttlFromCacheCreation(`${cc(0, 2300)}\n${cc(1422, 0)}`)).toBe('1h')
    expect(ttlFromCacheCreation(`${cc(1422, 0)}\r\n${cc(0, 2300)}`)).toBe('5m')
    expect(ttlFromCacheCreation(`${cc(0, 0)}\n${cc(0, 9)}`)).toBe('1h')
  })

  test('both written counts as 5m; nothing, junk or no writes is null', () => {
    expect(ttlFromCacheCreation(cc(10, 10))).toBe('5m')
    expect(ttlFromCacheCreation('')).toBe(null)
    expect(ttlFromCacheCreation('not json\nnull\n42')).toBe(null)
    expect(ttlFromCacheCreation(cc(0, 0))).toBe(null)
  })

  test('timing: the detected TTL wins over the option; the low mark is at most a fifth of it', () => {
    expect(cacheTiming(null, TTL, LOW)).toEqual({ ttlMs: TTL, lowMs: LOW, source: 'option', isAutoAllowed: true })
    expect(cacheTiming({ ttl: '1h', at: 0 }, 30 * MIN, LOW)).toEqual({ ttlMs: TTL, lowMs: LOW, source: 'detected', isAutoAllowed: true })
    expect(cacheTiming({ ttl: '5m', at: 0 }, TTL, LOW)).toEqual({ ttlMs: 5 * MIN, lowMs: MIN, source: 'detected', isAutoAllowed: false })
    expect(cacheTiming(null, 5 * MIN, LOW).isAutoAllowed).toBe(false) // the option alone can set a short TTL too
  })

  test('/cacheclock names where the TTL came from and why the auto handoff waits', () => {
    const t5 = cacheTiming({ ttl: '5m', at: 0 }, TTL, LOW)
    const s: CacheStatus = { state: 'fresh', remainingMs: 4 * MIN, expiresAt: T0 + 5 * MIN }
    const text = statusText(s, t5, { isOn: true, at: null })
    expect(text).toContain('4m left of 5m (fresh)')
    expect(text).toContain("TTL: 5m, as Anthropic's last reply wrote the cache.")
    expect(text).toContain('Auto handoff: waits while the cache lasts under 15m (none this session).')
    expect(statusText(s, OPT, { isOn: true, at: null })).toContain('TTL: 60m from the cacheTtlMinutes option')
    expect(statusText(s, t5, { isOn: false, at: null })).toContain('Auto handoff: off (none this session).')
  })
})
