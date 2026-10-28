// The dashboard's Mods tab, the switchboard: every bws mod with whether it is installed, enabled and drawing a tab, and
// switches to enable or disable it (`claude plugin enable|disable <mod>@bws-mods`, applied by /reload-plugins) and to
// hide or show its dashboard tab (kept in $.store across sessions). Pure: no `$`, so tests call it directly.

export const MARKETPLACE = 'bws-mods'

export type ModInfo = { emoji: string; title: string; blurb: string }

// Every mod in the marketplace, in the order the tab lists them. A mod published later and missing here still shows,
// under its plugin name, once `claude plugin list` reports it.
export const MODS: Record<string, ModInfo> = {
  'bws-cockpit': { emoji: '🛫', title: 'Cockpit', blurb: 'This dashboard, the action bar, guards and the cache clock' },
  'bws-agents': { emoji: '🤖', title: 'Agents', blurb: 'Live card per subagent: status, tools, tokens, stalls' },
  'bws-inventory': { emoji: '📦', title: 'Inventory', blurb: 'Todos, connectors, files and skills this conversation used' },
  'bws-mask': { emoji: '🙈', title: 'Mask', blurb: 'Hides emails, phones, amounts, keys and your terms on screen for recordings' },
  'bws-board': { emoji: '📋', title: 'Board', blurb: 'Sessions in one repo: claims, asks, git lease' },
  'bws-summary': { emoji: '📝', title: 'Summary', blurb: 'Rolling summary of the conversation' },
  'bws-direction': { emoji: '🧭', title: 'Direction', blurb: 'Drift check of each turn against the plan and docs' },
  'bws-memory': { emoji: '🧠', title: 'Memory', blurb: 'Remembers what you say is worth keeping; /dream tidies it' },
  'bws-diagram': { emoji: '📊', title: 'Diagram', blurb: 'Draws big turns and pins mermaid blocks' },
  'bws-sidechat': { emoji: '💬', title: 'Side chat', blurb: '/fork and /btw in a side pane; /explain decision trees' },
  'bws-enhance': { emoji: '✨', title: 'Enhance', blurb: 'Rewrites a rough prompt; optional prompt bouncer' },
  'bws-better': { emoji: '🎯', title: 'Better', blurb: '/better: three questions, then a goal-and-outcome prompt' },
  'bws-interview': { emoji: '🎤', title: 'Interview', blurb: 'Keeps every AskUserQuestion round per project' },
  'bws-skillgate': { emoji: '🚪', title: 'Skillgate', blurb: 'Cuts the skill listing to the ones a prompt needs' },
  'bws-secrets': { emoji: '🔐', title: 'Secrets', blurb: 'Masked secret entry; {{secret:NAME}} in Bash' },
  'bws-notify': { emoji: '🔔', title: 'Notify', blurb: 'Windows toasts for asks, finished turns and errors' },
  'bws-shell-lint': { emoji: '🐚', title: 'Shell lint', blurb: 'Refuses Bash commands that fail on Git Bash' },
  'bws-design-picker': { emoji: '🎨', title: 'Design picker', blurb: 'Mockups above design-direction pickers' },
}

// What `claude plugin list --json` says of one installed plugin.
export type Installed = { version: string; isEnabled: boolean }

// The bws mods in `claude plugin list --json` output, by plugin name. Anything malformed is skipped.
export function parseList(stdout: string): Map<string, Installed> {
  const out = new Map<string, Installed>()
  let rows: unknown
  try {
    rows = JSON.parse(stdout)
  } catch {
    return out
  }
  if (!Array.isArray(rows)) return out
  for (const r of rows) {
    if (typeof r !== 'object' || r === null) continue
    const x = r as Record<string, unknown>
    const id = typeof x.id === 'string' ? x.id : ''
    const at = id.lastIndexOf('@')
    if (at <= 0 || id.slice(at + 1) !== MARKETPLACE) continue
    const name = id.slice(0, at)
    const isEnabled = x.enabled === true || x.projectEnabled === true
    // A plugin installed at two scopes: enabled anywhere counts.
    const prev = out.get(name)
    out.set(name, { version: typeof x.version === 'string' ? x.version : (prev?.version ?? ''), isEnabled: isEnabled || prev?.isEnabled === true })
  }
  return out
}

export type SwitchState = 'on' | 'off' | 'missing'

export type SwitchRow = {
  name: string
  info: ModInfo
  state: SwitchState
  version: string
  isLoaded: boolean // loaded in this session (from source or the installed copy)
  isTab: boolean // it draws a dashboard tab here
  isHidden: boolean
  isPending: boolean // switched since the last /reload-plugins
  canSwitch: boolean // cockpit cannot switch itself off from its own tab
}

export type Board = {
  installed: Record<string, Installed> | null // null until the first `claude plugin list` answered
  hidden: string[]
  pending: string[]
  note: string
  isBusy: boolean
}

export const EMPTY_BOARD: Board = { installed: null, hidden: [], pending: [], note: '', isBusy: false }

