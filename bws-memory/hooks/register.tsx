// bws-memory: after a turn a small model decides whether the user said something worth remembering; if so a fork
// is asked for memory entries as JSON and this mod writes them (a tool-less fork cannot), redacted and de-duplicated,
// into a folder of its own. The turn never waits: the work starts after turn.complete has returned.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { DreamView, View, Written } from '../types'
import { bound, classifyThenFork, failLine as kitFailLine, runFork } from './kit/classify-fork'
import type { KitModel } from './kit/classify-fork'
import { parseEvent } from './kit/tab'
import { memoryTab } from './tab'
import {
  addSources,
  CLASSIFY_QUESTION,
  CLASSIFY_TIMEOUT_MS,
  cleanEntries,
  descriptionOf,
  exchangeOf,
  failLine,
  FORK_TIMEOUT_MS,
  forkPrompt,
  IDLE_VIEW,
  indexLine,
  INDEX_FILE,
  joinPath,
  memoriesText,
  parseEntries,
  parseMinWords,
  parseSources,
  parseUndo,
  planWrites,
  PLUGIN,
  readExisting,
  rememberUsage,
  resolveDir,
  resultText,
  skipReason,
  SOURCES_FILE,
  UNDO_FILE,
  undoneText,
  upsertIndex,
  type Change,
  type Existing,
} from './memory'
import {
  cleanPlan,
  dreamFailLine,
  dreamFiles,
  dreamPrompt,
  FORK_DREAM_TIMEOUT_MS,
  parseDreamPlan,
  planText,
  sessionsByFile,
  validatePlan,
  type DreamAction,
} from './dream'
import {
  actionLine,
  actionSessions,
  appliedText,
  backupName,
  BACKUP_DIR,
  basesOf,
  combinedSummary,
  counts,
  countsText,
  dreamChanges,
  dreamIndex,
  dreamOnCompact,
  dreamSources,
  dreamStatusText,
  dreamUndoText,
  fromLine,
  IDLE_DREAM,
  latestBackup,
  parseEveryTurns,
  RESTORED_MARK,
  SHOWN_ACTIONS,
  staleFiles,
} from './dreamapply'

const view = atom({ plugin: 'bws-memory', key: 'view' } as const, IDLE_VIEW)
const dream = atom({ plugin: 'bws-memory', key: 'dream' } as const, IDLE_DREAM)
const summary = atom({ plugin: 'bws-memory', key: 'summary' } as const, null)
// The Memory tab bws-cockpit draws in its dashboard (bws-kit/tab.ts): memory updates and the dream, as two cards.
const tab = atom({ plugin: 'bws-memory', key: 'tab' } as const, null as unknown)
// Counts up to bring the tab up: a memory write, a dream plan or result.
let raiseCount = 0

// The options, copied in by register on every load.
let dirOption = ''
let minWords = 8
let classifierModel = 'haiku'

// The running-fork guard and the conversation it belongs to. `generation` moves on /clear, /resume and a changed
// session id (/branch), so a run that started before cannot write after, and the guard cannot stay stuck.
let running = false
let generation = 0
let lastSession = ''
// What the two atoms hold, mirrored so the chip can be worked out from both without a read.
let viewNow: View = IDLE_VIEW
let dreamNow: DreamView = IDLE_DREAM
// The automatic trigger (FR-DP-03): turns since the last one, and every how many (0 = off).
let dreamEvery = 20
let turnCount = 0
// The trigger fired and the preview run has not started yet (a memory update was running, or it is about to start).
let autoPending = false

async function settle<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p
  } catch {
    return undefined
  }
}

// The adapter classify-fork runs on: the mods API calls and nothing else.
function kitModel($: EngineInterface): KitModel {
  return {
    classify: (text, labels, options) => $.model.classify(text, labels, options),
    complete: (request, options) => $.model.complete(request, options),
    fork: request => $.model.fork(request),
    messages: async () => (await $.session.messages()).map(m => ({ role: m.role, text: m.text ?? '', toolUses: m.toolUses.map(t => ({ tool: t.tool })) })),
    sessionModel: () => $.session.model(),
    after: (ms, fn) => $.clock.after(ms, fn),
  }
}

