// The one `summary` state atom every mod publishes ({ plugin, key: 'summary' }), so bws-cockpit's bar and
// bws-board can show it. Pure: no `$`. A mod writes `null` (or an `idle` summary) when it has nothing to say;
// the bar draws a chip only for a loaded, non-idle mod.

export type SummaryState = 'idle' | 'busy' | 'ok' | 'warn' | 'bad'

export type ModSummary = {
  state: SummaryState
  label: string // the chip text, short: "memory updating", "3 secrets", "dream due"
  detail?: string // a longer line for a tooltip or text output
}

export const SUMMARY_STATES: readonly SummaryState[] = ['idle', 'busy', 'ok', 'warn', 'bad']

const MAX_LABEL = 40
const MAX_DETAIL = 200

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

export const makeSummary = (state: SummaryState, label: string, detail?: string): ModSummary => {
  const s: ModSummary = { state, label: text(label, MAX_LABEL) }
  const d = text(detail, MAX_DETAIL)
  return d ? { ...s, detail: d } : s
}

// Reads whatever another plugin wrote under `summary`. Anything that is not a well-formed summary is null, so a
// broken or absent mod draws nothing instead of failing the bar.
export const parseSummary = (v: unknown): ModSummary | null => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (typeof o.state !== 'string' || !SUMMARY_STATES.includes(o.state as SummaryState)) return null
  const label = text(o.label, MAX_LABEL)
  if (!label) return null
  return makeSummary(o.state as SummaryState, label, typeof o.detail === 'string' ? o.detail : undefined)
}

// The bar draws a chip for a summary that is present and not idle.
export const isShown = (s: ModSummary | null): s is ModSummary => s !== null && s.state !== 'idle'
