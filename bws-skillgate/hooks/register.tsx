// bws-skillgate: cuts the skill listing the model reads to the skills that fit the prompt. On a conversation's first
// prompt a small model picks them and the engine's `skill_listing` attachment is answered with the cut; later prompts
// add any new picks as one context block and never rewrite the listing, so the prompt cache holds (DECISIONS.md).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptSubmitInput, Register } from 'claude-code'
import type { Setting } from '../types'
import { bound } from './kit/classify-fork'
import { parseEvent } from './kit/tab'
import {
  addedBlock,
  CLASSIFY_SYSTEM,
  classifyPrompt,
  cutListing,
  explainText,
  failLine,
  gateSummary,
  gateTab,
  hashText,
  keepGate,
  mergeEntries,
  namedSkills,
  parseGates,
  parseListing,
  parseMode,
  parsePicks,
  parseTopK,
  savedChars,
  statusText,
  TIMEOUT_MS,
  tokens,
  type Entry,
  type GateRecord,
  type LastPick,
  type Mode,
} from './gate'

const COMMAND = 'skillgate'
const STORE_KEY = 'gates'
const USAGE = 'Usage: /skillgate [off|on|status|explain]'

const setting = atom({ plugin: 'bws-skillgate', key: 'setting' } as const, { mode: null } as Setting)
const last = atom({ plugin: 'bws-skillgate', key: 'last' } as const, null)
const summary = atom({ plugin: 'bws-skillgate', key: 'summary' } as const, null)
// The dashboard tab bws-cockpit draws (bws-kit/tab.ts).
const tab = atom({ plugin: 'bws-skillgate', key: 'tab' } as const, null as unknown)

// The options, copied in by register on every load.
let modeOption: Mode = 'off'
let topK = 5
let classifierModel = 'haiku'
// The prompt the next listing row is gated for: prompt.submit runs before the engine asks for the listing. Memory only.
let pending = ''
// This process's records, by session id; $.store keeps them for a re-asked row after a resume.
const gates = new Map<string, GateRecord>()

async function settle<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p
  } catch {
    return undefined
  }
}

async function modeNow($: EngineInterface): Promise<Mode> {
  return (await read($, setting)).mode ?? modeOption
}

async function publish($: EngineInterface) {
  const set = await read($, setting)
  const mode = set.mode ?? modeOption
  const l = await read($, last)
  await update($, summary, () => gateSummary(mode, l))
  await update($, tab, () => gateTab(mode, set.mode !== null, topK, classifierModel, l))
}

// The tab's switch: the same as /skillgate on|off.
async function setMode($: EngineInterface, mode: Mode) {
  await update($, setting, () => ({ mode }))
  await publish($)
}

async function loadGate($: EngineInterface, session: string): Promise<GateRecord | undefined> {
  const mem = gates.get(session)
  if (mem) return mem
  const stored = parseGates(await settle($.store.get(STORE_KEY))).find(r => r.session === session)
  if (stored) gates.set(session, stored)
  return stored
}

async function saveGate($: EngineInterface, rec: GateRecord) {
  gates.set(rec.session, rec)
  const all = parseGates(await settle($.store.get(STORE_KEY)))
  await settle($.store.set(STORE_KEY, keepGate(all, rec)))
}

async function note($: EngineInterface, pick: LastPick) {
  await update($, last, () => pick)
  await publish($)
}

// The one small-model call: up to topK skill names for the prompt, most relevant first. A string is the reason it failed.
async function pick($: EngineInterface, prompt: string, entries: readonly Entry[]): Promise<string[] | string> {
  const stop = new AbortController()
  const r = await bound(
    $.model.complete(
      { model: classifierModel, system: CLASSIFY_SYSTEM, prompt: classifyPrompt(prompt, entries, topK), maxTokens: 200, timeoutMs: TIMEOUT_MS },
      { signal: stop.signal },
    ),
    (ms, fn) => $.clock.after(ms, fn),
    { timeoutMs: TIMEOUT_MS, signal: stop.signal },
  )
  if (!r.ok) {
    stop.abort()
    return r.reason
  }
  if (!r.value.isAnswered) return r.value.reason
  return parsePicks(r.value.text, entries.map(x => x.name), topK) ?? 'unparsable'
}

