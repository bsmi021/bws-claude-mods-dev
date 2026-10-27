// bws-agents: every subagent of this session as a live card in the dashboard's Agents tab (bws-cockpit draws it).
// The only file that uses `$`.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { DASHBOARD, parseEvent } from './kit/tab'
import { agentsChip, agentsTab, agentsText, clearFinished, counts, spawned, synced, toolCalled, toolLabel, turnDone, type Agent, type Usage } from './roster'

// Session-scoped: $.state survives a hot reload, never a new process. Nothing goes to $.store or disk.
const roster = atom({ plugin: 'bws-agents', key: 'roster' } as const, [] as Agent[])
// The dashboard tab bws-cockpit draws (bws-kit/tab.ts) and the chip it shows.
const tab = atom({ plugin: 'bws-agents', key: 'tab' } as const, null as unknown)
const summary = atom({ plugin: 'bws-agents', key: 'summary' } as const, null)

const TICK_MS = 5000
let stallMs = 120_000
let showCount = 0
let raiseCount = 0
// Agents already flagged (failed or stalled), so each raises the tab once.
let flagged = new Set<string>()

const reasonOf = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 120)

async function publish($: EngineInterface) {
  const list = await read($, roster)
  const now = await $.clock.now()
  for (const a of list) {
    const bad = a.status === 'failed' || (a.status === 'running' && now - (a.lastToolAt ?? a.startedAt) >= stallMs)
    if (bad && !flagged.has(a.id)) {
      flagged.add(a.id)
      raiseCount += 1
    }
  }
  await update($, tab, () => agentsTab({ list, now, stallMs, show: showCount, raise: raiseCount }))
  await update($, summary, () => agentsChip(list, now, stallMs))
}

// $.agent.list() is the truth on status; it also adds agents spawned before a reload.
async function sync($: EngineInterface) {
  const infos = await $.agent.list()
  const now = await $.clock.now()
  await update($, roster, list => synced(list, infos.map(i => ({ id: i.id, type: i.type, description: i.description, status: i.status, parentId: i.parentId })), now))
}

// While anything runs: sync and republish, so elapsed times and stall flags move.
async function tick($: EngineInterface) {
  const list = await read($, roster)
  if (counts(list, 0, 0).live === 0) return
  await sync($)
  await publish($)
}

async function isHeadless($: EngineInterface) {
  return (await $.session.surfaces()).length === 0
}

async function press($: EngineInterface, id: 'clear' | 'refresh') {
  if (id === 'clear') {
    await update($, roster, list => clearFinished(list))
    flagged = new Set((await read($, roster)).map(a => a.id).filter(x => flagged.has(x)))
  } else {
    await sync($)
  }
  await publish($)
}

async function agentsCommand($: EngineInterface, args: string): Promise<string> {
  const verb = args.trim().toLowerCase().replace(/^--/, '')
  if (verb === 'clear' || verb === 'refresh') {
    await press($, verb)
    return ''
  }
  if (verb === 'text') {
    await sync($)
    return agentsText(await read($, roster), await $.clock.now(), stallMs)
  }
  if (verb === '' || verb === 'show') {
    await sync($)
    if ((await isHeadless($)) || !(await $.command.list()).some(c => c.name === 'dashboard')) return agentsText(await read($, roster), await $.clock.now(), stallMs)
    showCount += 1
    await publish($)
    const r = await $.ui.open({ id: DASHBOARD, title: 'Dashboard', focus: true })
    return r.isPlaced ? '' : `Dashboard not shown (${r.reason}).`
  }
  return 'Usage: /subagents (the Agents tab), /subagents text, /subagents clear, /subagents refresh'
}

export const register: Register = (on, options) => {
  const minutes = Number(options.stallMinutes ?? 2)
  stallMs = Number.isFinite(minutes) && minutes >= 0 ? minutes * 60_000 : 120_000
  flagged = new Set()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'subagents',
      description: 'Live subagent cards in the dashboard: /subagents, /subagents text, /subagents clear',
      argumentHint: '[text|clear|refresh]',
    })
    $.clock.every(TICK_MS, () => void tick($).catch(err => $.ui.log(`bws-agents: tick failed (${reasonOf(err)})`, { to: 'debug' })))
    await sync($).catch(() => undefined)
    await publish($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'subagents' }, async ($, e) => {
    const out = await agentsCommand($, e.args).catch(err => `bws-agents: /subagents failed (${reasonOf(err)}).`)
    return out ? { text: out } : {}
  })

  // Observes: a started subagent gets its card once the engine answers with its id.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.agentId !== undefined) {
      const a = { id: r.agentId, type: e.subagentType, description: e.description, model: r.model, parentId: e.parentAgentId, isBackground: e.background }
      await (async () => {
        const now = await $.clock.now()
        await update($, roster, list => spawned(list, a, now))
        await publish($)
      })().catch(err => $.ui.log(`bws-agents: spawn not noted (${reasonOf(err)})`, { to: 'debug' }))
    }
    return r
  })

  // Observes: a tool call inside a subagent's loop moves its card. The main loop's calls are not looked at.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const id = e.agentId
      await (async () => {
        const label = toolLabel(e.tool, e as unknown as Record<string, unknown>)
        const now = await $.clock.now()
        await update($, roster, list => toolCalled(list, id, label, now))
        await publish($)
      })().catch(err => $.ui.log(`bws-agents: tool call not noted (${reasonOf(err)})`, { to: 'debug' }))
    }
    return next(e)
  })

  // Observes: a subagent's turn ended; its answer's first line, tokens and status go on its card.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) {
      const id = e.agentId
      const t = { answer: e.answer, reason: e.reason, usage: e.usage as Usage | undefined }
      const now = await $.clock.now()
      await update($, roster, list => turnDone(list, id, t, now)).catch(() => undefined)
      await publish($).catch(() => undefined)
    }
    return done
  })

  // /clear and /resume: the old conversation's agents go.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      flagged = new Set()
      await update($, roster, () => [])
      await publish($).catch(() => undefined)
    }
    return next(e)
  })

  // A press in the Agents tab (bws-cockpit writes it).
  on('state.set', { plugin: 'bws-cockpit', key: 'tabEvent' }, async ($, e, next) => {
    try {
      const ev = parseEvent(e.value)
      if (ev?.plugin === 'bws-agents' && (ev.id === 'clear' || ev.id === 'refresh')) {
        const id = ev.id
        // Queued: republishing the tab from inside a state.set hook reads the old value and stalls.
        $.clock.after(10, () => void press($, id).catch(() => $.ui.log('bws-agents: tab press failed', { to: 'debug' })))
      }
    } catch {
      // A malformed press is ignored.
    }
    return next(e)
  })
}