async function publishTab($: EngineInterface) {
  await update($, tab, () => memoryTab(viewNow, dreamNow, { raise: raiseCount }))
}

async function setView($: EngineInterface, v: View) {
  viewNow = v
  await update($, view, () => v)
  await update($, summary, () => combinedSummary(v, dreamNow))
  await publishTab($)
}

async function setDream($: EngineInterface, d: DreamView) {
  dreamNow = d
  await update($, dream, () => d)
  await update($, summary, () => combinedSummary(viewNow, d))
  await publishTab($)
}

// News for the Memory tab: bws-cockpit brings it up (its rule: not while the person uses the dashboard, not after
// they closed it). Without bws-cockpit (no /dashboard command) a toast says where to look.
async function announce($: EngineInterface, fallback: string) {
  if ((await $.command.list()).some(c => c.name === 'dashboard')) {
    raiseCount += 1
    await publishTab($)
  } else $.ui.toast(fallback)
}

// /clear, /resume, a new session id: drop the guard and the view; work in flight is left to finish and is dropped.
async function resetWork($: EngineInterface) {
  generation++
  running = false
  await setView($, IDLE_VIEW)
  // A dream that was planning is dropped; a plan on screen belongs to the folder, not the conversation, but it goes
  // with it: the trigger stays due so the tab says so.
  if (dreamNow.phase !== 'idle') await setDream($, { ...IDLE_DREAM, due: dreamNow.due })
  turnCount = 0
  autoPending = false
}

async function syncSession($: EngineInterface) {
  const id = await $.session.id()
  if (lastSession !== '' && lastSession !== id) await resetWork($)
  lastSession = id
}

async function dirNow($: EngineInterface): Promise<string> {
  return resolveDir(dirOption, await $.session.cwd())
}

async function readText($: EngineInterface, path: string): Promise<string | null> {
  const t = await settle($.fs.read(path))
  return typeof t === 'string' ? t : null
}

async function loadExisting($: EngineInterface, dir: string): Promise<{ list: Existing[]; full: Map<string, string> }> {
  const entries = (await settle($.fs.list(dir))) ?? []
  const list: Existing[] = []
  const full = new Map<string, string>()
  for (const f of entries) {
    if (f.kind !== 'file' || !f.name.toLowerCase().endsWith('.md') || f.name.toLowerCase() === INDEX_FILE.toLowerCase()) continue
    const text = await readText($, joinPath(dir, f.name))
    if (text === null) continue
    full.set(f.name, text)
    list.push(readExisting(f.name, text))
  }
  return { list, full }
}

// A model's reply to one prompt: the fork, or `complete` with the prompt alone when there is nothing to fork (a first
// command, or after /clear, or headless). /remember and /dream both ask this way.
async function askText($: EngineInterface, prompt: string, timeoutMs: number): Promise<{ text: string } | { reason: string }> {
  const f = await runFork(kitModel($), { prompt, timeoutMs })
  if (f.ok) return { text: f.text }
  if (f.reason !== 'nothing-to-fork') return { reason: f.reason }
  const stop = new AbortController()
  const c = await bound(
    $.model.complete({ model: await $.session.model(), prompt, maxTokens: 3000, timeoutMs }, { signal: stop.signal }),
    (ms, fn) => $.clock.after(ms, fn),
    { timeoutMs, signal: stop.signal },
  )
  if (!c.ok) {
    stop.abort()
    return { reason: c.reason }
  }
  return c.value.isAnswered ? { text: c.value.text } : { reason: c.value.reason }
}

// /remember's fork JSON, or the reason there is none.
const askForced = ($: EngineInterface, existing: readonly Existing[], text: string) => askText($, forkPrompt(existing, text), FORK_TIMEOUT_MS)

