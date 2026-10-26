// bws-notify: Windows toasts that carry the project and what happened, launched with no console window.
import { atom, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { encode, failure, isReport, needsInput, notifyTab, SENT_KEPT, subagentDone, turnDone, type Sent, type Toast } from './text'

const DEDUPE_MS = 8000

// The dashboard tab bws-cockpit draws (bws-kit/tab.ts).
const tab = atom({ plugin: 'bws-notify', key: 'tab' } as const, null as unknown)

let lastKey = ''
let lastAt = 0
// This process's toasts, for the tab: the last few, and how many in all.
const sent: Sent[] = []
let sentCount = 0
// What the options switch on, read once in register.
let flags = { needsInput: true, turnDone: true, subagentDone: true, errors: true }
let minTurnSeconds = 20

async function publish($: EngineInterface) {
  await update($, tab, () => notifyTab(flags, minTurnSeconds, sent, sentCount))
}

// wscript is a GUI program and starts powershell at window style 0, so no console flashes.
async function send($: EngineInterface, t: Toast) {
  if ((await $.session.surfaces()).length === 0) return // claude -p, SDK: nobody to tell
  const now = await $.clock.now()
  const key = `${t.title}|${t.body}`
  if (key === lastKey && now - lastAt < DEDUPE_MS) return
  lastKey = key
  lastAt = now
  try {
    await $.process.run(['wscript.exe', '//B', '//Nologo', `${$.plugin.root}/bin/notify.vbs`, encode(t)], { timeoutMs: 10000 })
    sent.push({ at: now, title: t.title, body: t.body })
    if (sent.length > SENT_KEPT) sent.shift()
    sentCount += 1
    await publish($)
  } catch {
    // a toast that cannot start must never touch the turn
  }
}

export const register: Register = (on, options) => {
  const max = Math.max(40, Number(options.maxBodyChars ?? 160))
  const minTurnMs = Math.max(0, Number(options.minTurnSeconds ?? 20)) * 1000
  const flag = (k: string) => options[k] !== false
  flags = { needsInput: flag('needsInput'), turnDone: flag('turnDone'), subagentDone: flag('subagentDone'), errors: flag('errors') }
  minTurnSeconds = minTurnMs / 1000

  on('session.start', async ($, e, next) => {
    await publish($).catch(() => undefined)
    return next(e)
  })

  on('classic.Notification', async ($, e, next) => {
    if (flag('needsInput')) await send($, needsInput(e.cwd, e.message, e.notification_type, max))
    return next(e)
  })

  // Every turn's end, the main loop's and each subagent's (`agentId`). An interrupted turn toasts nothing.
  on('turn.complete', async ($, e, next) => {
    if (e.reason === 'aborted') return next(e)
    const cwd = await $.session.cwd()
    if (e.reason === 'error' || e.reason === 'refusal') {
      if (flag('errors')) {
        const error = e.reason === 'refusal' ? 'refused' : 'API'
        const details = e.reason === 'refusal' ? (e.refusal.explanation ?? e.refusal.category ?? undefined) : e.answer
        await send($, failure(cwd, error, details, max))
      }
      return next(e)
    }
    if (e.agentId !== undefined) {
      // Internal forks (prompt suggestions) are no listed agent and return a JSON body: not a subagent report.
      if (flag('subagentDone')) {
        // A teammate is named by its address (`<name>@<team>`), as the classic hook named it.
        const a = (await $.agent.list()).find(x => x.id === e.agentId)
        const type = a === undefined ? undefined : (a.teammateId?.split('@')[0] ?? a.type)
        if (type !== undefined && isReport(type, e.answer)) await send($, subagentDone(cwd, type, e.answer, max))
      }
      return next(e)
    }
    // Background agents still at work: Claude is not done yet.
    if (flag('turnDone') && e.durationMs >= minTurnMs) {
      const isWaiting = (await $.agent.list()).some(a => a.status === 'pending' || a.status === 'running' || a.status === 'waiting')
      if (!isWaiting) await send($, turnDone(cwd, e.answer, e.durationMs, max))
    }
    return next(e)
  })
}
