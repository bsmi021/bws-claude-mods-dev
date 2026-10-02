// bws-shell-lint: refuse a Bash command that will fail for quoting or length reasons on Windows Git Bash,
// and tell Claude the exact fix so it retries correctly at once. Never rewrites the command.
import type { Register } from 'claude-code'
import { lint, denyText, toastText } from './lint.ts'

export const register: Register = (on, options) => {
  if (options.enabled === false) return

  const disabled = String(options.disabledRules ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s !== '')

  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    if (e.tool !== 'Bash' || typeof e.command !== 'string') return next(e)
    const finding = lint(e.command, disabled)
    if (finding === null) return next(e)
    try {
      $.ui.toast(toastText(finding))
    } catch {
      // no toast where nothing draws (claude -p): the deny below still carries the fix
    }
    return { deny: denyText(finding) }
  })
}