// Writes the plan: the undo record first, then the files, MEMORY.md and sources.json. Returns what was written.
async function writePlan($: EngineInterface, dir: string, session: string, plan: readonly Change[]): Promise<Written[]> {
  const real = plan.filter(c => c.kind !== 'duplicate')
  if (real.length === 0) return []
  const indexPath = joinPath(dir, INDEX_FILE)
  const sourcesPath = joinPath(dir, SOURCES_FILE)
  const oldIndex = await readText($, indexPath)
  const oldSources = await readText($, sourcesPath)
  const at = await $.clock.now()
  await $.fs.write(joinPath(dir, UNDO_FILE), JSON.stringify({ at, files: real.map(c => ({ file: c.file, before: c.before })), index: oldIndex, sources: oldSources }, null, 2))
  for (const c of real) await $.fs.write(joinPath(dir, c.file), c.after)
  const lines = real.map(c => ({ file: c.file, line: indexLine({ file: c.file, name: c.name, description: descriptionOf(c.after) }) }))
  await $.fs.write(indexPath, upsertIndex(oldIndex ?? '', lines))
  const written: Written[] = real.map(c => ({ file: c.file, kind: c.kind === 'new' ? 'new' : 'update', added: c.added, removed: c.removed }))
  await $.fs.write(sourcesPath, JSON.stringify(addSources(parseSources(oldSources ?? ''), written, session, at), null, 2))
  return written
}

type RunResult = { text: string; changed: boolean }

// One memory run. `forced` is /remember's text (no classifier); otherwise `material` is the exchange to classify.
// Never throws: any failure leaves the files as they were, logs one debug line and shows a warning chip.
async function runMemory($: EngineInterface, o: { forced?: string; material?: string }): Promise<RunResult> {
  const gen = generation
  running = true
  const fail = async (step: string, reason: string): Promise<RunResult> => {
    $.ui.log(failLine(step, reason), { to: 'debug' })
    if (gen === generation) await setView($, { phase: 'error', written: [], note: `${step}: ${reason}` })
    return { text: `Memory not saved. (${step}: ${reason})`, changed: false }
  }
  try {
    await setView($, { phase: 'working', written: [], note: '' })
    const session = await $.session.id()
    const dir = await dirNow($)
    const { list } = await loadExisting($, dir)
    let reply: string
    if (o.forced === undefined) {
      const out = await classifyThenFork(kitModel($), {
        gate: { question: CLASSIFY_QUESTION, material: o.material ?? '', model: classifierModel, timeoutMs: CLASSIFY_TIMEOUT_MS },
        fork: { prompt: forkPrompt(list), timeoutMs: FORK_TIMEOUT_MS },
      })
      if (out.kind === 'no') {
        if (gen === generation) await setView($, IDLE_VIEW)
        return { text: 'Nothing was worth saving.', changed: false }
      }
      if (out.kind === 'failed') {
        $.ui.log(kitFailLine(PLUGIN, out), { to: 'debug' })
        if (gen === generation) await setView($, { phase: 'error', written: [], note: `${out.step}: ${out.reason}` })
        return { text: `Memory not saved. (${out.step}: ${out.reason})`, changed: false }
      }
      reply = out.text
    } else {
      const r = await askForced($, list, o.forced)
      if ('reason' in r) return await fail('fork', r.reason)
      reply = r.text
    }
    // /clear, /resume or a new session while the fork ran: its entries belong to a conversation that is gone.
    if (gen !== generation) {
      $.ui.log(failLine('write', 'the conversation changed'), { to: 'debug' })
      return { text: 'Memory not saved. (the conversation changed)', changed: false }
    }
    const parsed = parseEntries(reply)
    if (parsed === null) return await fail('parse', 'unreadable reply')
    const clean = cleanEntries(parsed.entries)
    if (clean.mostlySecrets) return await fail('redact', 'the reply was mostly secrets; dropped')
    const now = await loadExisting($, dir)
    const plan = planWrites(clean.entries, now.list, now.full)
    const written = await writePlan($, dir, session, plan)
    if (written.length === 0) {
      if (gen === generation) await setView($, IDLE_VIEW)
      return { text: resultText([], plan.length), changed: false }
    }
    if (gen === generation) {
      await setView($, { phase: 'done', written, note: '' })
      await announce($, `Memory updated: ${written.length} file${written.length === 1 ? '' : 's'}. /memories lists the writes.`)
    }
    return { text: resultText(written, 0), changed: true }
  } catch (err) {
    return await fail('write', err instanceof Error ? err.message.slice(0, 80) : 'error')
  } finally {
    if (gen === generation) running = false
  }
}

