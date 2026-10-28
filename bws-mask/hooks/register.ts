// bws-mask: screen-share masking. While on, the transcript's rows draw emails, phone numbers, amounts, keys, the
// account name and the person's own terms as bars of the same length; only the drawing changes, never what Claude
// reads. /mask toggles it; bws-cockpit draws the Mask tab. The only file that uses `$`.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { DASHBOARD, parseEvent } from './kit/tab'
import { mask, maskDeep, parseTerms, userOfPath, type Hit, type Kind, type Rules } from './mask'
import { NO_TALLY, maskChip, maskTab, maskText, type Tally } from './view'

// Session-scoped: $.state survives a hot reload, never a new process; a new session starts with masking off.
const isOnAtom = atom({ plugin: 'bws-mask', key: 'on' } as const, false)
// The dashboard tab bws-cockpit draws (bws-kit/tab.ts) and the chip it shows.
const tab = atom({ plugin: 'bws-mask', key: 'tab' } as const, null as unknown)
const summary = atom({ plugin: 'bws-mask', key: 'summary' } as const, null)

// The render hooks read these, never $.state: rows draw again on every scroll.
let isOn = false
let rules: Rules = { terms: [] }
let configTerms = 0
let autoUser = ''
let showCount = 0
let isQueued = false
// Distinct hidden values per kind, kept as hashes: the values themselves are never stored or shown.
let seen = new Map<Kind, Set<number>>()

const STATUS = '🙈 Masking on · /mask turns it off'
const reasonOf = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 120)

function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}

function tally(): Tally {
  const t = { ...NO_TALLY }
  for (const [k, set] of seen) t[k] = set.size
  return t
}

async function publish($: EngineInterface) {
  const t = tally()
  await update($, tab, () => maskTab({ isOn, tally: t, terms: configTerms, hasAutoUser: autoUser !== '', show: showCount }))
  await update($, summary, () => maskChip(isOn, t))
}

function queuePublish($: EngineInterface) {
  if (isQueued) return
  isQueued = true
  $.clock.after(200, () => {
    isQueued = false
    void publish($).catch(err => $.ui.log(`bws-mask: publish failed (${reasonOf(err)})`, { to: 'debug' }))
  })
}

// A render hook's hits: a value not seen before republishes the counts.
function note($: EngineInterface, hits: Hit[]) {
  let isNew = false
  for (const h of hits) {
    const set = seen.get(h.kind) ?? new Set<number>()
    const k = hash(h.value)
    if (!set.has(k)) {
      set.add(k)
      seen.set(h.kind, set)
      isNew = true
    }
  }
  if (isNew) queuePublish($)
}

async function setMode($: EngineInterface, want: boolean) {
  isOn = want
  await update($, isOnAtom, () => want)
  $.ui.status(want ? STATUS : undefined)
  // Every row already drawn draws again now, old messages included.
  $.ui.invalidate('ui.render')
  await publish($)
}

async function maskCommand($: EngineInterface, args: string): Promise<string> {
  const verb = args.trim().toLowerCase().replace(/^--/, '')
  if (verb === '' || verb === 'toggle') {
    await setMode($, !isOn)
    return isOn ? 'Masking on: emails, phones, amounts, keys, your account name and your terms draw as bars. Claude still reads the real data. /mask again turns it off.' : 'Masking off.'
  }
  if (verb === 'on' || verb === 'off') {
    await setMode($, verb === 'on')
    return verb === 'on' ? 'Masking on.' : 'Masking off.'
  }
  if (verb === 'text') return maskText({ isOn, tally: tally(), terms: configTerms, hasAutoUser: autoUser !== '' })
  if (verb === 'show' || verb === 'tab') {
    const isHeadless = (await $.session.surfaces()).length === 0
    if (isHeadless || !(await $.command.list()).some(c => c.name === 'dashboard')) return maskText({ isOn, tally: tally(), terms: configTerms, hasAutoUser: autoUser !== '' })
    showCount += 1
    await publish($)
    const r = await $.ui.open({ id: DASHBOARD, title: 'Dashboard', focus: true })
    return r.isPlaced ? '' : `Dashboard not shown (${r.reason}).`
  }
  return 'Usage: /mask (toggle), /mask on, /mask off, /mask show (the Mask tab), /mask text'
}

export const register: Register = (on, options) => {
  const terms = parseTerms(options.terms)
  configTerms = terms.length
  rules = { terms }
  isOn = false
  showCount = 0
  isQueued = false
  seen = new Map()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mask',
      description: 'Screen-share masking on or off: hides emails, phones, amounts, keys and your terms on screen (Claude still reads the real data)',
      argumentHint: '[on|off|show|text]',
      // A toggle must work mid-turn, while a recording runs.
      immediate: true,
    })
    try {
      // The account name the plugin's own install path holds is hidden anywhere it shows.
      autoUser = userOfPath($.plugin.root)
      rules = { terms: autoUser ? [...terms, autoUser] : terms }
      isOn = await read($, isOnAtom)
      $.ui.status(isOn ? STATUS : undefined)
      await publish($)
    } catch (err) {
      $.ui.log(`bws-mask: start failed (${reasonOf(err)})`, { to: 'debug' })
    }
    return next(e)
  })

  on('command.run', { command: 'mask' }, async ($, e) => {
    const out = await maskCommand($, e.args).catch(err => `bws-mask: /mask failed (${reasonOf(err)}).`)
    return out ? { text: out } : {}
  })

  // The transcript rows. Off, or nothing private: the props pass as they came.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!isOn) return next(e)
    const m = mask(e.props.text, rules)
    if (m.hits.length === 0) return next(e)
    note($, m.hits)
    return next({ ...e, props: { ...e.props, text: m.text } })
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!isOn) return next(e)
    const m = mask(e.props.text, rules)
    if (m.hits.length === 0) return next(e)
    note($, m.hits)
    return next({ ...e, props: { ...e.props, text: m.text } })
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (!isOn) return next(e)
    const m = mask(e.props.text, rules)
    if (m.hits.length === 0) return next(e)
    note($, m.hits)
    return next({ ...e, props: { ...e.props, text: m.text } })
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!isOn) return next(e)
    const hits: Hit[] = []
    const input = maskDeep(e.props.input, rules, hits)
    const output = maskDeep(e.props.output, rules, hits)
    if (input === e.props.input && output === e.props.output) return next(e)
    note($, hits)
    return next({ ...e, props: { ...e.props, input, output } })
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!isOn) return next(e)
    const hits: Hit[] = []
    const output = maskDeep(e.props.output, rules, hits)
    if (output === e.props.output) return next(e)
    note($, hits)
    return next({ ...e, props: { ...e.props, output } })
  })

  // /clear and /resume: the counts start again; the mode stays as the person set it.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      seen = new Map()
      await publish($).catch(() => undefined)
    }
    return next(e)
  })

  // A press in the Mask tab (bws-cockpit writes it).
  on('state.set', { plugin: 'bws-cockpit', key: 'tabEvent' }, async ($, e, next) => {
    try {
      const ev = parseEvent(e.value)
      // Queued: changing state from inside a state.set hook reads the old value and stalls.
      if (ev?.plugin === 'bws-mask' && ev.id === 'toggle') $.clock.after(10, () => void setMode($, !isOn).catch(() => $.ui.log('bws-mask: toggle failed', { to: 'debug' })))
    } catch {
      // A malformed press is ignored.
    }
    return next(e)
  })
}