// The engine's listing row: the text to answer it with, or null to leave it as it is.
async function gateListing($: EngineInterface, full: string): Promise<string | null> {
  if ((await modeNow($)) === 'off') return null
  const session = await $.session.id()
  const hash = hashText(full)
  const rec = (await loadGate($, session)) ?? { session, rows: [], entries: [], shown: [] }
  // Asked again (a resume, an invalidate): the same bytes as before, no second classification.
  const again = rec.rows.find(r => r.hash === hash)
  if (again) return again.sent
  const listing = parseListing(full)
  const fail = async (reason: string, entries: readonly Entry[]) => {
    $.ui.log(failLine('listing', reason), { to: 'debug' })
    const names = entries.map(x => x.name)
    await saveGate($, { ...rec, rows: [...rec.rows, { hash, sent: full }], entries: mergeEntries(rec.entries, entries), shown: [...new Set([...rec.shown, ...names])] })
    await note($, { step: 'listing', picks: [], named: [], added: [], shown: names.length, total: names.length, savedTokens: 0, failed: reason })
    return null
  }
  if (listing === null) return fail('no skills in the listing', [])
  const prompt = pending
  if (prompt.trim() === '') return fail('no prompt to gate', listing.entries)
  const picks = await pick($, prompt, listing.entries)
  if (typeof picks === 'string') return fail(picks, listing.entries)
  const names = listing.entries.map(x => x.name)
  const named = namedSkills(prompt, names)
  const keep = names.filter(n => picks.includes(n) || named.includes(n))
  const sent = cutListing(listing, keep)
  const entries = mergeEntries(rec.entries, listing.entries)
  const shown = [...new Set([...rec.shown, ...keep])]
  await saveGate($, { session, rows: [...rec.rows, { hash, sent }], entries, shown })
  await note($, { step: 'listing', picks, named, added: keep, shown: shown.length, total: entries.length, savedTokens: tokens(savedChars(entries, shown)), failed: null })
  return sent
}

const TYPED = new Set(['composer', 'bridge', 'sdk'])

// A later prompt: the block that adds the skills it needs that the model has not been shown, or null for none.
async function gatePrompt($: EngineInterface, e: PromptSubmitInput): Promise<string | null> {
  if ((await modeNow($)) === 'off') return null
  pending = e.text
  if (e.text.trim() === '' || e.text.trimStart().startsWith('/') || !TYPED.has(e.origin.kind)) return null
  const rec = await loadGate($, await $.session.id())
  // No listing yet in this conversation: the listing row that follows is cut for this prompt.
  if (!rec || rec.entries.length === 0) return null
  const picks = await pick($, e.text, rec.entries)
  const total = rec.entries.length
  if (typeof picks === 'string') {
    $.ui.log(failLine('prompt', picks), { to: 'debug' })
    await note($, { step: 'added', picks: [], named: [], added: [], shown: rec.shown.length, total, savedTokens: tokens(savedChars(rec.entries, rec.shown)), failed: picks })
    return null
  }
  const named = namedSkills(e.text, rec.entries.map(x => x.name))
  const add = rec.entries.filter(x => (picks.includes(x.name) || named.includes(x.name)) && !rec.shown.includes(x.name))
  const shown = [...rec.shown, ...add.map(x => x.name)]
  if (add.length > 0) await saveGate($, { ...rec, shown })
  await note($, { step: 'added', picks, named, added: add.map(x => x.name), shown: shown.length, total, savedTokens: tokens(savedChars(rec.entries, shown)), failed: null })
  return add.length > 0 ? addedBlock(add) : null
}

export const register: Register = (on, options) => {
  modeOption = parseMode(options.mode) ?? 'off'
  topK = parseTopK(options.topK)
  classifierModel = String(options.model ?? '').trim() || 'haiku'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Skill gate: cut the skill listing to the skills that fit the prompt. off, on, status, or explain the last picks',
      argumentHint: '[off|on|status|explain]',
      immediate: true,
    })
    await publish($)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const set = await read($, setting)
    if (arg === 'explain') return { text: explainText(await read($, last)) }
    if (arg === '' || arg === 'status') return { text: statusText(set.mode ?? modeOption, set.mode !== null, topK, classifierModel, await read($, last)) }
    const mode = parseMode(arg)
    if (mode === null) return { text: USAGE }
    await setMode($, mode)
    return { text: statusText(mode, true, topK, classifierModel, await read($, last)) }
  })

  // A press in the dashboard tab (bws-cockpit writes it): on or off for this session.
  on('state.set', { plugin: 'bws-cockpit', key: 'tabEvent' }, async ($, e, next) => {
    const ev = parseEvent(e.value)
    if (ev?.plugin === 'bws-skillgate' && (ev.id === 'on' || ev.id === 'off')) await setMode($, ev.id).catch(() => undefined)
    return next(e)
  })

  // Later prompts: new picks go in as one context block; when there are none the prompt passes untouched.
  on('prompt.submit', async ($, e, next) => {
    const block = await gatePrompt($, e).catch(() => {
      $.ui.log(failLine('prompt', 'error'), { to: 'debug' })
      return null
    })
    if (block === null) return next(e)
    return next({ ...e, context: [...(e.context ?? []), block] })
  })

  // The first prompt: the engine's listing row is answered with the cut. A subagent's listing is left alone.
  on('prompt.attachment', { type: 'skill_listing' }, async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined || r.text === null) return r
    const full = r.text
    const text = await gateListing($, full).catch(() => {
      $.ui.log(failLine('listing', 'error'), { to: 'debug' })
      return null
    })
    return text === null ? r : { text }
  })
}