// Looks at the turn that just ended and starts a run when it is worth one. Runs after turn.complete returned.
async function afterTurn($: EngineInterface, e: { answer: string; reason: string; agentId?: string }) {
  await syncSession($)
  const isHeadless = (await $.session.surfaces()).length === 0
  // FR-DP-03: only the user's own answered turns on a screen count towards the next dream.
  if (!isHeadless && e.agentId === undefined && e.reason === 'answer') await noteTurn($)
  await memoryTurn($, e, isHeadless)
  await maybeAutoDream($)
}

async function memoryTurn($: EngineInterface, e: { answer: string; reason: string; agentId?: string }, isHeadless: boolean) {
  const base = { isHeadless, agentId: e.agentId, reason: e.reason, isRunning: running, minWords, userWords: Number.MAX_SAFE_INTEGER, tools: 0 }
  if (skipReason(base) !== null) return
  const rows = (await $.session.messages()).map(m => ({ role: m.role, text: m.text ?? '', toolUses: m.toolUses.map(t => ({ tool: t.tool })) }))
  const ex = exchangeOf(rows, e.answer)
  if (skipReason({ ...base, isRunning: running, userWords: ex.userWords, tools: ex.tools }) !== null) return
  await runMemory($, { material: ex.material })
}

// FR-DP-03: the live memory files a dream could work on.
async function liveFileCount($: EngineInterface): Promise<number> {
  const { full } = await loadExisting($, await dirNow($))
  return dreamFiles([...full].map(([file, text]) => ({ file, text }))).files.length
}

// The trigger fired (every `dreamEveryTurns` turns, or before a compaction): the dream is due, and a preview run will
// start as soon as nothing else is writing. It never applies. Nothing happens with fewer than two files, with a plan
// already waiting, or when the option is 0.
async function markDue($: EngineInterface) {
  turnCount = 0
  if (dreamEvery <= 0) return
  if (dreamNow.phase === 'preview' || dreamNow.phase === 'working') return
  if ((await liveFileCount($)) < 2) return
  await setDream($, { ...IDLE_DREAM, due: true })
  autoPending = true
}

async function noteTurn($: EngineInterface) {
  turnCount++
  if (dreamEvery > 0 && turnCount >= dreamEvery) await markDue($)
}

// Starts the pending automatic preview when the memory folder is not busy. Called after every turn's own work, so a
// trigger that found a memory update running starts once it has finished.
async function maybeAutoDream($: EngineInterface) {
  if (!autoPending || running || dreamNow.phase !== 'idle') return
  autoPending = false
  await runDream($, { apply: false, auto: true, headless: false })
}

async function remember($: EngineInterface, text: string): Promise<string> {
  await syncSession($)
  if (running) return 'A memory update is already running; try again in a moment.'
  const isHeadless = (await $.session.surfaces()).length === 0
  // Headless the process may end once the command returns, so the work is awaited; with a screen it runs behind.
  if (isHeadless) return (await runMemory($, { forced: text })).text
  running = true
  $.clock.after(10, () => void runMemory($, { forced: text }).catch(() => undefined))
  return 'Remembering... the Memory tab lists what changed.'
}

