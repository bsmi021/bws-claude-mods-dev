// bws-memory: after a turn a small model decides whether the user said something worth remembering; if so a fork
// is asked for memory entries as JSON and this mod writes them (a tool-less fork cannot), redacted and de-duplicated,
// into a folder of its own. The turn never waits: the work starts after turn.complete has returned.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { View, Written } from '../types'
import { bound, classifyThenFork, failLine as kitFailLine, runFork } from './kit/classify-fork'
import type { KitModel } from './kit/classify-fork'
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
  memorySummary,
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
  textOnlyPrompt,
  UNDO_FILE,
  undoneText,
  upsertIndex,
  type Change,
  type Existing,
} from './memory'

const PANE = 'bws-memory'
const view = atom({ plugin: 'bws-memory', key: 'view' } as const, IDLE_VIEW)
const summary = atom({ plugin: 'bws-memory', key: 'summary' } as const, null)

// The options, copied in by register on every load.
let dirOption = ''
let minWords = 8
let classifierModel = 'haiku'

// The running-fork guard and the conversation it belongs to. `generation` moves on /clear, /resume and a changed
// session id (/branch), so a run that started before cannot write after, and the guard cannot stay stuck.
let running = false
let generation = 0
let lastSession = ''

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

async function setView($: EngineInterface, v: View) {
  await update($, view, () => v)
  await update($, summary, () => memorySummary(v))
}

async function closePane($: EngineInterface) {
  await setView($, IDLE_VIEW)
  await $.ui.close({ id: PANE })
}

// Opens the pane fresh: close first, so it is never mounted twice.
async function openPane($: EngineInterface) {
  await $.ui.close({ id: PANE })
  const r = await $.ui.open({ id: PANE, title: 'Memory' })
  if (!r.isPlaced) $.ui.toast(`Memory: pane not shown (${r.reason}). /memories lists the writes.`)
}

// /clear, /resume, a new session id: drop the guard and the pane; work in flight is left to finish and is dropped.
async function resetWork($: EngineInterface) {
  generation++
  running = false
  await closePane($)
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

// /remember's fork JSON, or the reason there is none. With nothing to fork (a first command, or after /clear) it asks
// `complete` with the text alone.
async function askForced($: EngineInterface, existing: readonly Existing[], text: string): Promise<{ text: string } | { reason: string }> {
  const f = await runFork(kitModel($), { prompt: forkPrompt(existing, text), timeoutMs: FORK_TIMEOUT_MS })
  if (f.ok) return { text: f.text }
  if (f.reason !== 'nothing-to-fork') return { reason: f.reason }
  const stop = new AbortController()
  const c = await bound(
    $.model.complete({ model: await $.session.model(), prompt: textOnlyPrompt(existing, text), maxTokens: 3000, timeoutMs: FORK_TIMEOUT_MS }, { signal: stop.signal }),
    (ms, fn) => $.clock.after(ms, fn),
    { timeoutMs: FORK_TIMEOUT_MS, signal: stop.signal },
  )
  if (!c.ok) {
    stop.abort()
    return { reason: c.reason }
  }
  return c.value.isAnswered ? { text: c.value.text } : { reason: c.value.reason }
}

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
      await openPane($)
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
  const base = { isHeadless, agentId: e.agentId, reason: e.reason, isRunning: running, minWords, userWords: Number.MAX_SAFE_INTEGER, tools: 0 }
  if (skipReason(base) !== null) return
  const rows = (await $.session.messages()).map(m => ({ role: m.role, text: m.text ?? '', toolUses: m.toolUses.map(t => ({ tool: t.tool })) }))
  const ex = exchangeOf(rows, e.answer)
  if (skipReason({ ...base, isRunning: running, userWords: ex.userWords, tools: ex.tools }) !== null) return
  await runMemory($, { material: ex.material })
}

async function remember($: EngineInterface, text: string): Promise<string> {
  await syncSession($)
  if (running) return 'A memory update is already running; try again in a moment.'
  const isHeadless = (await $.session.surfaces()).length === 0
  // Headless the process may end once the command returns, so the work is awaited; with a screen it runs behind.
  if (isHeadless) return (await runMemory($, { forced: text })).text
  running = true
  $.clock.after(10, () => void runMemory($, { forced: text }).catch(() => undefined))
  return 'Remembering... the pane lists what changed.'
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

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'remember', description: 'Save something to memory now (no classifier): /remember <text>', argumentHint: '<text>' })
    await $.command.register({ name: 'memories', description: 'List the last 20 memory writes and the session each came from', immediate: true })
    await $.command.register({ name: 'memory-undo', description: 'Restore the files the last memory write changed (one level)', immediate: true })
    await update($, summary, () => memorySummary(IDLE_VIEW))
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

  on('command.run', { command: 'memory-undo' }, async $ => ({ text: await undo($).catch(() => 'Nothing was undone. (error)') }))

  // The one turn.complete hook. It returns at once; the work starts after it has, so the turn never waits.
  on('turn.complete', async ($, e, next) => {
    $.clock.after(10, () => void afterTurn($, e).catch(() => $.ui.log(failLine('turn', 'error'), { to: 'debug' })))
    return next(e)
  })

  // /clear and /resume end the conversation: no work for it continues, the guard resets and the pane closes.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') await resetWork($).catch(() => undefined)
    return next(e)
  })

  // Closed by the person (Esc, its mark): the update is acknowledged.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') {
      const v = await read($, view)
      if (v.phase !== 'working') await setView($, IDLE_VIEW)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const v = await read($, view)
    const { Box, Button, Text } = $.ui.resolve(e)
    if (v.phase === 'working') return <Text color="cyan">memory updating...</Text>
    if (v.phase === 'error') {
      return (
        <Box flexDirection="column">
          <Text color="yellow">Memory not saved: {v.note}</Text>
          <Button key="close" label="Close" hotkey="c" onPress={() => closePane($)} />
        </Box>
      )
    }
    if (v.phase === 'idle') return <Text dimColor>No memory changes.</Text>
    return (
      <Box flexDirection="column">
        <Text color="green">
          Memory updated: {v.written.length} file{v.written.length === 1 ? '' : 's'}
        </Text>
        {v.written.map(w => (
          <Text key={w.file} wrap="truncate-end">
            {w.kind === 'new' ? 'new ' : 'edit'} {w.file} +{w.added} -{w.removed}
          </Text>
        ))}
        <Button key="close" label="Close" hotkey="c" onPress={() => closePane($)} />
      </Box>
    )
  })
}
