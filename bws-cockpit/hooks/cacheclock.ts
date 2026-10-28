// The cache clock: how much of the main thread's prompt cache is left, counted from its last model request, and the
// auto handoff that runs as it runs low. Pure: no `$`, so tests call it directly.
//
// The engine gives mods no per-request timestamp (`$.session.usage()` has only the session's start), so the request
// time is the main loop's `turn.complete`. A window is keyed by `startedAt`, which `/clear` starts over.

export type CacheState = 'fresh' | 'low' | 'expired'

// The TTL Anthropic wrote the main thread's cache with, read from the transcript (bin/ttl.py): the engine's usage has
// only cache_creation_input_tokens, the transcript keeps the 5m / 1h split. The `cacheTtl` atom; outlives a /clear.
export type CacheTtl = '1h' | '5m'
export type TtlRecord = { ttl: CacheTtl; at: number }
export const TTL_MS: Record<CacheTtl, number> = { '1h': 60 * 60_000, '5m': 5 * 60_000 }

// bin/ttl.py's output: one `cache_creation` object per line, newest first. The newest that wrote anything decides; one
// that wrote both counts as 5m, so the clock warns early rather than late.
export const ttlFromCacheCreation = (out: string): CacheTtl | null => {
  for (const line of out.split(/\r?\n/)) {
    let cc: unknown
    try {
      cc = JSON.parse(line)
    } catch {
      continue
    }
    if (cc === null || typeof cc !== 'object') continue
    const c = cc as Record<string, unknown>
    const m5 = Number(c.ephemeral_5m_input_tokens ?? 0) || 0
    const h1 = Number(c.ephemeral_1h_input_tokens ?? 0) || 0
    if (m5 > 0) return '5m'
    if (h1 > 0) return '1h'
  }
  return null
}

// Under this TTL the auto handoff waits: a 5m cache would write one every idle pause.
export const AUTO_HANDOFF_MIN_TTL_MS = 15 * 60_000

// The clock's TTL and low threshold: the detected TTL, else the option. The low threshold is at most a fifth of the
// TTL, so a 5m cache is not low the moment a turn ends.
export type CacheTiming = { ttlMs: number; lowMs: number; source: 'detected' | 'option'; isAutoAllowed: boolean }

export const cacheTiming = (detected: TtlRecord | null, optionTtlMs: number, optionLowMs: number): CacheTiming => {
  const ttlMs = detected !== null ? TTL_MS[detected.ttl] : optionTtlMs
  return {
    ttlMs,
    lowMs: Math.min(optionLowMs, Math.floor(ttlMs / 5)),
    source: detected !== null ? 'detected' : 'option',
    isAutoAllowed: ttlMs >= AUTO_HANDOFF_MIN_TTL_MS,
  }
}

// The `cacheClock` atom: the window, the last main-loop turn end, the turns since the last handoff (an auto handoff
// needs one, so it runs once per cache window), and when the last auto handoff was written.
export type CacheRecord = { startedAt: number; lastAt: number; turns: number; autoHandoffAt: number | null }

// What the bar draws. Its own atom, so the minute tick writes only when the text changes.
export type CacheChip = { text: string; state: CacheState }

export type CacheStatus = { state: CacheState; remainingMs: number; expiresAt: number }

// The record for this session window, or null after a /clear (a new startedAt).
export const liveRecord = (rec: CacheRecord | null, startedAt: number): CacheRecord | null =>
  rec !== null && rec.startedAt === startedAt ? rec : null

// The clock at `now`, or null when no request has been seen in this window (the chip stays hidden).
export const cacheStatus = (rec: CacheRecord | null, startedAt: number, now: number, ttlMs: number, lowMs: number): CacheStatus | null => {
  const live = liveRecord(rec, startedAt)
  if (live === null) return null
  const expiresAt = live.lastAt + ttlMs
  const remainingMs = Math.max(0, expiresAt - now)
  const state: CacheState = remainingMs === 0 ? 'expired' : remainingMs < lowMs ? 'low' : 'fresh'
  return { state, remainingMs, expiresAt }
}

// Whole minutes, rounded down, so the number and "under the threshold" agree: 4m59s reads 4m and is low.
const minutesText = (ms: number) => {
  const m = Math.floor(ms / 60_000)
  return m < 1 ? '<1m' : `${m}m`
}

export const chipText = (s: CacheStatus) => (s.state === 'expired' ? 'cache cold' : `cache ${minutesText(s.remainingMs)}`)

export const cacheChip = (s: CacheStatus | null): CacheChip | null => (s === null ? null : { text: chipText(s), state: s.state })

// A main-loop turn ended: the cache was just written or read, so the window restarts here.
export const noteTurn = (rec: CacheRecord | null, startedAt: number, now: number): CacheRecord => {
  const live = liveRecord(rec, startedAt)
  return { startedAt, lastAt: now, turns: (live?.turns ?? 0) + 1, autoHandoffAt: live?.autoHandoffAt ?? null }
}

// A handoff was written or tried: the next one needs another turn. Only a written auto handoff sets autoHandoffAt.
export const noteHandoff = (rec: CacheRecord | null, startedAt: number, now: number, isAuto: boolean): CacheRecord | null => {
  const live = liveRecord(rec, startedAt)
  if (live === null) return rec
  return { ...live, turns: 0, autoHandoffAt: isAuto ? now : live.autoHandoffAt }
}

// The auto handoff: the cache has just dropped under the low threshold (not yet expired, since a request then re-caches
// the whole context at full price), nobody is mid-turn, and a turn has happened since the last handoff.
export const shouldAutoHandoff = (f: { isOn: boolean; status: CacheStatus | null; isTurnActive: boolean; turns: number }): boolean =>
  f.isOn && f.status?.state === 'low' && !f.isTurnActive && f.turns >= 1

const pad = (n: number) => String(n).padStart(2, '0')

export const clockText = (ms: number) => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// The /cacheclock reply. Plain text, so headless runs print it too.
export const statusText = (status: CacheStatus | null, timing: CacheTiming, auto: { isOn: boolean; at: number | null }): string => {
  const ttl = Math.round(timing.ttlMs / 60_000)
  const low = Math.round(timing.lowMs / 60_000)
  const lines: string[] = []
  if (status === null) lines.push('Cache clock: no request yet in this session, so nothing to count from. It starts at the first reply.')
  else if (status.state === 'expired') {
    lines.push(`Cache clock: cold. The ${ttl}m window ended at ${clockText(status.expiresAt)}; the next request re-caches the whole context.`)
  } else {
    const mark = status.state === 'low' ? `low, under ${low}m` : 'fresh'
    lines.push(`Cache clock: ${minutesText(status.remainingMs)} left of ${ttl}m (${mark}); the window ends at ${clockText(status.expiresAt)}.`)
  }
  lines.push(
    timing.source === 'detected'
      ? `TTL: ${ttl}m, as Anthropic's last reply wrote the cache.`
      : `TTL: ${ttl}m from the cacheTtlMinutes option (no reply's cache length read yet).`,
  )
  const last = auto.at === null ? 'none this session' : `last written ${clockText(auto.at)}`
  if (!auto.isOn) lines.push(`Auto handoff: off (${last}).`)
  else if (!timing.isAutoAllowed) lines.push(`Auto handoff: waits while the cache lasts under ${AUTO_HANDOFF_MIN_TTL_MS / 60_000}m (${last}).`)
  else lines.push(`Auto handoff: ${last}.`)
  return lines.join('\n')
}