type Planned =
  | { ok: true; actions: DreamAction[]; skipped: number; sessions: Record<string, string[]>; bases: Record<string, string> }
  | { ok: false; step: string; reason: string }

// FR-DP-01: reads every memory file and sources.json, asks the fork (or `complete`) for a plan and checks it. Never writes.
async function planDream($: EngineInterface): Promise<Planned> {
  const dir = await dirNow($)
  const { full } = await loadExisting($, dir)
  const { files, skipped } = dreamFiles([...full].map(([file, text]) => ({ file, text })))
  if (files.length < 2) return { ok: true, actions: [], skipped, sessions: {}, bases: {} }
  const sources = parseSources((await readText($, joinPath(dir, SOURCES_FILE))) ?? '')
  const bySession = sessionsByFile(sources)
  const r = await askText($, dreamPrompt(files, bySession), FORK_DREAM_TIMEOUT_MS)
  if ('reason' in r) return { ok: false, step: 'fork', reason: r.reason }
  const parsed = parseDreamPlan(r.text)
  if (!parsed.ok) return { ok: false, step: 'parse', reason: parsed.error }
  const valid = validatePlan(parsed.actions, files)
  if (!valid.ok) return { ok: false, step: 'validate', reason: valid.error }
  const clean = cleanPlan(valid.actions)
  if (!clean.ok) return { ok: false, step: 'redact', reason: clean.error }
  const sessions: Record<string, string[]> = {}
  for (const a of clean.actions) for (const f of a.files) sessions[f] = bySession.get(f) ?? []
  return { ok: true, actions: clean.actions, skipped, sessions, bases: basesOf(clean.actions, files) }
}

type Applied = { ok: true; backup: string } | { ok: false; reason: string }

// FR-DP-02: the folder is copied to <memoryDir>/.dream-backup/<timestamp>/ first, then the plan is written. `bases`
// (from the preview) makes it refuse when a file changed since; null (plan and apply in one go) skips that check.
async function applyDream($: EngineInterface, actions: readonly DreamAction[], bases: Readonly<Record<string, string>> | null): Promise<Applied> {
  const dir = await dirNow($)
  const { full } = await loadExisting($, dir)
  const all = [...full].map(([file, text]) => ({ file, text }))
  const { files } = dreamFiles(all)
  if (bases !== null) {
    const stale = staleFiles(bases, files)
    if (stale.length > 0) return { ok: false, reason: `memory changed since the preview (${stale.join(', ')}); run /dream again` }
  }
  const valid = validatePlan(actions, files)
  if (!valid.ok) return { ok: false, reason: valid.error }
  const changes = dreamChanges(actions, files)
  const indexPath = joinPath(dir, INDEX_FILE)
  const sourcesPath = joinPath(dir, SOURCES_FILE)
  const oldIndex = await readText($, indexPath)
  const oldSources = await readText($, sourcesPath)
  const backup = backupName(await $.clock.now())
  const copy = joinPath(joinPath(dir, BACKUP_DIR), backup)
  for (const f of all) await $.fs.write(joinPath(copy, f.file), f.text)
  if (oldIndex !== null) await $.fs.write(joinPath(copy, INDEX_FILE), oldIndex)
  if (oldSources !== null) await $.fs.write(joinPath(copy, SOURCES_FILE), oldSources)
  for (const c of changes) await $.fs.write(joinPath(dir, c.file), c.after)
  await $.fs.write(indexPath, dreamIndex(oldIndex ?? '', changes))
  await $.fs.write(sourcesPath, JSON.stringify(dreamSources(parseSources(oldSources ?? ''), actions), null, 2))
  // /memory-undo's record describes the folder before this dream: it would undo into a state that is gone.
  await $.fs.write(joinPath(dir, UNDO_FILE), JSON.stringify({ at: 0, files: [], index: null, sources: null }))
  return { ok: true, backup }
}

// A dream plan, result or failure for the person: the Memory tab shows it.
async function openDreamPane($: EngineInterface) {
  await announce($, 'Dream: /dream status says what is waiting; /dream apply applies a plan.')
}

