// bws-shell-lint: refuse a Bash command that will fail for quoting or length reasons on Windows Git Bash,
// and tell Claude the exact fix so it retries correctly at once. Never rewrites the command.
import { atom, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { lint, denyText, toastText } from './lint'
import { lintTab, REFUSALS_KEPT, type Refusal } from './tab'

// The dashboard tab bws-cockpit draws (bws-kit/tab.ts).
const tab = atom({ plugin: 'bws-shell-lint', key: 'tab' } as const, null as unknown)

// This process's refusals, for the tab: the last few, and how many in all.
const refusals: Refusal[] = []
let refusedCount = 0
// The disabledRules option, read in register.
let disabled: string[] = []

async function publish($: EngineInterface) {
  await update($, tab, () => lintTab(disabled, refusals, refusedCount))
}

export const register: Register = (on, options) => {
  if (options.enabled === false) return

  disabled = String(options.disabledRules ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s !== '')

  on('session.start', async ($, e, next) => {
    await publish($).catch(() => undefined)
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.tool !== 'Bash' || typeof e.command !== 'string') return next(e)
    const finding = lint(e.command, disabled)
    if (finding === null) return next(e)
    try {
      $.ui.toast(toastText(finding))
    } catch {
      // no toast where nothing draws (claude -p): the deny below still carries the fix
    }
    refusals.push({ at: await $.clock.now(), finding })
    if (refusals.length > REFUSALS_KEPT) refusals.shift()
    refusedCount += 1
    await publish($).catch(() => undefined)
    return { deny: denyText(finding) }
  })
}
