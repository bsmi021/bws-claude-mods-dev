// bws-interview: records every AskUserQuestion round (question, options, the answer picked, notes), keeps them per
// project, shows them in an Interview tab of the cockpit dashboard, and feeds them back to Claude on request.
import { atom, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { DASHBOARD, parseEvent } from './kit/tab'
import { addRound, clampShown, digest, parseLog, parseRound, parseScope, pick, projectKey, qaTab, recordText, type QaRound, type Scope } from './qa'

// The dashboard tab bws-cockpit draws (bws-kit/tab.ts).
const tab = atom({ plugin: 'bws-interview', key: 'tab' } as const, null as unknown)

const TOOL_HISTORY = 'qa_history'
const PIN_CHARS = 2000

// This process's view: the project's record (loaded from the store on first use), the round shown, counters.
let cache: { key: string; log: QaRound[] } | null = null
let shown = 0
let showCount = 0
let sentNote = ''
let pinDigest = false

async function load($: EngineInterface): Promise<{ key: string; log: QaRound[] }> {
  const key = projectKey(await $.session.cwd())
  if (cache?.key === key) return cache
  cache = { key, log: parseLog(await $.store.get(key)) }
  return cache
}

async function publish($: EngineInterface) {
  const { log } = await load($)
  const session = await $.session.id()
  shown = clampShown(shown, log.length)
  await update($, tab, () => qaTab(log, shown, session, { show: showCount, hasSent: sentNote }))
}

async function record($: EngineInterface, round: QaRound) {
  const c = await load($)
  c.log = addRound(c.log, round)
  await $.store.set(c.key, c.log)
  shown = 0
  sentNote = ''
  await publish($)
  if (pinDigest) $.ui.invalidate('prompt.context')
}

async function scoped($: EngineInterface, scope: Scope) {
  const { log } = await load($)
  return pick(log, scope, await $.session.id())
}

// Gives the digest back to Claude as the person's own turn. Never from inside a command or a press: deferred, the
// engine runs it once the session is idle.
function submit($: EngineInterface, text: string) {
  $.clock.after(10, () => void $.prompt.submit({ text, asUser: true }).catch(() => $.ui.toast('bws-interview: could not send the Q&A to Claude')))
}

async function send($: EngineInterface, scope: Scope): Promise<string> {
  const rounds = await scoped($, scope)
  if (rounds.length === 0) return scope.kind === 'session' ? 'No question rounds in this session. /qa send all sends the whole project record.' : 'No question rounds recorded in this project yet.'
  submit($, digest(rounds))
  return `Sending ${rounds.length} round${rounds.length === 1 ? '' : 's'} of Q&A to Claude.`
}

async function hasDashboard($: EngineInterface): Promise<boolean> {
  return (await $.command.list()).some(c => c.name === 'dashboard')
}

// A tab press (and the same words after /qa): page through the rounds, or send the one shown. Returns the line to show.
async function press($: EngineInterface, id: string): Promise<string> {
  const { log } = await load($)
  if (id === 'older') shown = clampShown(shown + 1, log.length)
  else if (id === 'newer') shown = clampShown(shown - 1, log.length)
  else if (id === 'newest') shown = 0
  else if (id === 'send-round') {
    const n = log.length - clampShown(shown, log.length)
    const round = log[n - 1]
    if (round) {
      submit($, digest([{ round, n }]))
      sentNote = `Round ${n} sent to Claude.`
    }
  } else if (id === 'send-session') sentNote = await send($, { kind: 'session' })
  await publish($)
  return sentNote
}

const PRESSES = ['older', 'newer', 'newest', 'send-round', 'send-session']

async function qaCommand($: EngineInterface, args: string): Promise<string> {
  const [sub = '', ...rest] = args.trim().split(/\s+/)
  const verb = sub.toLowerCase()
  if (verb === '') return recordText((await load($)).log)
  if (PRESSES.includes(verb)) return press($, verb)
  if (verb === 'send') {
    const scope = parseScope(rest.join(' '))
    return scope ? send($, scope) : 'Usage: /qa send (this session), /qa send all, /qa send N (the last N rounds)'
  }
  if (verb === 'show') {
    if (!(await hasDashboard($))) return recordText((await load($)).log)
    showCount += 1
    shown = 0
    await publish($)
    const r = await $.ui.open({ id: DASHBOARD, title: 'Dashboard', focus: true })
    return r.isPlaced ? '' : `Dashboard not shown (${r.reason}).`
  }
  return 'Usage: /qa (the record), /qa show (the Interview tab), /qa send [all|N] (give it back to Claude)'
}

export const register: Register = (on, options) => {
  pinDigest = options.pinDigest === true
  cache = null
  shown = 0
  sentNote = ''

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'qa', description: 'Question-and-answer record: /qa, /qa show, /qa send [all|N] to give the agreed answers back to Claude', argumentHint: '[show|send [all|N]]' })
    await $.tool.register({
      name: TOOL_HISTORY,
      description:
        "Read the record of earlier AskUserQuestion rounds in this project: each question, the options, and the answer the user picked or typed. " +
        'Use it when context was compacted or lost, or before asking something the user may already have answered (an interview resumed later).',
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['session', 'all'], description: 'session (default): rounds asked in this session; all: the whole project record.' },
          last: { type: 'number', description: 'Only the newest N rounds of the project record (overrides scope).' },
        },
      },
      isDeferred: false,
    })
    await publish($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'qa' }, async ($, e) => ({ text: await qaCommand($, e.args).catch(() => 'bws-interview: /qa failed.') }))

  // Observe the round: the dialog runs as usual (other mods may draw on it); its answers are kept afterwards.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined || r.isError) return r
    try {
      const round = parseRound(e, r.result, { id: e.tool_use_id, at: await $.clock.now(), session: await $.session.id() })
      if (round) await record($, round)
    } catch {
      $.ui.log('bws-interview: could not record the round', { to: 'debug' })
    }
    return r
  })

  on('tool.call', { tool: 'mcp__bws-interview__qa_history' }, async ($, e) => {
    const input = e as unknown as { scope?: unknown; last?: unknown }
    const last = typeof input.last === 'number' && input.last > 0 ? Math.floor(input.last) : 0
    const scope: Scope = last > 0 ? { kind: 'last', n: last } : input.scope === 'all' ? { kind: 'all' } : { kind: 'session' }
    const rounds = await scoped($, scope)
    if (rounds.length > 0) return { result: digest(rounds, 20000) }
    return { result: scope.kind === 'session' ? 'No question rounds in this session. Call again with scope "all" for the whole project record.' : 'No question rounds recorded in this project.' }
  })

  // Optional: this session's answers ride in the context, so they survive a compaction.
  on('prompt.context', async ($, e, next) => {
    const result = await next(e)
    if (!pinDigest) return result
    const text = digest(await scoped($, { kind: 'session' }), PIN_CHARS)
    return text ? { ...result, blocks: [...result.blocks, { name: 'bwsInterview', text }] } : result
  })

  // A press in the Interview tab (bws-cockpit writes it): page through rounds, send one round or the session.
  on('state.set', { plugin: 'bws-cockpit', key: 'tabEvent' }, async ($, e, next) => {
    const ev = parseEvent(e.value)
    if (ev?.plugin === 'bws-interview') {
      try {
        if (PRESSES.includes(ev.id)) await press($, ev.id)
      } catch {
        $.ui.log('bws-interview: tab press failed', { to: 'debug' })
      }
    }
    return next(e)
  })
}