// Dismiss, or Close after a result: nothing waits any more, so the trigger is satisfied too.
async function dismissDream($: EngineInterface) {
  await setDream($, IDLE_DREAM)
}

// Apply the plan the Dream card shows (the button, or `/dream apply` while a preview waits). Returns the text for the command.
async function applyShown($: EngineInterface): Promise<string> {
  const v = dreamNow
  if (v.phase !== 'preview' || v.actions.length === 0) return 'No dream plan is waiting. Run /dream first.'
  if (running) {
    $.ui.toast('Dream: a memory update is running; press Apply again in a moment.')
    return 'A memory update is already running; try again in a moment.'
  }
  running = true
  const gen = generation
  try {
    const r = await applyDream($, v.actions, v.bases)
    if (!r.ok) {
      $.ui.log(dreamFailLine('apply', r.reason), { to: 'debug' })
      await setDream($, { ...v, phase: 'error', note: r.reason })
      return `Dream not applied. (${r.reason}) Nothing changed.`
    }
    await setDream($, { ...v, phase: 'applied', due: false, backup: r.backup, note: '' })
    return appliedText(v.actions, r.backup)
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 80) : 'error'
    $.ui.log(dreamFailLine('apply', reason), { to: 'debug' })
    await setDream($, { ...v, phase: 'error', note: `write: ${reason}` })
    return `Dream not applied. (write: ${reason}) Check /dream undo.`
  } finally {
    if (gen === generation) running = false
  }
}

type DreamOptions = { apply: boolean; auto: boolean; headless: boolean }

// One dream run: plan, then show it (preview) or apply it. `running` is held by the caller's start and released here.
// Never throws. Automatic runs (auto) only preview and stay quiet when they fail; /dream brings up the Memory tab on a failure.
async function runDream($: EngineInterface, o: DreamOptions): Promise<string> {
  const gen = generation
  running = true
  const due = dreamNow.due
  const fail = async (step: string, reason: string): Promise<string> => {
    $.ui.log(dreamFailLine(step, reason), { to: 'debug' })
    if (gen === generation) {
      await setDream($, { ...IDLE_DREAM, phase: 'error', due: due || o.auto, auto: o.auto, note: `${step}: ${reason}` })
      if (!o.auto && !o.headless) await openDreamPane($)
    }
    return `Dream failed. (${step}: ${reason}) Nothing changed.`
  }
  try {
    await setDream($, { ...IDLE_DREAM, phase: 'working', due, auto: o.auto })
    const plan = await planDream($)
    if (gen !== generation) return 'Dream dropped: the conversation changed.'
    if (!plan.ok) return await fail(plan.step, plan.reason)
    if (plan.actions.length === 0) {
      await setDream($, IDLE_DREAM)
      return planText([])
    }
    if (o.apply) {
      const r = await applyDream($, plan.actions, null)
      if (gen !== generation) return 'Dream dropped: the conversation changed.'
      if (!r.ok) return await fail('apply', r.reason)
      await setDream($, { ...IDLE_DREAM, phase: 'applied', actions: plan.actions, sessions: plan.sessions, backup: r.backup })
      if (!o.headless) await openDreamPane($)
      return appliedText(plan.actions, r.backup)
    }
    await setDream($, { ...IDLE_DREAM, phase: 'preview', due, auto: o.auto, actions: plan.actions, sessions: plan.sessions, bases: plan.bases, skipped: plan.skipped })
    if (!o.headless) await openDreamPane($)
    return `${planText(plan.actions, plan.skipped)}\n(A preview: nothing changed. /dream apply applies it${o.headless ? ' in one command' : ', or Apply in the Memory tab'}.)`
  } catch (err) {
    return await fail('run', err instanceof Error ? err.message.slice(0, 80) : 'error')
  } finally {
    if (gen === generation) running = false
  }
}

