// shell-lint's dashboard tab (bws-kit/tab.ts): which rules run, and the last commands it refused. Pure: no `$`.
import { card, makeTab, text } from './kit/tab'
import type { ModTab } from './kit/tab'
import { RULE_NAMES, toastText } from './lint'
import type { Finding, RuleName } from './lint'

export type Refusal = { at: number; finding: Finding }
export const REFUSALS_KEPT = 5

const clock = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function lintTab(disabled: readonly string[], refusals: readonly Refusal[], count: number): ModTab {
  const active = RULE_NAMES.filter((r: RuleName) => !disabled.includes(r))
  const recent = refusals.slice(-REFUSALS_KEPT).reverse()
  return makeTab(
    'Shell lint',
    [
      text(active.length > 0 ? `Checks Bash commands for: ${active.join(', ')}.` : 'Every rule is disabled in the plugin options.', { isBold: true }),
      text('A refused command is never run; Claude gets the exact fix and retries.', { isDim: true }),
      card(
        'Last refused',
        recent.length > 0 ? recent.map(r => text(`${clock(r.at)}  ${toastText(r.finding).replace(/^shell-lint: /, '')}`)) : [text('Nothing refused in this session.', { isDim: true })],
        recent.length > 0 ? 'warn' : undefined,
      ),
    ],
    { badge: count > 0 ? String(count) : '', tone: count > 0 ? 'warn' : 'idle' },
  )
}
