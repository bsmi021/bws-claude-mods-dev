// bws-direction: after a working turn a small model judges whether the work is still on the session's task, its
// run-folder plan and the project's docs/ (its specs, PRD or design doc first). Each verdict is kept per project, so drift shows within a
// session and across sessions; /direction overall judges the recent commits as a whole. The only file that uses `$`.
import { atom, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { bound } from './kit/classify-fork'
import { DASHBOARD, parseEvent } from './kit/tab'
import { corpusText, outline, parseAnchorDocs, pickAnchors, pickExcerpts, splitSections, terms, type Section } from './corpus'
import { isWorking, lastAnswer, sessionRunDir, sessionTask, skipReason, turnDigest, turnNumber, turnQuery, turnText, type Row } from './turn'
import { CHECK_SYSTEM, CHECK_TIMEOUT_MS, checkPrompt, failLine, OVERALL_SYSTEM, OVERALL_TIMEOUT_MS, overallPrompt, parseJudgement } from './verdict'
import { addCheck, directionSummary, directionTab, historyText, isDrift, lastOf, nudgeText, parseChecks, projectKey, statusText, type Check, type View } from './view'

// The dashboard tab bws-cockpit draws (bws-kit/tab.ts) and the chip it shows.
const tab = atom({ plugin: 'bws-direction', key: 'tab' } as const, null as unknown)
const summary = atom({ plugin: 'bws-direction', key: 'summary' } as const, null)

// Options, copied in by register on every load.
let isAuto = true
let model = 'haiku'
let overallModel = 'sonnet'
let every = 1
let docsDir = 'docs'
let anchorDocs: string[] = []
let isNudge = true

// This process's view of the project's record (loaded from the store on first use).
let cache: { key: string; log: Check[] } | null = null
let phase: View['phase'] = 'idle'
let note = ''
let anchors = ''
let raiseCount = 0
let showCount = 0
// /direction pause: for this session only, not written to settings.
let isPaused = false

// The running-check guard and the conversation it belongs to (as bws-diagram): `generation` moves on /clear, /resume
// and a changed session id, so a check that started before cannot land in the new conversation.
let running = false
let generation = 0
let lastSession = ''
let working = 0

// Parsed docs by path, kept while the file's mtime and size stay the same.
const docCache = new Map<string, { mtime: number; size: number; text: string; sections: Section[] }>()
const MAX_DOCS = 300
const MAX_DOC_BYTES = 2_000_000
const SKIP_DIRS = /^(\.|node_modules$|_site$|build$|dist$)/

const joinPath = (dir: string, name: string) => `${dir.replace(/[\\/]+$/, '')}/${name}`
const reasonOf = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 80)

async function settle<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p
  } catch {
    return undefined
  }
}

async function load($: EngineInterface): Promise<{ key: string; log: Check[] }> {
  const key = projectKey(await $.session.root())
  if (cache?.key === key) return cache
  cache = { key, log: parseChecks(await settle($.store.get(key))) }
  return cache
}

async function view($: EngineInterface): Promise<View> {
  const { log } = await load($)
  return { log, session: lastSession || (await $.session.id()), now: await $.clock.now(), phase, note, isAuto: isAuto && !isPaused, anchors, counts: { raise: raiseCount, show: showCount } }
}

async function publish($: EngineInterface) {
  const v = await view($)
  await update($, tab, () => directionTab(v))
  await update($, summary, () => directionSummary(v))
}

async function rows($: EngineInterface): Promise<Row[]> {
  return (await $.session.messages()).map(m => ({
    role: m.role,
    text: m.text ?? '',
    toolUses: m.toolUses.map(t => ({ tool: t.tool, input: t.input })),
    hasToolResults: (m.toolResults?.length ?? 0) > 0,
  }))
}

// ---------- anchors: the docs corpus and the session's plan ----------

// Every .md under `dir` (4 levels, MAX_DOCS files), as paths relative to it.
async function listDocs($: EngineInterface, dir: string, rel: string, depth: number, out: { rel: string; mtime: number; size: number }[]) {
  if (depth > 4 || out.length >= MAX_DOCS) return
  const entries = (await settle($.fs.list(rel ? joinPath(dir, rel) : dir))) ?? []
  for (const e of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    if (out.length >= MAX_DOCS) return
    const path = rel ? `${rel}/${e.name}` : e.name
    if (e.kind === 'dir' && !SKIP_DIRS.test(e.name)) await listDocs($, dir, path, depth + 1, out)
    else if (e.kind === 'file' && /\.md$/i.test(e.name) && e.size <= MAX_DOC_BYTES) out.push({ rel: path, mtime: e.mtimeMs, size: e.size })
  }
}