export function rows(b: Board, loaded: readonly string[], tabs: readonly string[]): SwitchRow[] {
  const names = [...Object.keys(MODS), ...Object.keys(b.installed ?? {}).filter(n => !(n in MODS)).sort(), ...loaded.filter(n => n.startsWith('bws-') && !(n in MODS))]
  const seen = new Set<string>()
  const out: SwitchRow[] = []
  for (const name of names) {
    if (seen.has(name)) continue
    seen.add(name)
    const inst = b.installed?.[name]
    const isLoaded = loaded.includes(name)
    const state: SwitchState = inst === undefined ? (isLoaded ? 'on' : 'missing') : inst.isEnabled ? 'on' : 'off'
    out.push({
      name,
      info: MODS[name] ?? { emoji: '🧩', title: name, blurb: 'A bws mod' },
      state,
      version: inst?.version ?? '',
      isLoaded,
      isTab: tabs.includes(name),
      isHidden: b.hidden.includes(name),
      isPending: b.pending.includes(name),
      canSwitch: name !== 'bws-cockpit' && inst !== undefined,
    })
  }
  return out
}

export const counts = (rs: readonly SwitchRow[]) => ({
  on: rs.filter(r => r.state === 'on').length,
  off: rs.filter(r => r.state === 'off').length,
  missing: rs.filter(r => r.state === 'missing').length,
  pending: rs.filter(r => r.isPending).length,
})

const STATE_EMOJI: Record<SwitchState, string> = { on: '✅', off: '⛔', missing: '➖' }
const STATE_WORD: Record<SwitchState, string> = { on: 'on', off: 'off', missing: 'not installed' }

// The card's lines: title, then what it does, then its state. Each emoji opens its line (a wide glyph mid-line can push
// a round border out of line).
export function rowLines(r: SwitchRow): { title: string; blurb: string; state: string } {
  const bits = [STATE_WORD[r.state], ...(r.version ? [`v${r.version}`] : []), ...(r.isLoaded ? ['loaded'] : r.state === 'on' ? ['not loaded'] : []), ...(r.isTab ? [r.isHidden ? 'tab hidden' : 'tab shown'] : r.isHidden ? ['tab hidden'] : [])]
  return {
    title: `${r.info.emoji} ${r.info.title}`,
    blurb: r.info.blurb,
    state: `${r.isPending ? '🔄' : STATE_EMOJI[r.state]} ${bits.join(' · ')}${r.isPending ? ' · /reload-plugins to apply' : ''}`,
  }
}

// The colour of a mod's card: switched since the reload, on, off, not installed.
export const rowTone = (r: SwitchRow): 'pending' | 'on' | 'off' | 'missing' => (r.isPending ? 'pending' : r.state)

export function boardText(rs: readonly SwitchRow[], b: Board): string {
  const c = counts(rs)
  const head = `Mods: ${c.on} on, ${c.off} off, ${c.missing} not installed${c.pending > 0 ? `, ${c.pending} waiting for /reload-plugins` : ''}`
  const lines = rs.map(r => {
    const l = rowLines(r)
    return `${l.title} (${r.name}): ${l.state.replace(/^\S+ /, '')}`
  })
  return [head, ...lines, ...(b.note ? [b.note] : [])].join('\n')
}

export type SwitchVerb = 'enable' | 'disable' | 'hide' | 'show'
export type SwitchCommand = { verb: SwitchVerb; name: string } | { verb: 'refresh' | 'text' | 'open' } | { error: string }

// `/switchboard [--enable|--disable|--hide|--show <mod>] | refresh | text`. A mod may be named without `bws-`.
export function parseSwitch(args: string): SwitchCommand {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const verb = (words[0] ?? '').replace(/^--/, '')
  if (verb === '' || verb === 'show-tab' || verb === 'open') return { verb: 'open' }
  if (verb === 'refresh' || verb === 'text') return { verb }
  if (verb === 'enable' || verb === 'disable' || verb === 'hide' || verb === 'show') {
    const raw = words[1] ?? ''
    if (raw === '') return { error: `Usage: /switchboard --${verb} <mod>` }
    return { verb, name: raw.startsWith('bws-') ? raw : `bws-${raw}` }
  }
  return { error: 'Usage: /switchboard (the Mods tab), /switchboard text, /switchboard refresh, /switchboard --enable|--disable|--hide|--show <mod>' }
}

// A switch press id: `en:<mod>`, `dis:<mod>`, `hide:<mod>`, `show:<mod>`.
export const pressId = (verb: SwitchVerb, name: string) => `${verb}:${name}`

export function hiddenAfter(hidden: readonly string[], verb: 'hide' | 'show', name: string): string[] {
  const rest = hidden.filter(n => n !== name)
  return verb === 'hide' ? [...rest, name] : rest
}

export const pendingAfter = (pending: readonly string[], name: string): string[] => (pending.includes(name) ? pending.filter(n => n !== name) : [...pending, name])
