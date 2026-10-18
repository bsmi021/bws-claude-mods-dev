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
  let promptAt: number | undefined
  flags = { needsInput: flag('needsInput'), turnDone: flag('turnDone'), subagentDone: flag('subagentDone'), errors: flag('errors') }
  minTurnSeconds = minTurnMs / 1000

  on('session.start', async ($, e, next) => {
    await publish($).catch(() => undefined)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    promptAt = await $.clock.now()
    return next(e)
  })

  on('classic.Notification', async ($, e, next) => {
    if (flag('needsInput')) await send($, needsInput(e.cwd, e.message, e.notification_type, max))
    return next(e)
  })

  on('classic.Stop', async ($, e, next) => {
    if (flag('turnDone') && (e.background_tasks?.length ?? 0) === 0) {
      const ms = promptAt === undefined ? undefined : (await $.clock.now()) - promptAt
      if (ms === undefined || ms >= minTurnMs) await send($, turnDone(e.cwd, e.last_assistant_message, ms, max))
    }
    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    // Internal forks (prompt suggestions) stop with no agent type and a JSON body: not a subagent report.
    if (flag('subagentDone') && isReport(e.agent_type, e.last_assistant_message)) await send($, subagentDone(e.cwd, e.agent_type, e.last_assistant_message, max))
    return next(e)
  })

  on('classic.StopFailure', async ($, e, next) => {
    if (flag('errors')) await send($, failure(e.cwd, String(e.error), e.error_details, max))
    return next(e)
  })
}