async function readDoc($: EngineInterface, abs: string, label: string, mtime: number, size: number) {
  const kept = docCache.get(abs)
  if (kept && kept.mtime === mtime && kept.size === size) return kept
  const text = await $.fs.read(abs)
  const doc = { mtime, size, text, sections: splitSections(label, text) }
  docCache.set(abs, doc)
  return doc
}

// The corpus text a check sends, with the excerpts picked for `query`. Also sets the one-line `anchors` label.
async function corpus($: EngineInterface, query: string, planPath: string): Promise<string> {
  const cwd = await $.session.root()
  const dir = joinPath(cwd, docsDir)
  const found: { rel: string; mtime: number; size: number }[] = []
  await listDocs($, dir, '', 0, found)
  const sections: Section[] = []
  const texts = new Map<string, string>()
  for (const f of found) {
    const label = `${docsDir}/${f.rel}`
    const doc = await settle(readDoc($, joinPath(dir, f.rel), label, f.mtime, f.size))
    if (!doc) continue
    sections.push(...doc.sections)
    texts.set(label, doc.text)
  }
  // The anchors: the anchorDocs option, else the specs / PRD / design docs found by name.
  const candidates = anchorDocs.length > 0 ? anchorDocs : pickAnchors(found.map(f => f.rel)).map(p => `${docsDir}/${p}`)
  const used: string[] = []
  const outlines: string[] = []
  for (const p of candidates) {
    let text = texts.get(p)
    if (text === undefined) {
      text = (await settle($.fs.read(joinPath(cwd, p)))) ?? ''
      if (text) sections.push(...splitSections(p, text))
    }
    if (!text) continue
    used.push(p)
    outlines.push(candidates.length > 1 ? `${p}:\n${outline(text, 1200)}` : outline(text))
  }
  const docs = [...texts.keys()]
  anchors = [used.length > 0 ? used.join(', ') : docs.length > 0 ? 'no anchor doc found' : '', docs.length > 0 ? `${docs.length} docs` : `no ${docsDir}/ folder`, planPath ? `plan ${planPath}` : 'no run plan'].filter(Boolean).join(' · ')
  return corpusText({ docs, anchors: used, outline: outlines.join('\n\n'), excerpts: pickExcerpts(sections, terms(query)) })
}

// The session's run-folder PLAN.md (the first 3,000 characters), or none.
async function plan($: EngineInterface, r: readonly Row[]): Promise<{ path: string; text: string }> {
  const dir = sessionRunDir(r)
  if (!dir) return { path: '', text: '' }
  const path = `runs/${dir}/PLAN.md`
  const text = (await settle($.fs.read(joinPath(await $.session.root(), path)))) ?? ''
  return text ? { path, text: text.length > 3000 ? `${text.slice(0, 3000)}...` : text } : { path: '', text: '' }
}

// ---------- checks ----------

async function judge($: EngineInterface, m: string, system: string, prompt: string, timeoutMs: number) {
  const r = await bound($.model.complete({ model: m, system, prompt, maxTokens: 500 }), (ms, fn) => $.clock.after(ms, fn), { timeoutMs })
  if (!r.ok) return { error: r.reason }
  if (!r.value.isAnswered) return { error: r.value.reason }
  const j = parseJudgement(r.value.text)
  return j ? { judgement: j } : { error: 'unreadable answer' }
}

async function record($: EngineInterface, c: Check) {
  const s = await load($)
  s.log = addCheck(s.log, c)
  await $.store.set(s.key, s.log)
}

type Outcome = { text: string; check?: Check }

