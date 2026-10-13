// Pure pieces of request_secret (no `$`): its arguments, its texts, and the wait for the person (DECISIONS.md D6).
import { nameError } from './secrets'

export const WAIT_LIMIT_MS = 10 * 60_000
// A cap by count as well as by time, so a clock that does not move cannot keep the loop going for ever.
export const MAX_SLEEPS = 900
export const PURPOSE_MAX = 200

export type RequestArgs = { name: string; purpose: string }
export type Answer = { kind: 'submit'; value: string } | { kind: 'keep' } | { kind: 'cancel' }

// Control characters out, whitespace collapsed, cut to PURPOSE_MAX.
export function cleanPurpose(s: string): string {
  const flat = s.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()
  return flat.length > PURPOSE_MAX ? `${flat.slice(0, PURPOSE_MAX - 3)}...` : flat
}

export function parseRequest(input: unknown): RequestArgs | { error: string } {
  const o = (input ?? {}) as { name?: unknown; purpose?: unknown }
  const name = typeof o.name === 'string' ? o.name.trim() : ''
  if (name === '') return { error: 'request_secret needs `name`: the variable name, such as GITHUB_TOKEN.' }
  const bad = nameError(name)
  if (bad) return { error: `request_secret: ${bad}` }
  const purpose = typeof o.purpose === 'string' ? cleanPurpose(o.purpose) : ''
  return { name, purpose }
}

// The one result text the tool answers on success (FR-SB-02).
export function savedText(name: string): string {
  return `saved as ${name}; use {{secret:${name}}}`
}

export function noScreenText(name: string): string {
  return (
    `request_secret: no screen to ask on (a headless run, or an app without the entry pane), and ${name} is not saved yet. ` +
    'Ask the user to run this session in a terminal or the desktop app so they can type it there. Do not ask them to paste it into the chat.'
  )
}

export function notPlacedText(reason: string): string {
  return `request_secret: the entry pane could not be shown (${reason}). Ask the user to widen the terminal, then call request_secret again.`
}

export function cancelText(name: string): string {
  return `The user cancelled request_secret for ${name}; nothing was saved.`
}

export function waitText(outcome: 'aborted' | 'timeout' | 'failed', name: string): string {
  if (outcome === 'aborted') return `request_secret for ${name} was interrupted; nothing was saved.`
  if (outcome === 'timeout') return `request_secret for ${name}: no answer within 10 minutes; nothing was saved.`
  return `request_secret for ${name} could not wait for the user; nothing was saved.`
}

export const FAILED_TEXT = 'request_secret failed; nothing was saved.'

// The entry's post: `{ secret: string }` from hooks/entry.ts, or null for anything else.
export function parsePost(data: unknown): string | null {
  const o = data as { secret?: unknown } | null
  return o !== null && typeof o === 'object' && typeof o.secret === 'string' ? o.secret : null
}

// A process that takes about a second: a `$` call in flight stops the hook's budget clock (D6).
export function sleeperArgv(isWindows: boolean): string[] {
  return isWindows ? ['ping', '-n', '2', '127.0.0.1'] : ['sleep', '1']
}

export type WaitIo = {
  sleep: () => Promise<void>
  now: () => Promise<number>
  isAnswered: () => boolean
  isAborted: () => boolean
}

// Waits for the person's answer one sleep at a time: `answered`, `aborted` (the turn was interrupted), `timeout` (the
// time or the count ran out) or `failed` (the sleeper did not run, so the wait cannot hold the hook open).
export async function waitFor(io: WaitIo, limitMs = WAIT_LIMIT_MS, maxSleeps = MAX_SLEEPS): Promise<'answered' | 'aborted' | 'timeout' | 'failed'> {
  const t0 = await io.now()
  for (let n = 0; ; n++) {
    if (io.isAnswered()) return 'answered'
    if (io.isAborted()) return 'aborted'
    if (n >= maxSleeps || (await io.now()) - t0 >= limitMs) return 'timeout'
    try {
      await io.sleep()
    } catch {
      if (io.isAnswered()) return 'answered'
      return io.isAborted() ? 'aborted' : 'failed'
    }
  }
}