// A button in the Memory tab. What the commands would print goes to a toast.
async function tabPress($: EngineInterface, id: string) {
  if (id === 'memory-ok') {
    if (viewNow.phase !== 'working') await setView($, IDLE_VIEW)
  } else if (id === 'memory-undo') {
    $.ui.toast(await undo($))
    if (viewNow.phase !== 'working') await setView($, IDLE_VIEW)
  }
  else if (id === 'dream-plan') $.ui.toast(await dreamCommand($, ''))
  else if (id === 'dream-apply') $.ui.toast(await applyShown($))
  else if (id === 'dream-dismiss') await dreamCommand($, 'dismiss')
}

// /dream [apply | undo | status]. `apply` with a preview waiting applies that preview; otherwise it plans and applies in
// one go. Headless the work is awaited (the process may end when the command returns); with a screen it runs behind.
async function dreamCommand($: EngineInterface, args: string): Promise<string> {
  await syncSession($)
  const a = args.trim().toLowerCase().replace(/^--?/, '')
  if (a === 'status') return dreamStatusText(dreamNow, dreamEvery, turnCount)
  if (a === 'undo') return await undoDream($)
  if (a === 'dismiss') {
    if (dreamNow.phase === 'working') return 'A dream is being planned; dismiss it once it shows.'
    if (dreamNow.phase === 'idle') return 'No dream plan is waiting.'
    await dismissDream($)
    return 'Dream dismissed. Nothing changed.'
  }
  if (a !== '' && a !== 'apply') return 'Usage: /dream [apply | dismiss | undo | status]'
  if (a === 'apply' && dreamNow.phase === 'preview') return await applyShown($)
  if (running) return 'A memory update is already running; try again in a moment.'
  const isHeadless = (await $.session.surfaces()).length === 0
  const o = { apply: a === 'apply', auto: false, headless: isHeadless }
  if (isHeadless) return await runDream($, o)
  running = true
  $.clock.after(10, () => void runDream($, o).catch(() => undefined))
  return `Dreaming... the Memory tab shows the ${o.apply ? 'result' : 'plan'}.`
}

// FR-DP-02: puts back the newest .dream-backup folder, once.
async function undoDream($: EngineInterface): Promise<string> {
  if (running) return 'A memory update is already running; try again in a moment.'
  const dir = await dirNow($)
  const root = joinPath(dir, BACKUP_DIR)
  const names = ((await settle($.fs.list(root))) ?? []).filter(f => f.kind === 'dir').map(f => f.name)
  const name = latestBackup(names)
  if (name === null) return 'No dream backup to restore.'
  const from = joinPath(root, name)
  const items = (await settle($.fs.list(from))) ?? []
  if (items.some(f => f.name === RESTORED_MARK)) return `The latest dream backup (${name}) was already restored.`
  let restored = 0
  for (const f of items) {
    if (f.kind !== 'file') continue
    const text = await readText($, joinPath(from, f.name))
    if (text === null) continue
    await $.fs.write(joinPath(dir, f.name), text)
    if (f.name.toLowerCase().endsWith('.md') && f.name !== INDEX_FILE) restored++
  }
  await $.fs.write(joinPath(from, RESTORED_MARK), JSON.stringify({ at: await $.clock.now() }))
  await $.fs.write(joinPath(dir, UNDO_FILE), JSON.stringify({ at: 0, files: [], index: null, sources: null }))
  if (dreamNow.phase === 'preview' || dreamNow.phase === 'applied') await dismissDream($)
  return dreamUndoText(name, restored)
}

async function undo($: EngineInterface): Promise<string> {
  const dir = await dirNow($)
  const rec = parseUndo(await readText($, joinPath(dir, UNDO_FILE)))
  if (!rec || rec.files.length === 0) return 'Nothing to undo.'
  for (const f of rec.files) await $.fs.write(joinPath(dir, f.file), f.before ?? '')
  await $.fs.write(joinPath(dir, INDEX_FILE), rec.index ?? '')
  await $.fs.write(joinPath(dir, SOURCES_FILE), rec.sources ?? JSON.stringify({ writes: [] }))
  await $.fs.write(joinPath(dir, UNDO_FILE), JSON.stringify({ at: 0, files: [], index: null, sources: null }))
  return undoneText(rec)
}