// One check. `turn`: the last turn against the task, plan and docs. `overall`: recent commits and earlier checks
// against the docs. Never throws: a failure leaves the record as it was, shows a note and writes one debug line.
async function check($: EngineInterface, scope: 'turn' | 'overall', answer?: string): Promise<Outcome> {
  const gen = generation
  running = true
  phase = scope === 'turn' ? 'checking' : 'overall'
  note = ''
  await publish($)
  const fail = (step: string, reason: string): Outcome => {
    $.ui.log(failLine(step, reason), { to: 'debug' })
    if (gen === generation) note = `Check failed (${step}: ${reason}).`
    return { text: `No verdict. (${step}: ${reason})` }
  }
  try {
    const r = await rows($)
    const p = await plan($, r)
    const task = sessionTask(r)
    let out
    let files: string[] = []
    if (scope === 'turn') {
      const d = turnDigest(r, answer ?? lastAnswer(r))
      if (d.toolCalls === 0 && !d.answer) return { text: 'Nothing to check: this session has no turn with work yet.' }
      files = d.files
      const docs = await corpus($, turnQuery(d, task.first), p.path)
      out = await judge($, model, CHECK_SYSTEM, checkPrompt({ task, plan: p.text, planPath: p.path, corpus: docs, turn: turnText(d) }), CHECK_TIMEOUT_MS)
    } else {
      const cwd = await $.session.root()
      const git = await settle($.process.run(['git', 'log', '-n', '40', '--since=30.days.ago', '--date=short', '--format=%h %ad %s', '--shortstat'], { cwd, timeoutMs: 15_000 }))
      const log = git && git.exitCode === 0 ? git.stdout.slice(0, 8000) : ''
      const docs = await corpus($, `${log}\n${p.text}`, p.path)
      out = await judge($, overallModel, OVERALL_SYSTEM, overallPrompt({ log, history: historyText((await load($)).log), plan: p.text, planPath: p.path, corpus: docs }), OVERALL_TIMEOUT_MS)
    }
    if (gen !== generation) return { text: 'No verdict. (the conversation changed)' }
    if (!('judgement' in out) || !out.judgement) return fail(scope, out.error ?? 'error')
    const c: Check = { ...out.judgement, at: await $.clock.now(), session: lastSession || (await $.session.id()), scope, turn: turnNumber(r), files }
    await record($, c)
    if (isDrift(c)) await alert($, c)
    return { text: statusText(await view($)), check: c }
  } catch (err) {
    return fail(scope, reasonOf(err))
  } finally {
    if (gen === generation) {
      running = false
      phase = 'idle'
      await publish($).catch(() => undefined)
    }
  }
}

// Drift found: bring the tab up, say it in a toast, and (nudge) give Claude the note from its next prompt on.
async function alert($: EngineInterface, c: Check) {
  raiseCount += 1
  const isHeadless = (await $.session.surfaces()).length === 0
  if (!isHeadless) $.ui.toast(`Direction: ${c.verdict} (${c.score}) · ${c.reason}`.slice(0, 160), { timeoutMs: 8000 })
  if (isNudge && c.scope === 'turn') $.ui.invalidate('prompt.context')
}

// ---------- the session ----------

function dropWork() {
  generation++
  running = false
  phase = 'idle'
  note = ''
  working = 0
}

// A changed session id is a new conversation (as bws-diagram): drop work in flight and count its turns afresh.
async function syncSession($: EngineInterface) {
  const id = await $.session.id()
  if (lastSession === '' || lastSession === id) {
    lastSession = id
    return
  }
  dropWork()
  lastSession = id
  await publish($)
}

// The end of a turn: count it, and check it when the gate says so. Runs after turn.complete returned.
async function afterTurn($: EngineInterface, e: { answer: string; reason: string; agentId?: string }) {
  await syncSession($)
  if ((await $.session.surfaces()).length === 0) return // headless (claude -p, harness workers): commands only
  const r = await rows($)
  const d = turnDigest(r, e.answer)
  const isWork = isWorking(d)
  if (isWork && !e.agentId && e.reason === 'answer') working += 1
  const why = skipReason({ isAuto: isAuto && !isPaused, agentId: e.agentId, reason: e.reason, isRunning: running, isWorking: isWork, every, working })
  if (why !== null) return
  await check($, 'turn', e.answer)
}

// Starts a check from a command or a press. Headless the process may end once the command returns, so it is awaited.
async function start($: EngineInterface, scope: 'turn' | 'overall'): Promise<string> {
  await syncSession($)
  if (running) return 'A check is already running; try again in a moment.'
  if ((await $.session.surfaces()).length === 0) return (await check($, scope)).text
  running = true
  $.clock.after(10, () => void check($, scope).catch(() => undefined))
  return scope === 'turn' ? 'Checking the last turn... the Direction tab shows the verdict.' : 'Checking the whole project... the Direction tab shows the verdict.'
}

