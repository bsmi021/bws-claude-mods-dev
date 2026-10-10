// bws-notify: Windows toasts that carry the project and what happened, launched with no console window.
import type { EngineInterface, Register } from 'claude-code'
import { encode, failure, isReport, needsInput, subagentDone, turnDone, type Toast } from './text'

const DEDUPE_MS = 8000

let lastKey = ''
let lastAt = 0

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
  } catch {
    // a toast that cannot start must never touch the turn
  }
}

export const register: Register = (on, options) => {
  const max = Math.max(40, Number(options.maxBodyChars ?? 160))
  const minTurnMs = Math.max(0, Number(options.minTurnSeconds ?? 20)) * 1000
  const flag = (k: string) => options[k] !== false
  let promptAt: number | undefined

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