export const register: Register = (on, options) => {
  dirOption = typeof options.memoryDir === 'string' ? options.memoryDir : ''
  minWords = parseMinWords(options.minWords)
  classifierModel = String(options.model ?? '').trim() || 'haiku'
  running = false
  lastSession = ''
  viewNow = IDLE_VIEW
  dreamNow = IDLE_DREAM
  turnCount = 0
  autoPending = false
  dreamEvery = parseEveryTurns(options.dreamEveryTurns)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'remember', description: 'Save something to memory now (no classifier): /remember <text>', argumentHint: '<text>' })
    await $.command.register({ name: 'memories', description: 'List the last 20 memory writes and the session each came from', immediate: true })
    await $.command.register({ name: 'dream', description: 'Consolidate the memory: merge duplicates, drop stale entries, rewrite for clarity: /dream [apply | dismiss | undo | status]', argumentHint: '[apply | dismiss | undo | status]' })
    await $.command.register({ name: 'memory-undo', description: 'Restore the files the last memory write changed (one level)', immediate: true })
    dreamNow = await read($, dream)
    // A dream that was planning when the mod reloaded is gone: a waiting plan stays, a lost one is not shown as running.
    if (dreamNow.phase === 'working') await setDream($, { ...IDLE_DREAM, due: dreamNow.due })
    await update($, summary, () => combinedSummary(IDLE_VIEW, dreamNow))
    await publishTab($)
    return next(e)
  })

  on('command.run', { command: 'remember' }, async ($, e) => {
    const text = e.args.trim()
    if (text === '') return { text: rememberUsage }
    return { text: await remember($, text).catch(() => 'Memory not saved. (error)') }
  })

  on('command.run', { command: 'memories' }, async $ => {
    const dir = await dirNow($)
    return { text: memoriesText(parseSources((await readText($, joinPath(dir, SOURCES_FILE))) ?? '')) }
  })

  on('command.run', { command: 'dream' }, async ($, e) => ({ text: await dreamCommand($, e.args).catch(() => 'Dream failed. (error) Nothing changed.') }))

  on('command.run', { command: 'memory-undo' }, async $ => ({ text: await undo($).catch(() => 'Nothing was undone. (error)') }))

  // The one turn.complete hook. It returns at once; the work starts after it has, so the turn never waits.
  on('turn.complete', async ($, e, next) => {
    $.clock.after(10, () => void afterTurn($, e).catch(() => $.ui.log(failLine('turn', 'error'), { to: 'debug' })))
    return next(e)
  })

  // FR-DP-03: before a compaction the memory is due a dream. The compaction is never held up: the hook returns at once
  // and the preview starts behind it.
  on('session.compact', async ($, e, next) => {
    if (dreamOnCompact(e.trigger, e.agentId)) {
      $.clock.after(10, () =>
        void (async () => {
          if ((await $.session.surfaces()).length === 0) return
          await markDue($)
          await maybeAutoDream($)
        })().catch(() => $.ui.log(dreamFailLine('trigger', 'error'), { to: 'debug' })),
      )
    }
    return next(e)
  })

  // /clear and /resume end the conversation: no work for it continues and the guard resets.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') await resetWork($).catch(() => undefined)
    return next(e)
  })

  // A press in the Memory tab (bws-cockpit writes it): acknowledge or undo a memory write; plan, apply or dismiss a dream.
  on('state.set', { plugin: 'bws-cockpit', key: 'tabEvent' }, async ($, e, next) => {
    const ev = parseEvent(e.value)
    if (ev?.plugin === 'bws-memory') await tabPress($, ev.id).catch(() => $.ui.log(failLine('tab', 'error'), { to: 'debug' }))
    return next(e)
  })
}