// Tell Claude: the last drift verdict as the person's own prompt. Deferred: never submit from inside a command.
async function tell($: EngineInterface): Promise<string> {
  const last = lastOf((await load($)).log, 'turn', lastSession)
  if (!isDrift(last) || !last) return 'The last check found no drift; nothing to tell Claude.'
  const text = nudgeText(last)
  $.clock.after(10, () => void $.prompt.submit({ text, asUser: true }).catch(() => $.ui.toast('bws-direction: could not send the verdict to Claude')))
  return 'Sending the verdict to Claude.'
}

async function hasDashboard($: EngineInterface): Promise<boolean> {
  return (await $.command.list()).some(c => c.name === 'dashboard')
}

// A tab press and its /direction --<id> twin. Returns the line to show.
async function press($: EngineInterface, id: string): Promise<string> {
  if (id === 'check') return start($, 'turn')
  if (id === 'overall') return start($, 'overall')
  if (id === 'tell') return tell($)
  if (id === 'pause' || id === 'resume') {
    isPaused = id === 'pause'
    await publish($)
    return isPaused ? 'Automatic direction checks paused for this session.' : 'Automatic direction checks resumed.'
  }
  return ''
}

const PRESSES = ['check', 'overall', 'tell', 'pause', 'resume']

async function directionCommand($: EngineInterface, args: string): Promise<string> {
  await syncSession($)
  const verb = args.trim().toLowerCase().replace(/^--/, '')
  if (verb === '' || verb === 'status') {
    if (!anchors) await corpus($, '', (await plan($, await rows($))).path).catch(() => '')
    return statusText(await view($))
  }
  if (PRESSES.includes(verb)) return press($, verb)
  if (verb === 'show') {
    if (!(await hasDashboard($))) return statusText(await view($))
    showCount += 1
    await publish($)
    const r = await $.ui.open({ id: DASHBOARD, title: 'Dashboard', focus: true })
    return r.isPlaced ? '' : `Dashboard not shown (${r.reason}).`
  }
  return 'Usage: /direction (status), /direction check (the last turn), /direction overall (the whole project), /direction show (the Direction tab), /direction tell, /direction pause|resume'
}

export const register: Register = (on, options) => {
  isAuto = options.autoCheck !== false
  model = String(options.model ?? '').trim() || 'haiku'
  overallModel = String(options.overallModel ?? '').trim() || 'sonnet'
  every = Math.max(1, Math.floor(Number(options.every) || 1))
  docsDir = String(options.docsDir ?? '').trim().replace(/\\/g, '/').replace(/^\.\/|\/+$/g, '') || 'docs'
  anchorDocs = parseAnchorDocs(typeof options.anchorDocs === 'string' ? options.anchorDocs : '')
  isNudge = options.nudge !== false
  cache = null
  running = false
  phase = 'idle'
  lastSession = ''

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'direction',
      description: 'Drift check against the task, the run plan and docs/ (specs, PRD, design docs): /direction, /direction check, /direction overall, /direction show',
      argumentHint: '[check|overall|show|tell|pause|resume]',
    })
    lastSession = await $.session.id()
    await publish($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'direction' }, async ($, e) => ({ text: await directionCommand($, e.args).catch(err => `bws-direction: /direction failed (${reasonOf(err)}).`) }))

  // The one turn.complete hook: the check starts after it returns, so the turn never waits on it.
  on('turn.complete', async ($, e, next) => {
    $.clock.after(10, () => void afterTurn($, e).catch(err => $.ui.log(failLine('turn', reasonOf(err)), { to: 'debug' })))
    return next(e)
  })

  // nudge: while this session's last check found drift, Claude's context carries the verdict.
  on('prompt.context', async ($, e, next) => {
    const result = await next(e)
    if (!isNudge || !lastSession) return result
    const last = lastOf(cache?.log ?? [], 'turn', lastSession)
    return last && isDrift(last) ? { ...result, blocks: [...result.blocks, { name: 'bwsDirection', text: nudgeText(last) }] } : result
  })

  // /clear and /resume: work for the old conversation stops (its checks stay in the project record), and its drift
  // note leaves Claude's context; the next session id seen starts the count afresh.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      dropWork()
      lastSession = ''
    }
    return next(e)
  })

  // A press in the Direction tab (bws-cockpit writes it).
  on('state.set', { plugin: 'bws-cockpit', key: 'tabEvent' }, async ($, e, next) => {
    const ev = parseEvent(e.value)
    if (ev?.plugin === 'bws-direction' && PRESSES.includes(ev.id)) await press($, ev.id).catch(() => $.ui.log(failLine('tab', 'error'), { to: 'debug' }))
    return next(e)
  })
}
