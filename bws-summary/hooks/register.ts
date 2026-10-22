// bws-summary: a rolling summary of the conversation, written by a small model each time Claude stops, with earlier
// summaries kept for rollbacks. bws-cockpit draws it as the dashboard's Summary tab. The only file that uses `$`.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { DASHBOARD, parseEvent } from './kit/tab'
import { addSnapshot, clockTime, planSummary, sig, step, summaryChip, summaryTab, summaryText, SYSTEM, type Row, type Snapshot, type Status, type View } from './digest'

// Session-scoped history: $.state survives a hot reload, never a new process. Nothing goes to $.store or disk.
const snapshots = atom({ plugin: 'bws-summary', key: 'snapshots' } as const, [] as Snapshot[])
const viewing = atom({ plugin: 'bws-summary', key: 'viewing' } as const, -1) // -1 follows the newest summary
const status = atom({ plugin: 'bws-summary', key: 'status' } as const, 'idle' as Status)
const lastError = atom({ plugin: 'bws-summary', key: 'lastError' } as const, '')
// The dashboard tab bws-cockpit draws (bws-kit/tab.ts) and the chip it shows.
const tab = atom({ plugin: 'bws-summary', key: 'tab' } as const, null as unknown)
const summary = atom({ plugin: 'bws-summary', key: 'summary' } as const, null)

// The in-flight guard; module variables, so a reload resets it (worst case one missed or extra summary).
let running = false
let dirty = false
let forced = false
let compacted = false
let showCount = 0
// Moves on /clear and /resume, so a summary started before cannot land in the new conversation.
let generation = 0

const reasonOf = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 120)

async function view($: EngineInterface): Promise<View> {
  return { list: await read($, snapshots), viewing: await read($, viewing), status: await read($, status), error: await read($, lastError), show: showCount }
}

async function publish($: EngineInterface) {
  const v = await view($)
  await update($, tab, () => summaryTab(v))
  await update($, summary, () => summaryChip(v))
}

async function setStatus($: EngineInterface, s: Status, error?: string) {
  if (error !== undefined) await update($, lastError, () => error)
  await update($, status, () => s)
  await publish($)
}

async function rows($: EngineInterface): Promise<Row[]> {
  return (await $.session.messages()).map(m => ({ role: m.role, text: m.text ?? '', toolUses: m.toolUses.map(t => ({ tool: t.tool, input: t.input, isError: t.isError })) }))
}

// One summary. `isFull` (Refresh) rebuilds from the whole transcript.
async function runOnce($: EngineInterface, isFull: boolean) {
  const gen = generation
  const r = await rows($)
  const isCompacted = compacted
  compacted = false
  const plan = planSummary(await read($, snapshots), r, { isFull, isCompacted })
  if (plan === null) return
  await setStatus($, 'working')
  const answer = await $.model.complete({ model: 'haiku', system: SYSTEM, prompt: plan.prompt, maxTokens: 1500, effort: 'low', timeoutMs: 90_000 })
  if (gen !== generation) return
  if (!answer.isAnswered) {
    await setStatus($, 'error', `Summary failed: ${answer.reason}`)
    return
  }
  const turn = await $.session.turns()
  const at = clockTime(await $.clock.now())
  await update($, snapshots, prev => addSnapshot(prev, { turn, count: r.length, tailSig: sig(r.at(-1)), text: answer.text.trim(), at, isRolledBack: plan.isRolledBack }))
  await update($, viewing, () => -1)
  await setStatus($, 'idle', '')
}

// One summary at a time: a turn that ends while one runs asks for one more after it.
async function summarize($: EngineInterface, isForce = false) {
  if (isForce) forced = true
  if (running) {
    dirty = true
    return
  }
  running = true
  try {
    do {
      dirty = false
      const isFull = forced
      forced = false
      await runOnce($, isFull)
    } while (dirty)
  } catch (err) {
    await setStatus($, 'error', `Summary failed: ${reasonOf(err)}`).catch(() => undefined)
  } finally {
    running = false
  }
}

async function isHeadless($: EngineInterface) {
  return (await $.session.surfaces()).length === 0
}

const PRESSES = ['older', 'newer', 'latest', 'refresh'] as const
type Press = (typeof PRESSES)[number]
const isPress = (s: string): s is Press => (PRESSES as readonly string[]).includes(s)

// A tab press and its /summary --<id> twin.
async function press($: EngineInterface, id: Press) {
  if (id === 'refresh') {
    $.clock.after(10, () => void summarize($, true))
    return
  }
  const v = await view($)
  await update($, viewing, () => step(v, id))
  await publish($)
}

async function summaryCommand($: EngineInterface, args: string): Promise<string> {
  const verb = args.trim().toLowerCase().replace(/^--/, '')
  if (isPress(verb)) {
    // Headless the process may end once the command returns, so a refresh is awaited there.
    if (verb === 'refresh' && (await isHeadless($))) {
      await summarize($, true)
      return summaryText(await view($))
    }
    await press($, verb)
    return ''
  }
  if (verb === '' || verb === 'show') {
    if ((await isHeadless($)) || !(await $.command.list()).some(c => c.name === 'dashboard')) return summaryText(await view($))
    showCount += 1
    await publish($)
    const r = await $.ui.open({ id: DASHBOARD, title: 'Dashboard', focus: true })
    return r.isPlaced ? '' : `Dashboard not shown (${r.reason}).`
  }
  if (verb === 'text') return summaryText(await view($))
  return 'Usage: /summary (the Summary tab), /summary text, /summary refresh, /summary older|newer|latest'
}

export const register: Register = on => {
  running = false
  dirty = false
  forced = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'summary',
      description: 'Rolling conversation summary in the dashboard: /summary, /summary refresh, /summary text',
      argumentHint: '[refresh|text|older|newer|latest]',
    })
    await publish($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'summary' }, async ($, e) => {
    const out = await summaryCommand($, e.args).catch(err => `bws-summary: /summary failed (${reasonOf(err)}).`)
    return out ? { text: out } : {}
  })

  // Watches only: a main-conversation compaction that went through.
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined && 'messages' in r && r.messages !== undefined) compacted = true
    return r
  })

  // Main conversation only, when Claude actually stopped, and never headless (claude -p workers pay a model call
  // nobody reads). The summary starts after the turn returns.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && (e.reason === 'answer' || e.reason === 'aborted')) {
      $.clock.after(10, () => {
        void isHeadless($)
          .then(h => (h ? undefined : summarize($)))
          .catch(err => $.ui.log(`bws-summary: turn failed (${reasonOf(err)})`, { to: 'debug' }))
      })
    }
    return done
  })

  // /clear and /resume: the old conversation's summaries go, and work in flight for it is dropped.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      generation++
      compacted = false
      await update($, snapshots, () => [])
      await update($, viewing, () => -1)
      await setStatus($, 'idle', '').catch(() => undefined)
    }
    return next(e)
  })

  // A press in the Summary tab (bws-cockpit writes it).
  on('state.set', { plugin: 'bws-cockpit', key: 'tabEvent' }, async ($, e, next) => {
    const ev = parseEvent(e.value)
    if (ev?.plugin === 'bws-summary' && isPress(ev.id)) {
      const id = ev.id
      // Queued: republishing the tab from inside a state.set hook reads the old value and stalls.
      $.clock.after(10, () => void press($, id).catch(() => $.ui.log('bws-summary: tab press failed', { to: 'debug' })))
    }
    return next(e)
  })
}
