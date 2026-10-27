// bws-inventory: what this conversation has used (todos, connectors, files, skills) as the dashboard's Inventory tab
// (bws-cockpit draws it). The only file that uses `$`.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { DASHBOARD, parseEvent } from './kit/tab'
import { EMPTY, inventoryChip, inventoryTab, inventoryText, skillUsed, toolSeen, type Inventory } from './inventory'

// Session-scoped: $.state survives a hot reload, never a new process. Nothing goes to $.store or disk.
const inventory = atom({ plugin: 'bws-inventory', key: 'inventory' } as const, EMPTY as Inventory)
// The dashboard tab bws-cockpit draws (bws-kit/tab.ts) and the chip it shows.
const tab = atom({ plugin: 'bws-inventory', key: 'tab' } as const, null as unknown)
const summary = atom({ plugin: 'bws-inventory', key: 'summary' } as const, null)

let showCount = 0
// Many tool calls in a row republish once.
let isQueued = false

const reasonOf = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 120)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

async function publish($: EngineInterface) {
  const inv = await read($, inventory)
  await update($, tab, () => inventoryTab({ inv, show: showCount }))
  await update($, summary, () => inventoryChip(inv))
}

function queuePublish($: EngineInterface) {
  if (isQueued) return
  isQueued = true
  $.clock.after(200, () => {
    isQueued = false
    void publish($).catch(err => $.ui.log(`bws-inventory: publish failed (${reasonOf(err)})`, { to: 'debug' }))
  })
}

async function clear($: EngineInterface) {
  await update($, inventory, () => EMPTY)
  await publish($)
}

async function inventoryCommand($: EngineInterface, args: string): Promise<string> {
  const verb = args.trim().toLowerCase().replace(/^--/, '')
  if (verb === 'clear') {
    await clear($)
    return ''
  }
  if (verb === 'text') return inventoryText(await read($, inventory))
  if (verb === '' || verb === 'show') {
    const isHeadless = (await $.session.surfaces()).length === 0
    if (isHeadless || !(await $.command.list()).some(c => c.name === 'dashboard')) return inventoryText(await read($, inventory))
    showCount += 1
    await publish($)
    const r = await $.ui.open({ id: DASHBOARD, title: 'Dashboard', focus: true })
    return r.isPlaced ? '' : `Dashboard not shown (${r.reason}).`
  }
  return 'Usage: /inventory (the Inventory tab), /inventory text, /inventory clear'
}

export const register: Register = (on, options) => {
  void options
  showCount = 0
  isQueued = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'inventory',
      description: "This conversation's todos, connectors, files and skills in the dashboard: /inventory, /inventory text",
      argumentHint: '[text|clear]',
    })
    await publish($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'inventory' }, async ($, e) => {
    const out = await inventoryCommand($, e.args).catch(err => `bws-inventory: /inventory failed (${reasonOf(err)}).`)
    return out ? { text: out } : {}
  })

  // Observes: every tool call once it answered (the main loop's and subagents'). A denied call counts for nothing.
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if ('deny' in r && r.deny !== undefined) return r
    await (async () => {
      const input = e as unknown as Record<string, unknown>
      const res = isObj(r.result) ? r.result : {}
      const task = isObj(res.task) ? res.task : {}
      const taskId = typeof task.id === 'string' ? task.id : undefined
      const now = await $.clock.now()
      await update($, inventory, inv => toolSeen(inv, e.tool, input, { isError: r.isError === true, taskId }, now))
      queuePublish($)
    })().catch(err => $.ui.log(`bws-inventory: tool call not noted (${reasonOf(err)})`, { to: 'debug' }))
    return r
  })

  // Observes: a skill's prompt expanded (typed as /name, run by the Skill tool, or preloaded into a subagent).
  on('skill.prompt', async ($, e, next) => {
    const r = await next(e)
    await (async () => {
      const now = await $.clock.now()
      await update($, inventory, inv => skillUsed(inv, e.skill, now))
      queuePublish($)
    })().catch(err => $.ui.log(`bws-inventory: skill not noted (${reasonOf(err)})`, { to: 'debug' }))
    return r
  })

  // /clear and /resume: the old conversation's inventory goes.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') await clear($).catch(() => undefined)
    return next(e)
  })

  // A press in the Inventory tab (bws-cockpit writes it).
  on('state.set', { plugin: 'bws-cockpit', key: 'tabEvent' }, async ($, e, next) => {
    try {
      const ev = parseEvent(e.value)
      // Queued: republishing the tab from inside a state.set hook reads the old value and stalls.
      if (ev?.plugin === 'bws-inventory' && ev.id === 'clear') $.clock.after(10, () => void clear($).catch(() => $.ui.log('bws-inventory: clear failed', { to: 'debug' })))
    } catch {
      // A malformed press is ignored.
    }
    return next(e)
  })
}
